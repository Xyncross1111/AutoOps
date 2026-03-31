import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app.js";

const config = {
  NODE_ENV: "test",
  PORT: 4000,
  WEB_BASE_URL: "http://localhost:5173",
  DATABASE_URL: "postgres://autoops:autoops@localhost:5432/autoops",
  JWT_SECRET: "super-secret-token",
  ADMIN_EMAIL: "admin@autoops.local",
  ADMIN_PASSWORD: "admin-password",
  SECRET_MASTER_KEY: "master-key-123",
  GITHUB_APP_ID: 0,
  GITHUB_APP_SLUG: "",
  GITHUB_PRIVATE_KEY: "",
  GITHUB_WEBHOOK_SECRET: "webhook-secret"
} as const;

function createDbMock() {
  return {
    healthcheck: vi.fn().mockResolvedValue(true),
    getDashboardOverview: vi.fn().mockResolvedValue({
      metrics: {
        projectCount: 1,
        queuedRunCount: 2,
        runningRunCount: 1,
        successRate7d: 90,
        unhealthyTargetCount: 1
      },
      attention: {
        latestFailedRun: null,
        activeRuns: [],
        unhealthyTargets: []
      },
      recentRuns: [],
      recentDeployments: [],
      recentActivity: []
    }),
    listGitHubInstallations: vi.fn().mockResolvedValue([]),
    upsertGitHubInstallation: vi.fn().mockResolvedValue(undefined),
    createProject: vi.fn().mockResolvedValue({
      id: "project-1",
      name: "Project One",
      repoOwner: "acme",
      repoName: "demo",
      installationId: 1,
      defaultBranch: "main",
      configPath: ".autoops/pipeline.yml",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetCount: 0,
      latestRunStatus: null
    }),
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    listProjects: vi.fn().mockResolvedValue([]),
    getProjectDetail: vi.fn().mockResolvedValue({
      project: {
        id: "project-1",
        name: "Project One",
        repoOwner: "acme",
        repoName: "demo",
        installationId: 1,
        defaultBranch: "main",
        configPath: ".autoops/pipeline.yml",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        targetCount: 1,
        latestRunStatus: "running"
      },
      recentRuns: [],
      deploymentTargets: [],
      installation: null,
      secretNames: ["ghcr_token"]
    }),
    updateProject: vi.fn().mockResolvedValue({
      id: "project-1",
      name: "Project One",
      repoOwner: "acme",
      repoName: "demo",
      installationId: 1,
      defaultBranch: "main",
      configPath: ".autoops/pipeline.yml",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetCount: 1,
      latestRunStatus: "running"
    }),
    listRuns: vi.fn().mockResolvedValue([]),
    getRunDetail: vi.fn().mockResolvedValue(null),
    listRunLogs: vi.fn().mockResolvedValue([]),
    rerun: vi.fn().mockResolvedValue({
      id: "run-2"
    }),
    listDeploymentTargets: vi.fn().mockResolvedValue([]),
    listDeploymentRevisions: vi.fn().mockResolvedValue([]),
    getDeploymentTargetDetail: vi.fn().mockResolvedValue({
      target: {
        id: "target-1",
        projectId: "project-1",
        projectName: "Project One",
        name: "production",
        hostRef: "prod",
        composeFile: "/srv/app/docker-compose.yml",
        service: "app",
        healthcheckUrl: "https://example.com/health",
        lastStatus: "failed",
        lastDeployedImage: "ghcr.io/acme/demo:123",
        lastDeployedAt: new Date().toISOString(),
        lastError: "Healthcheck failed"
      },
      revisions: [],
      linkedRuns: []
    }),
    enqueueRollbackRun: vi.fn().mockResolvedValue({ id: "run-rollback" }),
    listActivityEvents: vi.fn().mockResolvedValue([
      {
        id: "audit:1",
        kind: "audit",
        title: "Project Updated",
        description: "projectId: project-1",
        status: "completed",
        occurredAt: new Date().toISOString(),
        actor: "admin@autoops.local",
        entityType: "project",
        entityId: "project-1",
        projectId: "project-1",
        runId: null,
        targetId: null,
        metadata: {}
      }
    ]),
    recordWebhookDelivery: vi.fn().mockResolvedValue(undefined)
  };
}

function createGithubMock() {
  return {
    getInstallUrl: vi.fn().mockReturnValue("https://github.example/install"),
    fetchRepositoryFile: vi.fn()
  };
}

async function getBearerToken(app: ReturnType<typeof createApp>) {
  const response = await request(app)
    .post("/api/auth/login")
    .send({
      email: config.ADMIN_EMAIL,
      password: config.ADMIN_PASSWORD
    });

  return response.body.token as string;
}

describe("createApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the dashboard overview payload", async () => {
    const db = createDbMock();
    const app = createApp({
      config: config as any,
      db: db as any,
      github: createGithubMock() as any
    });
    const token = await getBearerToken(app);

    const response = await request(app)
      .get("/api/dashboard/overview")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.overview.metrics.projectCount).toBe(1);
    expect(db.getDashboardOverview).toHaveBeenCalledTimes(1);
  });

  it("parses run filters and forwards them to the db", async () => {
    const db = createDbMock();
    db.listRuns.mockResolvedValue([
      {
        id: "run-1",
        projectId: "project-1",
        projectName: "Project One",
        source: "push",
        branch: "main",
        commitSha: "abcdef123456",
        status: "running",
        queuedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        finishedAt: null,
        triggeredBy: "octocat",
        errorMessage: null
      }
    ]);
    const app = createApp({
      config: config as any,
      db: db as any,
      github: createGithubMock() as any
    });
    const token = await getBearerToken(app);

    const response = await request(app)
      .get("/api/runs")
      .query({
        projectId: "4d7dd6d3-8f38-446b-a19b-f8c1d1b7ac02",
        status: "running",
        source: "push",
        search: "main",
        limit: "25"
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(db.listRuns).toHaveBeenCalledWith({
      projectId: "4d7dd6d3-8f38-446b-a19b-f8c1d1b7ac02",
      status: "running",
      source: "push",
      search: "main",
      limit: 25
    });
  });

  it("returns project detail and supports patch updates with secret upserts", async () => {
    const db = createDbMock();
    const app = createApp({
      config: config as any,
      db: db as any,
      github: createGithubMock() as any
    });
    const token = await getBearerToken(app);

    const detailResponse = await request(app)
      .get("/api/projects/project-1")
      .set("Authorization", `Bearer ${token}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.project.id).toBe("project-1");

    const patchResponse = await request(app)
      .patch("/api/projects/project-1")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Project One",
        defaultBranch: "release",
        configPath: ".autoops/pipeline.yml",
        secrets: {
          ghcr_token: "super-secret"
        }
      });

    expect(patchResponse.status).toBe(200);
    expect(db.updateProject).toHaveBeenCalledTimes(1);
    expect(db.updateProject.mock.calls[0][0]).toBe("project-1");
    expect(db.updateProject.mock.calls[0][1]).toMatchObject({
      name: "Project One",
      defaultBranch: "release",
      configPath: ".autoops/pipeline.yml"
    });
    expect(db.updateProject.mock.calls[0][1].secrets.ghcr_token).not.toBe("super-secret");
  });

  it("returns deployment target detail", async () => {
    const db = createDbMock();
    const app = createApp({
      config: config as any,
      db: db as any,
      github: createGithubMock() as any
    });
    const token = await getBearerToken(app);

    const response = await request(app)
      .get("/api/deployments/targets/target-1")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.target.id).toBe("target-1");
    expect(db.getDeploymentTargetDetail).toHaveBeenCalledWith("target-1");
  });

  it("returns normalized activity events", async () => {
    const db = createDbMock();
    const app = createApp({
      config: config as any,
      db: db as any,
      github: createGithubMock() as any
    });
    const token = await getBearerToken(app);

    const response = await request(app)
      .get("/api/activity")
      .query({ limit: "10", kind: "audit", status: "completed" })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.events[0].kind).toBe("audit");
    expect(db.listActivityEvents).toHaveBeenCalledWith({
      limit: 10,
      kind: "audit",
      status: "completed"
    });
  });
});
