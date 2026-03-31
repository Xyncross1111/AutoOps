import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { decryptSecret, encryptSecret, verifyGitHubSignature } from "@autoops/core";
import type { AutoOpsDb } from "@autoops/db";

import {
  createAuthHelpers,
  hashPassword,
  normalizeEmail,
  type AuthenticatedRequest,
  verifyPassword
} from "./auth.js";
import type { ApiConfig } from "./config.js";
import type { GitHubAppService } from "./github-app.js";
import { analyzeRepository, buildManagedNextjsConfig } from "./repo-analysis.js";
import { GitHubWebhookService } from "./webhook-service.js";

interface RawBodyRequest extends AuthenticatedRequest {
  rawBody?: string;
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
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
  installationId: z.number().int().positive().optional(),
  repoId: z.number().int().positive(),
  owner: z.string().min(1),
  name: z.string().min(1),
  defaultBranch: z.string().min(1),
  htmlUrl: z.string().url().optional(),
  isPrivate: z.boolean().optional(),
  isArchived: z.boolean().optional()
});

const oauthCompleteSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1)
});

const installUrlQuerySchema = z.object({
  state: z.string().trim().min(1).max(512).optional()
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

  app.post("/api/auth/register", asyncRoute(async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const email = normalizeEmail(parsed.data.email);
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      res.status(409).json({ error: "An account already exists for this email." });
      return;
    }

    const user = await db.createUser({
      email,
      passwordHash: hashPassword(parsed.data.password)
    });
    const token = auth.signToken(user.email);

    res.status(201).json({
      token,
      user: {
        email: user.email
      }
    });
  }));

  app.post("/api/auth/login", asyncRoute(async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const email = normalizeEmail(parsed.data.email);
    const user = await db.getUserByEmail(email);

    if (user) {
      if (!verifyPassword(parsed.data.password, user.passwordHash)) {
        res.status(401).json({ error: "Invalid credentials." });
        return;
      }

      const token = auth.signToken(user.email);
      res.json({ token, user: { email: user.email } });
      return;
    }

    if (
      email !== normalizeEmail(config.ADMIN_EMAIL) ||
      parsed.data.password !== config.ADMIN_PASSWORD
    ) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    const bootstrapUser = await db.upsertUserPassword({
      email,
      passwordHash: hashPassword(parsed.data.password)
    });
    await db.claimUnownedProjects(email);

    const token = auth.signToken(bootstrapUser.email);
    res.json({
      token,
      user: {
        email: bootstrapUser.email
      }
    });
  }));

  app.use("/api", (req, res, next) => auth.authenticate(req, res, next));

  app.get("/api/auth/me", asyncRoute(async (req, res) => {
    if (!req.user?.email) {
      res.status(401).json({ error: "Missing authenticated user." });
      return;
    }

    const user = await db.getUserByEmail(req.user.email);
    if (!user) {
      res.status(401).json({ error: "Authenticated user no longer exists." });
      return;
    }

    res.json({
      user: {
        email: user.email
      }
    });
  }));

  app.get("/api/github/oauth-url", (req: RawBodyRequest, res) => {
    if (!req.user?.email) {
      res.status(401).json({ error: "Missing authenticated user." });
      return;
    }
    if (!github.isOAuthConfigured()) {
      res.status(503).json({ error: "GitHub OAuth is not configured." });
      return;
    }

    res.json({
      url: github.getOAuthAuthorizeUrl(
        createGitHubOAuthState(req.user.email, config.JWT_SECRET)
      )
    });
  });

  app.post("/api/github/oauth/complete", asyncRoute(async (req, res) => {
    const parsed = oauthCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    if (!req.user?.email) {
      res.status(401).json({ error: "Missing authenticated user." });
      return;
    }
    if (!github.isOAuthConfigured()) {
      res.status(503).json({ error: "GitHub OAuth is not configured." });
      return;
    }

    const state = verifyGitHubOAuthState(parsed.data.state, config.JWT_SECRET);
    if (state.email !== req.user.email) {
      res.status(403).json({ error: "GitHub OAuth state does not match the active AutoOps session." });
      return;
    }

    const account = await github.exchangeOAuthCode({
      code: parsed.data.code,
      state: parsed.data.state
    });

    await db.upsertGitHubOAuthConnection({
      actorEmail: req.user.email,
      githubUserId: account.githubUserId,
      login: account.login,
      name: account.name,
      avatarUrl: account.avatarUrl,
      profileUrl: account.profileUrl,
      scope: account.scope,
      encryptedAccessToken: encryptSecret(account.accessToken, config.SECRET_MASTER_KEY)
    });
    await db.writeAuditLog(
      req.user.email,
      "github.oauth.connected",
      "github_account",
      String(account.githubUserId),
      {
        login: account.login
      }
    );

    res.json({
      account: await readGitHubOAuthAccount(db, req.user.email)
    });
  }));

  app.get("/api/github/account", asyncRoute(async (req, res) => {
    if (!req.user?.email) {
      res.status(401).json({ error: "Missing authenticated user." });
      return;
    }

    res.json({
      account: await readGitHubOAuthAccount(db, req.user.email)
    });
  }));

  app.get("/api/github/account/repositories", asyncRoute(async (req, res) => {
    if (!req.user?.email) {
      res.status(401).json({ error: "Missing authenticated user." });
      return;
    }

    const connection = await db.getGitHubOAuthConnection(req.user.email);
    if (!connection) {
      res.json({ repositories: [] });
      return;
    }

    const accessToken = decryptSecret(
      connection.encryptedAccessToken,
      config.SECRET_MASTER_KEY
    );
    const [userRepositories, autoOpsRepositories, projects] = await Promise.all([
      github.listUserRepositories(accessToken),
      db.listGitHubRepositories(),
      db.listProjects(req.user.email)
    ]);
    const autoOpsRepositoriesByName = new Map(
      autoOpsRepositories.map((repository) => [repository.fullName.toLowerCase(), repository])
    );
    const ownedProjectIds = new Set(projects.map((project) => project.id));
    const projectsByName = new Map(
      projects.map((project) => [
        `${project.repoOwner}/${project.repoName}`.toLowerCase(),
        project
      ])
    );

    res.json({
      repositories: userRepositories.map((repository) => {
        const linkedRepository = autoOpsRepositoriesByName.get(repository.fullName.toLowerCase());
        const ownedLinkedProjectId =
          linkedRepository?.linkedProjectId && ownedProjectIds.has(linkedRepository.linkedProjectId)
            ? linkedRepository.linkedProjectId
            : null;
        const linkedProject =
          ownedLinkedProjectId
            ? null
            : projectsByName.get(repository.fullName.toLowerCase()) ?? null;
        return {
          ...repository,
          installationId: linkedRepository?.installationId ?? null,
          linkedProjectId: ownedLinkedProjectId ?? linkedProject?.id ?? null,
          autoOpsDeployabilityStatus:
            linkedRepository?.deployabilityStatus ??
            (linkedProject ? "imported" : null)
        };
      })
    });
  }));

  app.get("/api/dashboard/overview", asyncRoute(async (req, res) => {
    if (!req.user?.email) {
      res.status(401).json({ error: "Missing authenticated user." });
      return;
    }
    res.json({
      overview: await db.getDashboardOverview(req.user.email)
    });
  }));

  app.get("/api/github/install-url", asyncRoute(async (req, res) => {
    const parsed = installUrlQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.json({
      url: await github.getInstallUrl({
        state: parsed.data.state
      })
    });
  }));

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
      let remoteInstallation;
      try {
        remoteInstallation = await github.getInstallation(installationId);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          Number((error as { status?: unknown }).status) === 404
        ) {
          res.status(404).json({ error: "Installation not found." });
          return;
        }
        throw error;
      }
      await db.upsertGitHubInstallation(remoteInstallation);
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
    if (!req.user?.email) {
      res.status(401).json({ error: "Missing authenticated user." });
      return;
    }

    const existingProject = await db.getProjectByRepo(
      parsed.data.owner,
      parsed.data.name,
      req.user.email
    );
    if (existingProject) {
      res.status(409).json({ error: "A project already exists for this repository." });
      return;
    }

    let repository = null as Awaited<ReturnType<typeof db.getGitHubRepository>> | null;
    let managedConfig = null as ReturnType<typeof buildManagedProjectConfig> | null;
    let projectInstallationId: number;
    let accessMode: "installation" | "oauth";

    if (parsed.data.installationId) {
      repository = await db.getGitHubRepository(
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

      managedConfig = buildManagedProjectConfig(repository.packageManager);
      projectInstallationId = repository.installationId;
      accessMode = "installation";
    } else {
      if (!req.user?.email) {
        res.status(401).json({ error: "Missing authenticated user." });
        return;
      }

      const oauthConnection = await db.getGitHubOAuthConnection(req.user.email);
      if (!oauthConnection) {
        res.status(400).json({ error: "Connect GitHub before importing repositories." });
        return;
      }

      const accessToken = decryptSecret(
        oauthConnection.encryptedAccessToken,
        config.SECRET_MASTER_KEY
      );
      let analysis: Awaited<ReturnType<typeof analyzeOAuthRepositoryAccess>>;
      try {
        analysis = await analyzeOAuthRepositoryAccess({
          github,
          accessToken,
          owner: parsed.data.owner,
          repo: parsed.data.name,
          ref: parsed.data.defaultBranch,
          isArchived: parsed.data.isArchived ?? false
        });
      } catch {
        res.status(400).json({
          error: "AutoOps could not read this repository through the connected GitHub account."
        });
        return;
      }

      if (analysis.deployabilityStatus !== "deployable" || !analysis.managedConfig) {
        res.status(400).json({
          error:
            analysis.deployabilityReason ??
            "This repository is not eligible for managed import."
        });
        return;
      }

      managedConfig = analysis.managedConfig;
      projectInstallationId = buildOAuthInstallationId(oauthConnection.githubUserId);
      accessMode = "oauth";
      await db.upsertGitHubInstallation({
        installationId: projectInstallationId,
        accountLogin: oauthConnection.login,
        accountType: "OAuth"
      });
    }

    const managedPort = await db.reserveNextManagedPort();
    const appSlug = createManagedAppSlug(
      `${parsed.data.owner}/${parsed.data.name}`,
      parsed.data.repoId
    );
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
      ownerEmail: req.user.email,
      name: parsed.data.name,
      repoOwner: parsed.data.owner,
      repoName: parsed.data.name,
      installationId: projectInstallationId,
      mode: "managed_nextjs",
      githubRepoId: parsed.data.repoId,
      defaultBranch: parsed.data.defaultBranch,
      configPath: ".autoops/pipeline.yml",
      appSlug,
      primaryUrl,
      managedConfig
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
    if (repository) {
      await db.linkGitHubRepositoryToProject(repository.installationId, repository.repoId, project.id);
    }
    await db.writeAuditLog(
      req.user?.email ?? "unknown",
      "project.imported",
      "project",
      project.id,
      {
        installationId: repository?.installationId ?? null,
        repoId: parsed.data.repoId,
        mode: "managed_nextjs",
        accessMode
      }
    );

    res.status(201).json({
      project: await db.getProject(project.id, req.user.email)
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
      ownerEmail: req.user?.email ?? null,
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

  app.get("/api/projects", asyncRoute(async (req, res) => {
    res.json({ projects: await db.listProjects(req.user?.email) });
  }));

  app.get("/api/projects/:id", asyncRoute(async (req, res) => {
    const projectId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const detail = await db.getProjectDetail(projectId, req.user?.email);
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
    }, req.user?.email);

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
    const project = await db.getProject(projectId, req.user?.email);
    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    if (project.mode !== "managed_nextjs") {
      res.status(400).json({ error: "Manual deploy is only available for managed Next.js projects." });
      return;
    }

    let commitSha = "";
    let repoAccess: { type: "installation"; installationId: number } | { type: "oauth"; actorEmail: string };

    if (project.installationId && !isOAuthInstallation(project.installationId)) {
      commitSha = await github.getBranchHeadSha({
        installationId: project.installationId,
        owner: project.repoOwner,
        repo: project.repoName,
        branch: project.defaultBranch
      });
      repoAccess = {
        type: "installation",
        installationId: project.installationId
      };
    } else {
      if (!req.user?.email) {
        res.status(401).json({ error: "Missing authenticated user." });
        return;
      }

      const connection = await db.getGitHubOAuthConnection(req.user.email);
      if (!connection) {
        res.status(400).json({ error: "Connect GitHub before deploying this project." });
        return;
      }

      const accessToken = decryptSecret(
        connection.encryptedAccessToken,
        config.SECRET_MASTER_KEY
      );
      commitSha = await github.getBranchHeadShaWithOAuth({
        owner: project.repoOwner,
        repo: project.repoName,
        branch: project.defaultBranch,
        accessToken
      });
      repoAccess = {
        type: "oauth",
        actorEmail: req.user.email
      };
    }

    const run = await db.createRun({
      projectId,
      source: "manual_deploy",
      branch: project.defaultBranch,
      commitSha,
      triggeredBy: req.user?.email ?? "unknown",
      metadata: {
        repoAccess
      }
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

    res.json({ runs: await db.listRuns(parsed.data, req.user?.email) });
  }));

  app.get("/api/runs/:id", asyncRoute(async (req, res) => {
    const runId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const detail = await db.getRunDetail(runId, req.user?.email);
    if (!detail) {
      res.status(404).json({ error: "Run not found." });
      return;
    }
    res.json({
      ...detail,
      logs: await db.listRunLogs(runId, 0, req.user?.email)
    });
  }));

  app.get("/api/runs/:id/stream", asyncRoute(async (req, res) => {
    const runId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const detail = await db.getRunDetail(runId, req.user?.email);
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
      const logs = await db.listRunLogs(runId, lastSeenId, req.user?.email);
      for (const log of logs) {
        lastSeenId = log.id;
        res.write(`event: log\n`);
        res.write(`data: ${JSON.stringify(log)}\n\n`);
      }
      const latestDetail = await db.getRunDetail(runId, req.user?.email);
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
    const run = await db.rerun(runId, req.user?.email ?? "unknown", req.user?.email);
    await db.writeAuditLog(
      req.user?.email ?? "unknown",
      "run.rerun",
      "run",
      run.id,
      { originalRunId: runId }
    );
    res.status(201).json({ run });
  }));

  app.get("/api/deployments", asyncRoute(async (req, res) => {
    res.json({
      targets: await db.listDeploymentTargets(undefined, req.user?.email),
      revisions: await db.listDeploymentRevisions(100, req.user?.email)
    });
  }));

  app.get("/api/deployments/targets/:id", asyncRoute(async (req, res) => {
    const targetId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const detail = await db.getDeploymentTargetDetail(targetId, req.user?.email);
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
    }, req.user?.email);
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
      events: await db.listActivityEvents(parsed.data, req.user?.email)
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
      const analysis = await analyzeRepositoryByRef({
        repository,
        fetchOptional: (path) => github.fetchRepositoryFileOptional({
          installationId,
          owner: repository.owner,
          repo: repository.name,
          path,
          ref: repository.defaultBranch
        })
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

const OAUTH_INSTALLATION_ID_OFFSET = 9_000_000_000_000;

async function analyzeRepositoryByRef(args: {
  repository: {
    isArchived: boolean;
  };
  fetchOptional: (path: string) => Promise<string | null>;
}) {
  const [packageJson, pnpmWorkspace, turboJson, nxJson, packageLock, pnpmLock, yarnLock] =
    await Promise.all([
      args.fetchOptional("package.json"),
      args.fetchOptional("pnpm-workspace.yaml"),
      args.fetchOptional("turbo.json"),
      args.fetchOptional("nx.json"),
      args.fetchOptional("package-lock.json"),
      args.fetchOptional("pnpm-lock.yaml"),
      args.fetchOptional("yarn.lock")
    ]);

  return analyzeRepository({
    repository: args.repository,
    packageJson,
    hasPnpmWorkspace: pnpmWorkspace !== null,
    hasTurboJson: turboJson !== null,
    hasNxJson: nxJson !== null,
    hasPackageLock: packageLock !== null,
    hasPnpmLock: pnpmLock !== null,
    hasYarnLock: yarnLock !== null
  });
}

async function analyzeOAuthRepositoryAccess(args: {
  github: GitHubAppService;
  accessToken: string;
  owner: string;
  repo: string;
  ref: string;
  isArchived: boolean;
}) {
  return analyzeRepositoryByRef({
    repository: {
      isArchived: args.isArchived
    },
    fetchOptional: (path) =>
      args.github.fetchRepositoryFileOptionalWithOAuth({
        owner: args.owner,
        repo: args.repo,
        path,
        ref: args.ref,
        accessToken: args.accessToken
      })
  });
}

function buildOAuthInstallationId(githubUserId: number): number {
  return OAUTH_INSTALLATION_ID_OFFSET + githubUserId;
}

function isOAuthInstallation(installationId: number): boolean {
  return installationId >= OAUTH_INSTALLATION_ID_OFFSET;
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

function createGitHubOAuthState(email: string, secret: string): string {
  return jwt.sign(
    {
      type: "github-oauth",
      email: normalizeEmail(email)
    },
    secret,
    {
      expiresIn: "10m"
    }
  );
}

function verifyGitHubOAuthState(
  state: string,
  secret: string
): { type: "github-oauth"; email: string } {
  const payload = jwt.verify(state, secret);
  if (
    !payload ||
    typeof payload !== "object" ||
    payload.type !== "github-oauth" ||
    typeof payload.email !== "string"
  ) {
    throw new Error("Invalid GitHub OAuth state.");
  }

  return {
    type: "github-oauth",
    email: normalizeEmail(payload.email)
  };
}

async function readGitHubOAuthAccount(db: AutoOpsDb, email: string) {
  const connection = await db.getGitHubOAuthConnection(email);
  if (!connection) {
    return null;
  }

  return {
    githubUserId: connection.githubUserId,
    login: connection.login,
    name: connection.name,
    avatarUrl: connection.avatarUrl,
    profileUrl: connection.profileUrl,
    scope: connection.scope,
    connectedAt: connection.connectedAt,
    updatedAt: connection.updatedAt
  };
}
