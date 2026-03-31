import cors from "cors";
import express from "express";
import { z } from "zod";

import { encryptSecret, verifyGitHubSignature } from "@autoops/core";
import type { AutoOpsDb } from "@autoops/db";

import { createAuthHelpers, type AuthenticatedRequest } from "./auth.js";
import type { ApiConfig } from "./config.js";
import type { GitHubAppService } from "./github-app.js";
import { analyzeRepository, buildManagedNextjsConfig } from "./repo-analysis.js";
import { GitHubWebhookService } from "./webhook-service.js";

interface RawBodyRequest extends AuthenticatedRequest {
  rawBody?: string;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const createProjectSchema = z.object({
  name: z.string().min(1),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
  installationId: z.number().int().positive(),
  defaultBranch: z.string().min(1),
  configPath: z.string().min(1).optional(),
  secrets: z.record(z.string()).optional()
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  defaultBranch: z.string().min(1).optional(),
  configPath: z.string().min(1).optional(),
  secrets: z.record(z.string()).optional()
});

const rollbackSchema = z.object({
  targetId: z.string().uuid(),
  revisionId: z.string().uuid()
});

const runFiltersSchema = z.object({
  projectId: z.string().uuid().optional(),
  status: z.enum(["queued", "running", "succeeded", "failed", "cancelled", "superseded"]).optional(),
  source: z.enum(["push", "rerun", "manual_rollback", "manual_deploy"]).optional(),
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(250).default(100)
});

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(250).default(50),
  kind: z.enum(["audit", "webhook"]).optional(),
  status: z.string().trim().min(1).optional()
});

const repositoryFiltersSchema = z.object({
  installationId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().min(1).optional(),
  deployable: z.coerce.boolean().optional(),
  imported: z.coerce.boolean().optional()
});

const importRepositorySchema = z.object({
  installationId: z.number().int().positive(),
  repoId: z.number().int().positive()
});

export function createApp(args: {
  config: ApiConfig;
  db: AutoOpsDb;
  github: GitHubAppService;
}) {
  const { config, db, github } = args;
  const auth = createAuthHelpers(config);
  const webhookService = new GitHubWebhookService(db, github);

  const app = express();
  const asyncRoute =
    (
      handler: (
        req: RawBodyRequest,
        res: express.Response
      ) => Promise<void>
    ) =>
    (req: RawBodyRequest, res: express.Response, next: express.NextFunction) => {
      void handler(req, res).catch(next);
    };

  app.use(
    cors({
      origin: config.WEB_BASE_URL,
      credentials: false
    })
  );
  app.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buffer) => {
        (req as RawBodyRequest).rawBody = buffer.toString("utf8");
      }
    })
  );

  app.get("/healthz", asyncRoute(async (_req, res) => {
    await db.healthcheck();
    res.json({ ok: true });
  }));

  app.post("/api/auth/login", (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    if (
      parsed.data.email !== config.ADMIN_EMAIL ||
      parsed.data.password !== config.ADMIN_PASSWORD
    ) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }
    const token = auth.signToken(parsed.data.email);
    res.json({ token, user: { email: parsed.data.email } });
  });

  app.use("/api", (req, res, next) => auth.authenticate(req, res, next));

  app.get("/api/auth/me", (req: RawBodyRequest, res) => {
    res.json({ user: req.user });
  });

  app.get("/api/dashboard/overview", asyncRoute(async (_req, res) => {
    res.json({
      overview: await db.getDashboardOverview()
    });
  }));

  app.get("/api/github/install-url", (_req, res) => {
    res.json({
      url: github.getInstallUrl()
    });
  });

  app.get("/api/github/installations", asyncRoute(async (_req, res) => {
    res.json({
      installations: await db.listGitHubInstallations()
    });
  }));

  app.post("/api/github/installations/:id/sync", asyncRoute(async (req, res) => {
    const installationId = Number(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    );

    if (!Number.isInteger(installationId) || installationId <= 0) {
      res.status(400).json({ error: "Invalid installation id." });
      return;
    }

    const installation = await db.getGitHubInstallation(installationId);
    if (!installation) {
      res.status(404).json({ error: "Installation not found." });
      return;
    }

    const repositories = await syncInstallationRepositories({ db, github, installationId });
    await db.writeAuditLog(
      req.user?.email ?? "unknown",
      "github.installation.synced",
      "github_installation",
      String(installationId),
      {
        installationId,
        repositoryCount: repositories.length
      }
    );

    res.json({
      installation: await db.getGitHubInstallation(installationId),
      repositories
    });
  }));

  app.get("/api/github/repositories", asyncRoute(async (req, res) => {
    const parsed = repositoryFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    res.json({
      repositories: await db.listGitHubRepositories(parsed.data)
    });
  }));

  app.post("/api/github/repositories/import", asyncRoute(async (req, res) => {
    const parsed = importRepositorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const repository = await db.getGitHubRepository(
      parsed.data.installationId,
      parsed.data.repoId
    );
    if (!repository) {
      res.status(404).json({ error: "Repository not found in the synced catalog." });
      return;
    }
    if (repository.linkedProjectId) {
      res.status(409).json({ error: "This repository has already been imported." });
      return;
    }
    if (repository.deployabilityStatus !== "deployable" || !repository.packageManager) {
      res.status(400).json({ error: "This repository is not eligible for managed import." });
      return;
    }

    const existingProject = await db.getProjectByRepo(repository.owner, repository.name);
    if (existingProject) {
      res.status(409).json({ error: "A project already exists for this repository." });
      return;
    }

    const managedPort = await db.reserveNextManagedPort();
    const appSlug = createManagedAppSlug(repository.fullName, repository.repoId);
    const primaryUrl =
      buildManagedPrimaryUrl({
        baseDomain: config.MANAGED_BASE_DOMAIN,
        webBaseUrl: config.WEB_BASE_URL,
        appSlug,
        port: managedPort
      }) ?? null;
    const managedDomain = config.MANAGED_BASE_DOMAIN
      ? `${appSlug}.${config.MANAGED_BASE_DOMAIN}`
      : null;
    const runtimeDir = `${trimTrailingSlash(config.MANAGED_APPS_DIR)}/apps/${appSlug}`;
    const project = await db.createProject({
      name: repository.name,
      repoOwner: repository.owner,
      repoName: repository.name,
      installationId: repository.installationId,
      mode: "managed_nextjs",
      githubRepoId: repository.repoId,
      defaultBranch: repository.defaultBranch,
      configPath: ".autoops/pipeline.yml",
      appSlug,
      primaryUrl,
      managedConfig: buildManagedProjectConfig(repository.packageManager)
    });

    await db.syncDeploymentTargets(project.id, [
      {
        name: "managed-vps",
        targetType: "managed_vps",
        hostRef: "managed",
        composeFile: `${runtimeDir}/docker-compose.yml`,
        service: "app",
        healthcheckUrl: `http://${appSlug}:3000/`,
        managedPort,
        managedRuntimeDir: runtimeDir,
        managedDomain
      }
    ]);
    await db.linkGitHubRepositoryToProject(repository.installationId, repository.repoId, project.id);
    await db.writeAuditLog(
      req.user?.email ?? "unknown",
      "project.imported",
      "project",
      project.id,
      {
        installationId: repository.installationId,
        repoId: repository.repoId,
        mode: "managed_nextjs"
      }
    );

    res.status(201).json({
      project: await db.getProject(project.id)
    });
  }));

  app.post("/api/projects", asyncRoute(async (req, res) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    await db.upsertGitHubInstallation({
      installationId: parsed.data.installationId,
      accountLogin: parsed.data.repoOwner,
      accountType: "Unknown"
    });
    const encryptedSecrets = Object.fromEntries(
      Object.entries(parsed.data.secrets ?? {}).map(([name, value]) => [
        name,
        encryptSecret(value, config.SECRET_MASTER_KEY)
      ])
    );
    const project = await db.createProject({
      ...parsed.data,
      secrets: encryptedSecrets
    });
    await db.writeAuditLog(
      req.user?.email ?? "unknown",
      "project.created",
      "project",
      project.id,
      {
        repoOwner: project.repoOwner,
        repoName: project.repoName
      }
    );
    res.status(201).json({ project });
  }));

  app.get("/api/projects", asyncRoute(async (_req, res) => {
    res.json({ projects: await db.listProjects() });
  }));

  app.get("/api/projects/:id", asyncRoute(async (req, res) => {
    const projectId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const detail = await db.getProjectDetail(projectId);
    if (!detail) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    res.json(detail);
  }));

  app.patch("/api/projects/:id", asyncRoute(async (req, res) => {
    const projectId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const encryptedSecrets = parsed.data.secrets
      ? Object.fromEntries(
          Object.entries(parsed.data.secrets).map(([name, value]) => [
            name,
            encryptSecret(value, config.SECRET_MASTER_KEY)
          ])
        )
      : undefined;

    const project = await db.updateProject(projectId, {
      name: parsed.data.name,
      defaultBranch: parsed.data.defaultBranch,
      configPath: parsed.data.configPath,
      secrets: encryptedSecrets
    });

    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }

    await db.writeAuditLog(
      req.user?.email ?? "unknown",
      "project.updated",
      "project",
      project.id,
      {
        projectId: project.id,
        updatedFields: Object.keys(parsed.data).sort()
      }
    );

    res.json({ project });
  }));

  app.post("/api/projects/:id/deploy", asyncRoute(async (req, res) => {
    const projectId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const project = await db.getProject(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    if (project.mode !== "managed_nextjs") {
      res.status(400).json({ error: "Manual deploy is only available for managed Next.js projects." });
      return;
    }

    const commitSha = await github.getBranchHeadSha({
      installationId: project.installationId,
      owner: project.repoOwner,
      repo: project.repoName,
      branch: project.defaultBranch
    });

    const run = await db.createRun({
      projectId,
      source: "manual_deploy",
      branch: project.defaultBranch,
      commitSha,
      triggeredBy: req.user?.email ?? "unknown"
    });
    await db.supersedeQueuedRuns(projectId, project.defaultBranch, run.id);
    await db.writeAuditLog(
      req.user?.email ?? "unknown",
      "run.manual_deploy",
      "run",
      run.id,
      {
        projectId,
        branch: project.defaultBranch,
        commitSha
      }
    );

    res.status(202).json({ run });
  }));

  app.get("/api/runs", asyncRoute(async (req, res) => {
    const parsed = runFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    res.json({ runs: await db.listRuns(parsed.data) });
  }));

  app.get("/api/runs/:id", asyncRoute(async (req, res) => {
    const runId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const detail = await db.getRunDetail(runId);
    if (!detail) {
      res.status(404).json({ error: "Run not found." });
      return;
    }
    res.json({
      ...detail,
      logs: await db.listRunLogs(runId, 0)
    });
  }));

  app.get("/api/runs/:id/stream", asyncRoute(async (req, res) => {
    const runId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const detail = await db.getRunDetail(runId);
    if (!detail) {
      res.status(404).json({ error: "Run not found." });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    let lastSeenId = 0;
    const sendLogs = async () => {
      const logs = await db.listRunLogs(runId, lastSeenId);
      for (const log of logs) {
        lastSeenId = log.id;
        res.write(`event: log\n`);
        res.write(`data: ${JSON.stringify(log)}\n\n`);
      }
      const latestDetail = await db.getRunDetail(runId);
      if (latestDetail) {
        res.write(`event: status\n`);
        res.write(`data: ${JSON.stringify(latestDetail.run)}\n\n`);
      }
    };

    await sendLogs();
    const interval = setInterval(async () => {
      try {
        await sendLogs();
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(interval);
        res.end();
      }
    }, 1000);

    req.on("close", () => {
      clearInterval(interval);
      res.end();
    });
  }));

  app.post("/api/runs/:id/rerun", asyncRoute(async (req, res) => {
    const runId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const run = await db.rerun(runId, req.user?.email ?? "unknown");
    await db.writeAuditLog(
      req.user?.email ?? "unknown",
      "run.rerun",
      "run",
      run.id,
      { originalRunId: runId }
    );
    res.status(201).json({ run });
  }));

  app.get("/api/deployments", asyncRoute(async (_req, res) => {
    res.json({
      targets: await db.listDeploymentTargets(),
      revisions: await db.listDeploymentRevisions()
    });
  }));

  app.get("/api/deployments/targets/:id", asyncRoute(async (req, res) => {
    const targetId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const detail = await db.getDeploymentTargetDetail(targetId);
    if (!detail) {
      res.status(404).json({ error: "Deployment target not found." });
      return;
    }
    res.json(detail);
  }));

  app.post("/api/rollbacks", asyncRoute(async (req, res) => {
    const parsed = rollbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const run = await db.enqueueRollbackRun({
      ...parsed.data,
      initiatedBy: req.user?.email ?? "unknown"
    });
    await db.writeAuditLog(
      req.user?.email ?? "unknown",
      "rollback.enqueued",
      "run",
      run.id,
      parsed.data
    );
    res.status(202).json({ run });
  }));

  app.get("/api/activity", asyncRoute(async (req, res) => {
    const parsed = activityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    res.json({
      events: await db.listActivityEvents(parsed.data)
    });
  }));

  app.post("/webhooks/github", asyncRoute(async (req, res) => {
    const signature = req.header("x-hub-signature-256");
    const deliveryId = req.header("x-github-delivery") ?? undefined;
    const eventName = req.header("x-github-event") ?? undefined;
    const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});

    if (!verifyGitHubSignature(rawBody, signature, config.GITHUB_WEBHOOK_SECRET)) {
      res.status(401).json({ error: "Invalid GitHub webhook signature." });
      return;
    }

    try {
      const result = await webhookService.handle(
        {
          deliveryId,
          eventName,
          signature
        },
        req.body
      );
      res.json(result);
    } catch (error) {
      if (deliveryId && eventName) {
        await db.recordWebhookDelivery({
          deliveryId,
          eventName,
          payload: req.body,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown webhook error."
        });
      }
      res.status(500).json({
        error: error instanceof Error ? error.message : "Webhook processing failed."
      });
    }
  }));

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unexpected server error."
      });
    }
  );

  return app;
}

async function syncInstallationRepositories(args: {
  db: AutoOpsDb;
  github: GitHubAppService;
  installationId: number;
}) {
  const { db, github, installationId } = args;
  await db.setGitHubInstallationSyncState({
    installationId,
    syncStatus: "syncing",
    lastSyncError: null
  });

  try {
    const repositories = await github.listInstallationRepositories(installationId);
    const analyzedRepositories = [];

    for (const repository of repositories) {
      const ref = repository.defaultBranch;
      const [packageJson, pnpmWorkspace, turboJson, nxJson, packageLock, pnpmLock, yarnLock] =
        await Promise.all([
          github.fetchRepositoryFileOptional({
            installationId,
            owner: repository.owner,
            repo: repository.name,
            path: "package.json",
            ref
          }),
          github.fetchRepositoryFileOptional({
            installationId,
            owner: repository.owner,
            repo: repository.name,
            path: "pnpm-workspace.yaml",
            ref
          }),
          github.fetchRepositoryFileOptional({
            installationId,
            owner: repository.owner,
            repo: repository.name,
            path: "turbo.json",
            ref
          }),
          github.fetchRepositoryFileOptional({
            installationId,
            owner: repository.owner,
            repo: repository.name,
            path: "nx.json",
            ref
          }),
          github.fetchRepositoryFileOptional({
            installationId,
            owner: repository.owner,
            repo: repository.name,
            path: "package-lock.json",
            ref
          }),
          github.fetchRepositoryFileOptional({
            installationId,
            owner: repository.owner,
            repo: repository.name,
            path: "pnpm-lock.yaml",
            ref
          }),
          github.fetchRepositoryFileOptional({
            installationId,
            owner: repository.owner,
            repo: repository.name,
            path: "yarn.lock",
            ref
          })
        ]);

      const analysis = analyzeRepository({
        repository,
        packageJson,
        hasPnpmWorkspace: pnpmWorkspace !== null,
        hasTurboJson: turboJson !== null,
        hasNxJson: nxJson !== null,
        hasPackageLock: packageLock !== null,
        hasPnpmLock: pnpmLock !== null,
        hasYarnLock: yarnLock !== null
      });

      analyzedRepositories.push({
        repoId: repository.repoId,
        owner: repository.owner,
        name: repository.name,
        fullName: repository.fullName,
        defaultBranch: repository.defaultBranch,
        isPrivate: repository.isPrivate,
        isArchived: repository.isArchived,
        htmlUrl: repository.htmlUrl,
        pushedAt: repository.pushedAt,
        analysisStatus: analysis.analysisStatus,
        deployabilityStatus: analysis.deployabilityStatus,
        deployabilityReason: analysis.deployabilityReason,
        detectedFramework: analysis.detectedFramework,
        packageManager: analysis.packageManager,
        analyzedAt: new Date().toISOString()
      });
    }

    await db.upsertGitHubRepositories(installationId, analyzedRepositories);
    await db.setGitHubInstallationSyncState({
      installationId,
      syncStatus: "succeeded",
      repoCount: analyzedRepositories.length,
      lastSyncError: null,
      touchLastSync: true
    });

    return db.listGitHubRepositories({ installationId });
  } catch (error) {
    await db.setGitHubInstallationSyncState({
      installationId,
      syncStatus: "failed",
      lastSyncError: error instanceof Error ? error.message : "Repository sync failed.",
      touchLastSync: true
    });
    throw error;
  }
}

function createManagedAppSlug(fullName: string, repoId: number): string {
  const base = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "app"}-${repoId}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildManagedPrimaryUrl(args: {
  baseDomain: string;
  webBaseUrl: string;
  appSlug: string;
  port: number;
}): string | null {
  if (args.baseDomain) {
    return `https://${args.appSlug}.${args.baseDomain}`;
  }

  try {
    const webUrl = new URL(args.webBaseUrl);
    return `http://${webUrl.hostname}:${args.port}`;
  } catch {
    return null;
  }
}

function buildManagedProjectConfig(
  packageManager: "npm" | "pnpm" | "yarn"
) {
  return buildManagedNextjsConfig(packageManager, false);
}
