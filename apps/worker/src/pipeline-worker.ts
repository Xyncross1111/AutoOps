import { join } from "node:path";

import {
  decryptSecret,
  parsePipelineConfig,
  selectRollbackRevision,
  type DeploymentTargetSummary,
  type DeploymentRevisionSummary,
  type PipelineConfig
} from "@autoops/core";
import type { AutoOpsDb, ClaimedRun } from "@autoops/db";

import type { WorkerConfig } from "./config.js";
import type { GitHubAppService } from "./github-app.js";
import type { ExecutionInfrastructure } from "./shell-infrastructure.js";

export class PipelineWorker {
  constructor(
    private readonly db: AutoOpsDb,
    private readonly github: GitHubAppService,
    private readonly infra: ExecutionInfrastructure,
    private readonly config: WorkerConfig
  ) {}

  async start(): Promise<void> {
    while (true) {
      try {
        await this.processOnce();
      } catch (error) {
        console.error("Worker loop failed:", error);
      }
      await sleep(this.config.WORKER_POLL_INTERVAL_MS);
    }
  }

  async processOnce(): Promise<boolean> {
    const run = await this.db.claimNextQueuedRun();
    if (!run) {
      return false;
    }
    try {
      if (run.source === "manual_rollback" && run.metadata.manualRollback) {
        await this.handleManualRollback(run);
      } else {
        await this.handlePipelineRun(run);
      }
      await this.db.setRunStatus(run.id, "succeeded");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown worker failure.";
      await this.db.appendRunLog(run.id, "system", `Run failed: ${message}`);
      await this.db.setRunStatus(run.id, "failed", message);
      return true;
    }
  }

  private async handlePipelineRun(run: ClaimedRun): Promise<void> {
    let workdir = "";
    try {
      let pipelineConfig: PipelineConfig | null = run.pipelineConfig;
      const secrets = await this.loadProjectSecrets(run.projectId);
      const log = async (stageName: string, line: string) => {
        await this.db.appendRunLog(run.id, stageName, line);
      };

      await this.runStage(run.id, "prepare", 1, async () => {
        const token = await this.github.createInstallationToken(run.installationId);
        workdir = await this.infra.cloneRepository({
          owner: run.repoOwner,
          repo: run.repoName,
          commitSha: run.commitSha,
          token,
          baseTempDir: this.config.RUNNER_TEMP_DIR,
          onOutput: (line) => log("prepare", line)
        });
        if (!pipelineConfig) {
          const rawConfig = await this.infra.readFile(join(workdir, run.configPath));
          pipelineConfig = parsePipelineConfig(rawConfig);
        }
        await log("prepare", `Checked out ${run.repoOwner}/${run.repoName} at ${run.commitSha}.`);
      });

      if (!pipelineConfig) {
        throw new Error("Pipeline configuration could not be resolved.");
      }
      const resolvedPipelineConfig = pipelineConfig;

      const targets = await this.db.syncDeploymentTargets(
        run.projectId,
        resolvedPipelineConfig.deploy.targets.map((target) => ({
          name: target.name,
          hostRef: target.hostRef,
          composeFile: target.composeFile,
          service: target.service,
          healthcheckUrl: target.healthcheck.url
        }))
      );

      const localTag = `autoops-local:${run.id}`;
      const shortSha = run.commitSha.slice(0, 12);
      const versionTag = `${resolvedPipelineConfig.build.image}:${shortSha}`;
      const ghcrUsername = requireSecret(secrets, "ghcr_username");
      const ghcrToken = requireSecret(secrets, "ghcr_token");

      await this.runStage(run.id, "build", 2, async () => {
        await this.infra.buildImage({
          workdir,
          context: resolvedPipelineConfig.build.context,
          dockerfile: resolvedPipelineConfig.build.dockerfile,
          localTag,
          onOutput: (line) => log("build", line)
        });
        await log("build", `Built local image ${localTag}.`);
      });

      await this.runStage(run.id, "test", 3, async () => {
        await this.infra.runTestCommands({
          imageTag: localTag,
          commands: resolvedPipelineConfig.test.commands,
          onOutput: (line) => log("test", line)
        });
        await log("test", "Test commands completed successfully.");
      });

      const pushedImage = await this.runStage(run.id, "deploy", 4, async () => {
        const pushed = await this.infra.pushImage({
          baseImage: resolvedPipelineConfig.build.image,
          localTag,
          versionTag,
          username: ghcrUsername,
          token: ghcrToken,
          onOutput: (line) => log("deploy", line)
        });
        await log("deploy", `Pushed image ${pushed.imageRef}@${pushed.imageDigest}.`);

        for (const target of resolvedPipelineConfig.deploy.targets) {
          const targetSummary = findTargetSummary(targets, target.name);
          const connection = resolveTargetSecrets(secrets, target.hostRef);
          try {
            await log("deploy", `Deploying to ${target.name} on ${connection.host}.`);
            await this.infra.deployComposeTarget({
              host: connection.host,
              user: connection.user,
              privateKey: connection.privateKey,
              port: connection.port,
              composeFile: target.composeFile,
              service: target.service,
              imageRef: pushed.imageRef,
              imageDigest: pushed.imageDigest,
              onOutput: (line) => log("deploy", `[${target.name}] ${line}`)
            });
            await this.infra.waitForHealthcheck({
              url: target.healthcheck.url,
              timeoutSeconds: target.healthcheck.timeoutSeconds,
              onOutput: (line) => log("deploy", `[${target.name}] ${line}`)
            });
            await this.db.createDeploymentRevision({
              targetId: targetSummary.id,
              runId: run.id,
              imageRef: pushed.imageRef,
              imageDigest: pushed.imageDigest,
              status: "succeeded"
            });
            await this.db.markDeploymentTargetStatus({
              targetId: targetSummary.id,
              lastStatus: "succeeded",
              lastDeployedImage: `${pushed.imageRef}@${pushed.imageDigest}`,
              lastError: null
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Deployment failed.";
            await this.db.markDeploymentTargetStatus({
              targetId: targetSummary.id,
              lastStatus: "failed",
              lastError: message
            });
            await this.performAutomaticRollback(
              run,
              targetSummary,
              target.healthcheck.url,
              target.healthcheck.timeoutSeconds,
              connection,
              log
            );
            throw error;
          }
        }
        return pushed;
      });

      await this.db.appendRunLog(
        run.id,
        "deploy",
        `Deployment completed with ${pushedImage.imageRef}@${pushedImage.imageDigest}.`
      );
    } finally {
      if (workdir) {
        await this.infra.cleanupPath(workdir);
      }
    }
  }

  private async handleManualRollback(run: ClaimedRun): Promise<void> {
    const request = run.metadata.manualRollback;
    if (!request) {
      throw new Error("Manual rollback metadata is missing.");
    }

    const target = await this.db.getDeploymentTargetById(request.targetId);
    const revision = await this.db.getRevision(request.revisionId);
    if (!target || !revision) {
      throw new Error("Rollback target or revision was not found.");
    }

    const secrets = await this.loadProjectSecrets(run.projectId);
    const connection = resolveTargetSecrets(secrets, target.hostRef);
    const rollbackEventId = await this.db.createRollbackEvent({
      targetId: target.id,
      runId: run.id,
      fromRevisionId: null,
      toRevisionId: revision.id,
      status: "running",
      mode: "manual",
      initiatedBy: request.initiatedBy
    });

    try {
      await this.runStage(run.id, "rollback", 1, async () => {
        await this.db.appendRunLog(
          run.id,
          "rollback",
          `Rolling back ${target.name} to ${revision.imageRef}@${revision.imageDigest}.`
        );
        await this.infra.deployComposeTarget({
          host: connection.host,
          user: connection.user,
          privateKey: connection.privateKey,
          port: connection.port,
          composeFile: target.composeFile,
          service: target.service,
          imageRef: revision.imageRef,
          imageDigest: revision.imageDigest,
          onOutput: (line) => this.db.appendRunLog(run.id, "rollback", line)
        });
        await this.infra.waitForHealthcheck({
          url: target.healthcheckUrl,
          onOutput: (line) => this.db.appendRunLog(run.id, "rollback", line)
        });
        await this.db.createDeploymentRevision({
          targetId: target.id,
          runId: run.id,
          imageRef: revision.imageRef,
          imageDigest: revision.imageDigest,
          status: "succeeded",
          rollbackOfRevisionId: revision.id
        });
        await this.db.markDeploymentTargetStatus({
          targetId: target.id,
          lastStatus: "succeeded",
          lastDeployedImage: `${revision.imageRef}@${revision.imageDigest}`,
          lastError: null
        });
        await this.db.completeRollbackEvent(rollbackEventId, "succeeded");
      });
    } catch (error) {
      await this.db.completeRollbackEvent(
        rollbackEventId,
        "failed",
        error instanceof Error ? error.message : "Manual rollback failed."
      );
      throw error;
    }
  }

  private async performAutomaticRollback(
    run: ClaimedRun,
    target: DeploymentTargetSummary,
    healthcheckUrl: string,
    timeoutSeconds: number | undefined,
    connection: {
      host: string;
      user: string;
      privateKey: string;
      port?: number;
    },
    log: (stageName: string, line: string) => Promise<void>
  ): Promise<void> {
    const revisions = await this.db.listTargetRevisions(target.id);
    const revision = selectRollbackRevision(revisions);
    if (!revision) {
      await log(
        "deploy",
        `No successful revision exists for ${target.name}; rollback skipped.`
      );
      return;
    }
    const rollbackEventId = await this.db.createRollbackEvent({
      targetId: target.id,
      runId: run.id,
      fromRevisionId: null,
      toRevisionId: revision.id,
      status: "running",
      mode: "automatic",
      initiatedBy: "system"
    });
    try {
      await log(
        "deploy",
        `Attempting automatic rollback for ${target.name} to ${revision.imageRef}@${revision.imageDigest}.`
      );
      await this.infra.deployComposeTarget({
        host: connection.host,
        user: connection.user,
        privateKey: connection.privateKey,
        port: connection.port,
        composeFile: target.composeFile,
        service: target.service,
        imageRef: revision.imageRef,
        imageDigest: revision.imageDigest,
        onOutput: (line) => log("deploy", `[rollback:${target.name}] ${line}`)
      });
      await this.infra.waitForHealthcheck({
        url: healthcheckUrl,
        timeoutSeconds,
        onOutput: (line) => log("deploy", `[rollback:${target.name}] ${line}`)
      });
      await this.db.createDeploymentRevision({
        targetId: target.id,
        runId: run.id,
        imageRef: revision.imageRef,
        imageDigest: revision.imageDigest,
        status: "succeeded",
        rollbackOfRevisionId: revision.id
      });
      await this.db.markDeploymentTargetStatus({
        targetId: target.id,
        lastStatus: "succeeded",
        lastDeployedImage: `${revision.imageRef}@${revision.imageDigest}`,
        lastError: null
      });
      await this.db.completeRollbackEvent(rollbackEventId, "succeeded");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Automatic rollback failed.";
      await this.db.completeRollbackEvent(rollbackEventId, "failed", message);
      await log("deploy", `Automatic rollback failed for ${target.name}: ${message}`);
    }
  }

  private async runStage<T>(
    runId: string,
    stageName: string,
    stageOrder: number,
    callback: () => Promise<T>
  ): Promise<T> {
    await this.db.upsertStageRun({
      runId,
      stageName,
      stageOrder,
      status: "running",
      setStarted: true
    });
    try {
      const result = await callback();
      await this.db.upsertStageRun({
        runId,
        stageName,
        stageOrder,
        status: "succeeded",
        setFinished: true
      });
      return result;
    } catch (error) {
      await this.db.upsertStageRun({
        runId,
        stageName,
        stageOrder,
        status: "failed",
        setFinished: true,
        metadata: {
          error: error instanceof Error ? error.message : "Unknown stage error."
        }
      });
      throw error;
    }
  }

  private async loadProjectSecrets(projectId: string): Promise<Record<string, string>> {
    const encrypted = await this.db.listProjectSecrets(projectId);
    return Object.fromEntries(
      Object.entries(encrypted).map(([name, value]) => [
        name,
        decryptSecret(value, this.config.SECRET_MASTER_KEY)
      ])
    );
  }
}

function requireSecret(secrets: Record<string, string>, name: string): string {
  const value = secrets[name];
  if (!value) {
    throw new Error(`Missing required project secret: ${name}`);
  }
  return value;
}

function resolveTargetSecrets(secrets: Record<string, string>, hostRef: string) {
  return {
    host: requireSecret(secrets, `${hostRef}_host`),
    user: requireSecret(secrets, `${hostRef}_user`),
    privateKey: requireSecret(secrets, `${hostRef}_private_key`),
    port: secrets[`${hostRef}_port`] ? Number(secrets[`${hostRef}_port`]) : undefined
  };
}

function findTargetSummary(
  targets: DeploymentTargetSummary[],
  name: string
): DeploymentTargetSummary {
  const found = targets.find((target) => target.name === name);
  if (!found) {
    throw new Error(`Deployment target ${name} was not synchronized.`);
  }
  return found;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
