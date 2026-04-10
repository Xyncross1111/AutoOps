import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import {
  decryptSecret,
  parsePipelineConfig,
  selectRollbackRevision,
  type DeploymentTargetSummary,
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
      } else if (run.source === "manual_promotion" && run.metadata.manualPromotion) {
        await this.handleManualPromotion(run);
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
    if (run.mode === "managed_nextjs") {
      await this.handleManagedProjectRun(run);
      return;
    }

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
          environment: target.environment ?? null,
          promotionOrder: target.promotionOrder ?? null,
          protected: target.protected ?? false,
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
              undefined,
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

  private async handleManagedProjectRun(run: ClaimedRun): Promise<void> {
    if (!run.managedConfig) {
      throw new Error("Managed project metadata is incomplete.");
    }

    const managedConfig = run.managedConfig;
    const managedEnvironment = await this.loadProjectSecrets(run.projectId);
    let workdir = "";
    const log = async (stageName: string, line: string) => {
      await this.db.appendRunLog(run.id, stageName, line);
    };

    try {
      const target = await this.resolveManagedRunTarget(run);

      if (!target || !target.managedPort || !target.managedRuntimeDir) {
        throw new Error("Managed deployment target is not configured.");
      }

      const targetAppSlug = resolveManagedTargetAppSlug(target, run.appSlug);
      const localTag = `autoops-managed-${targetAppSlug}:${run.id}`;

      await this.runStage(run.id, "prepare", 1, async () => {
        const token = await this.resolveManagedRepositoryToken(run);
        workdir = await this.infra.cloneRepository({
          owner: run.repoOwner,
          repo: run.repoName,
          commitSha: run.commitSha,
          token,
          baseTempDir: this.config.RUNNER_TEMP_DIR,
          onOutput: (line) => log("prepare", line)
        });
        await writeManagedBuildFiles(workdir, managedConfig, {
          includeBuildEnvironment: Object.keys(managedEnvironment).length > 0
        });
        await log(
          "prepare",
          `Prepared managed ${describeManagedFramework(managedConfig.framework)} build context for ${run.repoOwner}/${run.repoName}.`
        );
      });

      await this.runStage(run.id, "build", 2, async () => {
        await this.infra.buildImage({
          workdir,
          context: ".",
          dockerfile: "Dockerfile.autoops",
          localTag,
          buildEnvironment: managedEnvironment,
          baseImages: getManagedBaseImages(managedConfig),
          maxAttempts: 3,
          onOutput: (line) => log("build", line)
        });
        await log("build", `Built managed image ${localTag}.`);
      });

      const imageId = await this.runStage(run.id, "test", 3, async () => {
        await log(
          "test",
          "Managed imports use framework detection and generated runtime recipes instead of custom test commands."
        );
        return this.infra.inspectImageId({ imageTag: localTag });
      });

      await this.runStage(run.id, "deploy", 4, async () => {
        await this.infra.deployManagedTarget({
          appSlug: targetAppSlug,
          runtimeDir: target.managedRuntimeDir!,
          composeFile: target.composeFile,
          service: target.service,
          imageTag: localTag,
          publicPort: target.managedPort!,
          containerPort: managedConfig.outputPort,
          networkName: this.config.MANAGED_NETWORK_NAME,
          runtimeEnvironment: managedEnvironment,
          managedDomain: target.managedDomain,
          edgeContainerName: this.config.MANAGED_BASE_DOMAIN
            ? this.config.MANAGED_EDGE_CONTAINER_NAME
            : null,
          onOutput: (line) => log("deploy", line)
        });
        await this.infra.waitForHealthcheck({
          url: target.healthcheckUrl,
          timeoutSeconds: 60,
          onOutput: (line) => log("deploy", line)
        });
        await this.db.createDeploymentRevision({
          targetId: target.id,
          runId: run.id,
          imageRef: localTag,
          imageDigest: imageId,
          status: "succeeded"
        });
        await this.db.markDeploymentTargetStatus({
          targetId: target.id,
          lastStatus: "succeeded",
          lastDeployedImage: `${localTag}@${imageId}`,
          lastError: null
        });
      });
    } catch (error) {
      const target = await this.resolveManagedRunTarget(run).catch(() => null);
      if (target) {
        await this.db.markDeploymentTargetStatus({
          targetId: target.id,
          lastStatus: "failed",
          lastError: error instanceof Error ? error.message : "Managed deployment failed."
        });
        await this.performAutomaticRollback(
          run,
          target,
          target.healthcheckUrl,
          60,
          undefined,
          managedEnvironment,
          log
        );
      }
      throw error;
    } finally {
      if (workdir) {
        await this.infra.cleanupPath(workdir);
      }
    }
  }

  private async resolveManagedRunTarget(run: ClaimedRun): Promise<DeploymentTargetSummary> {
    const managedDeployment = run.metadata.managedDeployment;

    if (managedDeployment?.targetId) {
      const directTarget = await this.db.getDeploymentTargetById(managedDeployment.targetId);
      if (directTarget) {
        return directTarget;
      }
    }

    const deploymentTargets = await this.db.listDeploymentTargets(run.projectId);

    if (managedDeployment?.targetName) {
      const namedTarget = deploymentTargets.find(
        (candidate) =>
          candidate.targetType === "managed_vps" &&
          candidate.name === managedDeployment.targetName
      );
      if (namedTarget) {
        return namedTarget;
      }
    }

    const fallbackTarget = deploymentTargets.find(
      (candidate) => candidate.targetType === "managed_vps"
    );
    if (!fallbackTarget) {
      throw new Error("Managed deployment target is not configured.");
    }

    return fallbackTarget;
  }

  private async resolveManagedRepositoryToken(run: ClaimedRun): Promise<string> {
    const repoAccess = run.metadata.repoAccess;

    if (repoAccess?.type === "oauth") {
      if (!repoAccess.actorEmail) {
        throw new Error("Managed deployment is missing the GitHub OAuth actor.");
      }

      const connection = await this.db.getGitHubOAuthConnection(repoAccess.actorEmail);
      if (!connection) {
        throw new Error("The connected GitHub account is no longer available for this deployment.");
      }

      return decryptSecret(connection.encryptedAccessToken, this.config.SECRET_MASTER_KEY);
    }

    const installationId = repoAccess?.installationId ?? run.installationId;
    if (!installationId) {
      throw new Error("Managed deployment is missing repository access credentials.");
    }

    return this.github.createInstallationToken(installationId);
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
    const connection =
      target.targetType === "ssh_compose" ? resolveTargetSecrets(secrets, target.hostRef) : undefined;
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
        if (target.targetType === "managed_vps") {
          if (!target.managedPort || !target.managedRuntimeDir) {
            throw new Error("Managed rollback target is missing runtime metadata.");
          }
          const targetAppSlug = resolveManagedTargetAppSlug(target, run.appSlug);
          await this.infra.deployManagedTarget({
            appSlug: targetAppSlug,
            runtimeDir: target.managedRuntimeDir,
            composeFile: target.composeFile,
            service: target.service,
            imageTag: revision.imageRef,
            publicPort: target.managedPort,
            containerPort: getManagedContainerPort(target.healthcheckUrl),
            networkName: this.config.MANAGED_NETWORK_NAME,
            runtimeEnvironment: secrets,
            managedDomain: target.managedDomain,
            edgeContainerName: this.config.MANAGED_BASE_DOMAIN
              ? this.config.MANAGED_EDGE_CONTAINER_NAME
              : null,
            onOutput: (line) => this.db.appendRunLog(run.id, "rollback", line)
          });
        } else if (connection) {
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
        } else {
          throw new Error("SSH rollback target connection is missing.");
        }
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

  private async handleManualPromotion(run: ClaimedRun): Promise<void> {
    const request = run.metadata.manualPromotion;
    if (!request) {
      throw new Error("Manual promotion metadata is missing.");
    }

    const [target, sourceRevision, sourceTarget] = await Promise.all([
      this.db.getDeploymentTargetById(request.destinationTargetId),
      this.db.getRevision(request.sourceRevisionId),
      this.db.getDeploymentTargetById(request.sourceTargetId)
    ]);

    if (!target || !sourceRevision) {
      throw new Error("Promotion target or source revision was not found.");
    }
    if (sourceRevision.status !== "succeeded") {
      throw new Error("Only succeeded revisions can be promoted.");
    }

    const secrets = await this.loadProjectSecrets(run.projectId);
    const connection =
      target.targetType === "ssh_compose"
        ? resolveTargetSecrets(secrets, target.hostRef)
        : undefined;
    const runtimeEnvironment = target.targetType === "managed_vps" ? secrets : undefined;
    const imageRef = request.imageRef || sourceRevision.imageRef;
    const imageDigest = request.imageDigest || sourceRevision.imageDigest;
    const log = async (stageName: string, line: string) => {
      await this.db.appendRunLog(run.id, stageName, line);
    };

    try {
      await this.runStage(run.id, "promote", 1, async () => {
        await log(
          "promote",
          `Promoting ${imageRef}@${imageDigest} from ${sourceTarget?.name ?? sourceRevision.targetName} to ${target.name}.`
        );

        if (target.targetType === "managed_vps") {
          if (!target.managedPort || !target.managedRuntimeDir) {
            throw new Error("Managed promotion target is missing runtime metadata.");
          }

          const targetAppSlug = resolveManagedTargetAppSlug(target, run.appSlug);
          await this.infra.deployManagedTarget({
            appSlug: targetAppSlug,
            runtimeDir: target.managedRuntimeDir,
            composeFile: target.composeFile,
            service: target.service,
            imageTag: imageRef,
            publicPort: target.managedPort,
            containerPort: run.managedConfig?.outputPort ?? getManagedContainerPort(target.healthcheckUrl),
            networkName: this.config.MANAGED_NETWORK_NAME,
            runtimeEnvironment,
            managedDomain: target.managedDomain,
            edgeContainerName: this.config.MANAGED_BASE_DOMAIN
              ? this.config.MANAGED_EDGE_CONTAINER_NAME
              : null,
            onOutput: (line) => log("promote", line)
          });
        } else if (connection) {
          await this.infra.deployComposeTarget({
            host: connection.host,
            user: connection.user,
            privateKey: connection.privateKey,
            port: connection.port,
            composeFile: target.composeFile,
            service: target.service,
            imageRef,
            imageDigest,
            onOutput: (line) => log("promote", line)
          });
        } else {
          throw new Error("SSH promotion target connection is missing.");
        }

        await this.infra.waitForHealthcheck({
          url: target.healthcheckUrl,
          timeoutSeconds: target.targetType === "managed_vps" ? 60 : undefined,
          onOutput: (line) => log("promote", line)
        });
        await this.db.createDeploymentRevision({
          targetId: target.id,
          runId: run.id,
          imageRef,
          imageDigest,
          status: "succeeded"
        });
        await this.db.markDeploymentTargetStatus({
          targetId: target.id,
          lastStatus: "succeeded",
          lastDeployedImage: `${imageRef}@${imageDigest}`,
          lastError: null
        });
      });

      await this.db.writeAuditLog(
        run.triggeredBy,
        "promotion.succeeded",
        "run",
        run.id,
        {
          sourceRevisionId: request.sourceRevisionId,
          sourceTargetId: request.sourceTargetId,
          destinationTargetId: request.destinationTargetId,
          approvalId: request.approvalId ?? null,
          imageDigest
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Manual promotion failed.";
      await this.db.markDeploymentTargetStatus({
        targetId: target.id,
        lastStatus: "failed",
        lastError: message
      });
      await this.performAutomaticRollback(
        run,
        target,
        target.healthcheckUrl,
        target.targetType === "managed_vps" ? 60 : undefined,
        connection,
        runtimeEnvironment,
        log
      );
      await this.db.writeAuditLog(
        run.triggeredBy,
        "promotion.failed",
        "run",
        run.id,
        {
          sourceRevisionId: request.sourceRevisionId,
          sourceTargetId: request.sourceTargetId,
          destinationTargetId: request.destinationTargetId,
          approvalId: request.approvalId ?? null,
          errorMessage: message
        }
      );
      throw error;
    }
  }

  private async performAutomaticRollback(
    run: ClaimedRun,
    target: DeploymentTargetSummary,
    healthcheckUrl: string,
    timeoutSeconds: number | undefined,
    connection:
      | {
          host: string;
          user: string;
          privateKey: string;
          port?: number;
        }
      | undefined,
    runtimeEnvironment: Record<string, string> | undefined,
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
      if (target.targetType === "managed_vps") {
        if (!target.managedPort || !target.managedRuntimeDir) {
          throw new Error("Managed rollback target is missing runtime metadata.");
        }
        const targetAppSlug = resolveManagedTargetAppSlug(target, run.appSlug);
        await this.infra.deployManagedTarget({
          appSlug: targetAppSlug,
          runtimeDir: target.managedRuntimeDir,
          composeFile: target.composeFile,
          service: target.service,
          imageTag: revision.imageRef,
          publicPort: target.managedPort,
          containerPort: getManagedContainerPort(target.healthcheckUrl),
          networkName: this.config.MANAGED_NETWORK_NAME,
          runtimeEnvironment,
          managedDomain: target.managedDomain,
          edgeContainerName: this.config.MANAGED_BASE_DOMAIN
            ? this.config.MANAGED_EDGE_CONTAINER_NAME
            : null,
          onOutput: (line) => log("deploy", `[rollback:${target.name}] ${line}`)
        });
      } else if (connection) {
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
      } else {
        throw new Error("SSH rollback target connection is missing.");
      }
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

async function writeManagedBuildFiles(
  workdir: string,
  config: {
    framework: string;
    packageManager: string | null;
    packageManagerVersion?: string | null;
    installCommand: string | null;
    buildCommand: string | null;
    startCommand: string | null;
    nodeVersion: string | null;
    outputPort: number;
    outputDirectory: string | null;
  },
  options: {
    includeBuildEnvironment?: boolean;
  } = {}
): Promise<void> {
  const dockerfile = buildManagedDockerfile(config, options);

  await writeFile(
    join(workdir, "Dockerfile.autoops"),
    dockerfile,
    "utf8"
  );

  if (config.framework !== "nextjs") {
    await writeFile(join(workdir, "nginx.autoops.conf"), buildManagedNginxConfig(), "utf8");
  }

  await writeFile(
    join(workdir, ".dockerignore"),
    [
      ".git",
      ".dockerignore",
      "Dockerfile.autoops",
      "node_modules",
      ".next",
      "build",
      "dist",
      "coverage",
      ".turbo"
    ].join("\n"),
    "utf8"
  );
}

function escapeForDoubleQuotedShell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildManagedDockerfile(config: {
  framework: string;
  packageManager: string | null;
  packageManagerVersion?: string | null;
  installCommand: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  nodeVersion: string | null;
  outputPort: number;
  outputDirectory: string | null;
},
options: {
  includeBuildEnvironment?: boolean;
} = {}) {
  if (config.framework === "nextjs") {
    if (!config.installCommand || !config.buildCommand || !config.startCommand || !config.nodeVersion) {
      throw new Error("Managed Next.js config is incomplete.");
    }

    const dependencyCopyInstruction = buildManagedDependencyCopyInstruction(config);
    const packageManagerSetup = buildManagedPackageManagerSetup(config);
    const installInstruction = buildManagedInstallInstruction(config);

    return [
      "# syntax=docker/dockerfile:1.7",
      `FROM node:${config.nodeVersion}-alpine AS base`,
      "WORKDIR /app",
      "ENV NEXT_TELEMETRY_DISABLED=1",
      "ENV HOSTNAME=0.0.0.0",
      `ENV PORT=${config.outputPort}`,
      ...packageManagerSetup,
      "",
      "FROM base AS deps",
      dependencyCopyInstruction,
      installInstruction,
      "",
      "FROM base",
      "ENV NODE_ENV=production",
      dependencyCopyInstruction,
      "COPY --from=deps /app/node_modules ./node_modules",
      "COPY . .",
      buildManagedBuildInstruction(config, options),
      `EXPOSE ${config.outputPort}`,
      `CMD ["sh", "-lc", "${escapeForDoubleQuotedShell(config.startCommand)}"]`
    ].join("\n");
  }

  if (isManagedNodeServerFramework(config.framework)) {
    if (!config.installCommand || !config.buildCommand || !config.startCommand || !config.nodeVersion) {
      throw new Error("Managed Node server config is incomplete.");
    }

    const dependencyCopyInstruction = buildManagedDependencyCopyInstruction(config);
    const packageManagerSetup = buildManagedPackageManagerSetup(config);
    const installInstruction = buildManagedInstallInstruction(config);

    return [
      "# syntax=docker/dockerfile:1.7",
      `FROM node:${config.nodeVersion}-alpine AS base`,
      "WORKDIR /app",
      "ENV HOSTNAME=0.0.0.0",
      `ENV PORT=${config.outputPort}`,
      ...packageManagerSetup,
      "",
      "FROM base AS deps",
      dependencyCopyInstruction,
      installInstruction,
      "",
      "FROM base",
      "ENV NODE_ENV=production",
      dependencyCopyInstruction,
      "COPY --from=deps /app/node_modules ./node_modules",
      "COPY . .",
      buildManagedBuildInstruction(config, options),
      `EXPOSE ${config.outputPort}`,
      `CMD ["sh", "-lc", "${escapeForDoubleQuotedShell(config.startCommand)}"]`
    ].join("\n");
  }

  if (isManagedStaticFramework(config.framework)) {
    if (!config.installCommand || !config.buildCommand || !config.nodeVersion || !config.outputDirectory) {
      throw new Error("Managed static framework config is incomplete.");
    }

    const dependencyCopyInstruction = buildManagedDependencyCopyInstruction(config);
    const packageManagerSetup = buildManagedPackageManagerSetup(config);
    const installInstruction = buildManagedInstallInstruction(config);

    return [
      "# syntax=docker/dockerfile:1.7",
      `FROM node:${config.nodeVersion}-alpine AS base`,
      "WORKDIR /app",
      ...packageManagerSetup,
      "",
      "FROM base AS deps",
      dependencyCopyInstruction,
      installInstruction,
      "",
      "FROM base AS build",
      dependencyCopyInstruction,
      "COPY --from=deps /app/node_modules ./node_modules",
      "COPY . .",
      buildManagedBuildInstruction(config, options),
      "",
      "FROM nginx:1.27-alpine",
      "COPY nginx.autoops.conf /etc/nginx/conf.d/default.conf",
      `COPY --from=build /app/${config.outputDirectory} /usr/share/nginx/html`,
      `EXPOSE ${config.outputPort}`,
      'CMD ["nginx", "-g", "daemon off;"]'
    ].join("\n");
  }

  if (config.framework === "static_html") {
    return [
      "# syntax=docker/dockerfile:1.7",
      "FROM nginx:1.27-alpine",
      "COPY nginx.autoops.conf /etc/nginx/conf.d/default.conf",
      "COPY . /usr/share/nginx/html",
      "RUN rm -f /usr/share/nginx/html/Dockerfile.autoops /usr/share/nginx/html/nginx.autoops.conf /usr/share/nginx/html/.dockerignore",
      `EXPOSE ${config.outputPort}`,
      'CMD ["nginx", "-g", "daemon off;"]'
    ].join("\n");
  }

  throw new Error(`Unsupported managed framework ${config.framework}.`);
}

function buildManagedDependencyCopyInstruction(config: {
  packageManager: string | null;
  installCommand: string | null;
}) {
  const files = ["package.json"];

  if (config.packageManager === "pnpm" && config.installCommand?.includes("--frozen-lockfile")) {
    files.push("pnpm-lock.yaml");
  } else if (config.packageManager === "yarn" && config.installCommand?.includes("--frozen-lockfile")) {
    files.push("yarn.lock");
  } else if (config.packageManager === "npm" && config.installCommand === "npm ci") {
    files.push("package-lock.json");
  }

  return `COPY ${files.join(" ")} ./`;
}

function buildManagedPackageManagerSetup(config: {
  packageManager: string | null;
  packageManagerVersion?: string | null;
}) {
  if (config.packageManager === "pnpm") {
    if (config.packageManagerVersion) {
      return [
        `RUN corepack enable && corepack prepare pnpm@${config.packageManagerVersion} --activate`
      ];
    }

    return ["RUN corepack enable"];
  }

  if (config.packageManager === "yarn") {
    if (config.packageManagerVersion) {
      return [
        `RUN corepack enable && corepack prepare yarn@${config.packageManagerVersion} --activate`
      ];
    }

    return ["RUN corepack enable"];
  }

  return [];
}

function buildManagedInstallInstruction(config: {
  packageManager: string | null;
  installCommand: string | null;
}) {
  if (!config.installCommand) {
    throw new Error("Managed install command is incomplete.");
  }

  if (config.packageManager === "pnpm") {
    const command = config.installCommand.includes("--store-dir")
      ? config.installCommand
      : config.installCommand.replace(/^pnpm install\b/, "pnpm install --store-dir /pnpm/store");
    const allowBlockedBuildsScript = [
      "if pnpm help ignored-builds >/dev/null 2>&1; then",
      "blocked=$(pnpm ignored-builds | sed -n \"s/^  //p\" | grep -v \"^None$\" || true);",
      "if [ -n \"$blocked\" ]; then",
      "echo \"Approving blocked pnpm build scripts for: $blocked\";",
      `BLOCKED_BUILDS="$blocked" node -e "${escapeForDoubleQuotedShell(
        [
          "const fs = require('node:fs');",
          "const blocked = (process.env.BLOCKED_BUILDS ?? '').split(/\\n+/).map((value) => value.trim()).filter((value) => value.length > 0 && value !== 'None');",
          "if (blocked.length === 0) process.exit(0);",
          "const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));",
          "const pnpm = pkg.pnpm && typeof pkg.pnpm === 'object' ? pkg.pnpm : {};",
          "const existing = Array.isArray(pnpm.onlyBuiltDependencies) ? pnpm.onlyBuiltDependencies : [];",
          "pnpm.onlyBuiltDependencies = Array.from(new Set([...existing, ...blocked])).sort();",
          "pkg.pnpm = pnpm;",
          "fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\\n');"
        ].join(" ")
      )}";`,
      "pnpm rebuild --reporter append-only;",
      "fi;",
      "fi"
    ].join(" ");
    return `RUN --mount=type=cache,target=/pnpm/store sh -lc '${escapeForSingleQuotedShell(`${command}; ${allowBlockedBuildsScript}`)}'`;
  }

  if (config.packageManager === "npm") {
    return `RUN --mount=type=cache,target=/root/.npm ${config.installCommand}`;
  }

  if (config.packageManager === "yarn") {
    return `RUN --mount=type=cache,target=/usr/local/share/.cache/yarn ${config.installCommand}`;
  }

  return `RUN ${config.installCommand}`;
}

function buildManagedBuildInstruction(config: {
  framework: string;
  buildCommand: string | null;
},
options: {
  includeBuildEnvironment?: boolean;
} = {}) {
  if (!config.buildCommand) {
    throw new Error("Managed build command is incomplete.");
  }

  const secretMount = options.includeBuildEnvironment
    ? "--mount=type=secret,id=autoops_build_env,target=/run/secrets/autoops_build_env "
    : "";
  const buildCommand = options.includeBuildEnvironment
    ? `sh -lc 'set -a && . /run/secrets/autoops_build_env && set +a && ${escapeForSingleQuotedShell(
        config.buildCommand
      )}'`
    : config.buildCommand;

  if (config.framework === "nextjs") {
    return `RUN ${secretMount}--mount=type=cache,target=/app/.next/cache ${buildCommand}`;
  }

  if (config.framework === "nuxt") {
    return `RUN ${secretMount}--mount=type=cache,target=/app/.nuxt ${buildCommand}`;
  }

  if (isManagedStaticFramework(config.framework)) {
    return `RUN ${secretMount}--mount=type=cache,target=/app/node_modules/.cache ${buildCommand}`;
  }

  return `RUN ${secretMount}${buildCommand}`;
}

function buildManagedNginxConfig() {
  return [
    "server {",
    "  listen 80;",
    "  server_name _;",
    "  root /usr/share/nginx/html;",
    "  index index.html;",
    "",
    "  location / {",
    "    try_files $uri $uri/ /index.html;",
    "  }",
    "}"
  ].join("\n");
}

function resolveManagedTargetAppSlug(
  target: Pick<DeploymentTargetSummary, "managedRuntimeDir">,
  fallbackAppSlug?: string | null
) {
  if (target.managedRuntimeDir) {
    return basename(target.managedRuntimeDir);
  }

  if (fallbackAppSlug) {
    return fallbackAppSlug;
  }

  throw new Error("Managed deployment target is missing an app slug.");
}

function getManagedBaseImages(config: {
  framework: string;
  nodeVersion: string | null;
}) {
  if (config.framework === "nextjs") {
    return [`node:${config.nodeVersion ?? "20"}-alpine`];
  }

  if (isManagedNodeServerFramework(config.framework)) {
    return [`node:${config.nodeVersion ?? "20"}-alpine`];
  }

  if (isManagedStaticFramework(config.framework)) {
    return [`node:${config.nodeVersion ?? "20"}-alpine`, "nginx:1.27-alpine"];
  }

  if (config.framework === "static_html") {
    return ["nginx:1.27-alpine"];
  }

  return [];
}

function getManagedContainerPort(healthcheckUrl: string) {
  try {
    const url = new URL(healthcheckUrl);
    if (url.port) {
      return Number(url.port);
    }
    return url.protocol === "https:" ? 443 : 80;
  } catch {
    return 3000;
  }
}

function escapeForSingleQuotedShell(value: string) {
  return value.replace(/'/g, `'\"'\"'`);
}

function describeManagedFramework(framework: string) {
  if (framework === "nextjs") {
    return "Next.js";
  }
  if (framework === "nuxt") {
    return "Nuxt";
  }
  if (framework === "express") {
    return "Express";
  }
  if (framework === "nestjs") {
    return "NestJS";
  }
  if (framework === "react" || framework === "react_cra") {
    return "React";
  }
  if (framework === "vue") {
    return "Vue";
  }
  if (framework === "astro") {
    return "Astro";
  }
  if (framework === "static_html") {
    return "static HTML";
  }
  return framework;
}

function isManagedStaticFramework(framework: string) {
  return (
    framework === "react" ||
    framework === "react_cra" ||
    framework === "vue" ||
    framework === "astro"
  );
}

function isManagedNodeServerFramework(framework: string) {
  return framework === "nuxt" || framework === "express" || framework === "nestjs";
}
