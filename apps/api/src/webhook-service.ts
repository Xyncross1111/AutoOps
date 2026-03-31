import {
  normalizeGitRef,
  matchesPushTrigger,
  parsePipelineConfig
} from "@autoops/core";
import type { AutoOpsDb } from "@autoops/db";

import type { GitHubAppService } from "./github-app.js";

interface WebhookHeaders {
  deliveryId: string | undefined;
  eventName: string | undefined;
  signature: string | undefined;
}

export class GitHubWebhookService {
  constructor(
    private readonly db: AutoOpsDb,
    private readonly github: GitHubAppService
  ) {}

  async handle(headers: WebhookHeaders, payload: Record<string, any>) {
    const deliveryId = headers.deliveryId;
    const eventName = headers.eventName;

    if (!deliveryId || !eventName) {
      throw new Error("Missing GitHub delivery headers.");
    }

    if (await this.db.hasWebhookDelivery(deliveryId)) {
      await this.db.recordWebhookDelivery({
        deliveryId,
        eventName,
        payload,
        status: "duplicate"
      });
      return {
        status: "duplicate" as const
      };
    }

    await this.db.recordWebhookDelivery({
      deliveryId,
      eventName,
      payload,
      status: "received"
    });

    if (eventName === "installation" || eventName === "installation_repositories") {
      const installationId = Number(payload.installation?.id);
      const accountLogin = payload.installation?.account?.login ?? payload.sender?.login ?? "unknown";
      const accountType = payload.installation?.account?.type ?? "User";
      if (installationId) {
        await this.db.upsertGitHubInstallation({
          installationId,
          accountLogin,
          accountType
        });
      }
      await this.db.recordWebhookDelivery({
        deliveryId,
        eventName,
        payload,
        status: "processed"
      });
      return {
        status: "processed" as const
      };
    }

    if (eventName !== "push") {
      await this.db.recordWebhookDelivery({
        deliveryId,
        eventName,
        payload,
        status: "ignored"
      });
      return {
        status: "ignored" as const
      };
    }

    const repoOwner = payload.repository?.owner?.login ?? payload.repository?.owner?.name;
    const repoName = payload.repository?.name;
    const installationId = Number(payload.installation?.id);
    const ref = payload.ref as string | undefined;
    const commitSha = payload.after as string | undefined;
    const triggeredBy = payload.sender?.login ?? "github";

    if (!repoOwner || !repoName || !installationId || !ref || !commitSha) {
      await this.db.recordWebhookDelivery({
        deliveryId,
        eventName,
        payload,
        status: "failed",
        errorMessage: "Push payload is missing required repository metadata."
      });
      return {
        status: "failed" as const
      };
    }

    const projects =
      typeof (this.db as AutoOpsDb & { listProjectsByRepo?: unknown }).listProjectsByRepo === "function"
        ? await this.db.listProjectsByRepo(repoOwner, repoName)
        : await this.db
            .getProjectByRepo(repoOwner, repoName)
            .then((project) => (project ? [project] : []));
    if (projects.length === 0) {
      await this.db.recordWebhookDelivery({
        deliveryId,
        eventName,
        payload,
        status: "ignored",
        errorMessage: "Repository is not registered in AutoOps."
      });
      return {
        status: "ignored" as const
      };
    }

    const branch = normalizeGitRef(ref);
    const runIds: string[] = [];
    let ignoredReason: string | null = null;

    for (const project of projects) {
      if (project.mode === "managed_nextjs") {
        if (branch !== project.defaultBranch) {
          ignoredReason =
            ignoredReason ??
            `Branch ${branch} does not match the managed deployment branch ${project.defaultBranch}.`;
          continue;
        }

        const run = await this.db.createRun({
          projectId: project.id,
          deliveryId,
          source: "push",
          branch,
          commitSha,
          triggeredBy,
          metadata: {
            repoAccess: {
              type: "installation",
              installationId
            }
          }
        });
        await this.db.supersedeQueuedRuns(project.id, branch, run.id);
        runIds.push(run.id);
        continue;
      }

      const configContents = await this.github.fetchRepositoryFile({
        installationId,
        owner: repoOwner,
        repo: repoName,
        path: project.configPath,
        ref: commitSha
      });
      const pipelineConfig = parsePipelineConfig(configContents);
      if (!matchesPushTrigger(pipelineConfig, ref)) {
        ignoredReason =
          ignoredReason ??
          `Branch ${normalizeGitRef(ref)} does not match the configured push trigger.`;
        continue;
      }

      const run = await this.db.createRun({
        projectId: project.id,
        deliveryId,
        source: "push",
        branch,
        commitSha,
        triggeredBy,
        pipelineConfig,
        metadata: {
          deliveryId,
          pipelineConfig
        }
      });
      await this.db.supersedeQueuedRuns(project.id, branch, run.id);
      runIds.push(run.id);
    }

    if (runIds.length === 0) {
      await this.db.recordWebhookDelivery({
        deliveryId,
        eventName,
        payload,
        status: "ignored",
        errorMessage: ignoredReason ?? "No matching AutoOps project accepted this push."
      });
      return {
        status: "ignored" as const
      };
    }

    await this.db.recordWebhookDelivery({
      deliveryId,
      eventName,
      payload,
      status: "processed",
      runId: runIds[0]
    });
    return {
      status: "processed" as const,
      runId: runIds[0]
    };
  }
}
