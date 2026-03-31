import cors from "cors";
import express from "express";
import { z } from "zod";

import { encryptSecret, verifyGitHubSignature } from "@autoops/core";
import type { AutoOpsDb } from "@autoops/db";

import { createAuthHelpers, type AuthenticatedRequest } from "./auth.js";
import type { ApiConfig } from "./config.js";
import type { GitHubAppService } from "./github-app.js";
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
  source: z.enum(["push", "rerun", "manual_rollback"]).optional(),
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(250).default(100)
});

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(250).default(50),
  kind: z.enum(["audit", "webhook"]).optional(),
  status: z.string().trim().min(1).optional()
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
