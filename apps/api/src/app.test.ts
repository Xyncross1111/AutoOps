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
  GITHUB_WEBHOOK_SECRET: "webhook-secret",
  MANAGED_APPS_DIR: "/opt/autoops-managed",
  MANAGED_BASE_DOMAIN: ""
} as const;

function createDbMock() {
  const baseProject = {
    id: "project-1",
    name: "Project One",
    repoOwner: "acme",
    repoName: "demo",
    installationId: 1,
    mode: "custom_pipeline",
    githubRepoId: null,
    defaultBranch: "main",
    configPath: ".autoops/pipeline.yml",
    appSlug: null,
    primaryUrl: null,
    managedConfig: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    targetCount: 0,
    latestRunStatus: null
  };

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
    listGitHubInstallations: vi.fn().mockResolvedValue([
      {
        installationId: 1,
        accountLogin: "acme",
        accountType: "Organization",
        repoCount: 1,
        syncStatus: "succeeded",
        lastSyncAt: new Date().toISOString(),
        lastSyncError: null,
        updatedAt: new Date().toISOString()
      }
    ]),
    getGitHubInstallation: vi.fn().mockResolvedValue({
      installationId: 1,
      accountLogin: "acme",
      accountType: "Organization",
      repoCount: 1,
      syncStatus: "succeeded",
      lastSyncAt: new Date().toISOString(),
      lastSyncError: null,
      updatedAt: new Date().toISOString()
    }),
    setGitHubInstallationSyncState: vi.fn().mockResolvedValue(undefined),
    upsertGitHubRepositories: vi.fn().mockResolvedValue(undefined),
    listGitHubRepositories: vi.fn().mockResolvedValue([]),
    getGitHubRepository: vi.fn().mockResolvedValue({
      installationId: 1,
      repoId: 100,
      owner: "acme",
      name: "demo",
      fullName: "acme/demo",
      defaultBranch: "main",
      isPrivate: false,
      isArchived: false,
      htmlUrl: "https://github.com/acme/demo",
      pushedAt: new Date().toISOString(),
      analysisStatus: "analyzed",
      deployabilityStatus: "deployable",
      deployabilityReason: null,
      detectedFramework: "nextjs",
      packageManager: "pnpm",
      linkedProjectId: null,
      analyzedAt: new Date().toISOString(),
      syncedAt: new Date().toISOString()
    }),
    reserveNextManagedPort: vi.fn().mockResolvedValue(6100),
    linkGitHubRepositoryToProject: vi.fn().mockResolvedValue(undefined),
    upsertGitHubInstallation: vi.fn().mockResolvedValue(undefined),
    createProject: vi.fn().mockResolvedValue(baseProject),
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    listProjects: vi.fn().mockResolvedValue([]),
    getProject: vi.fn().mockResolvedValue(baseProject),
    getProjectByRepo: vi.fn().mockResolvedValue(baseProject),
    getProjectDetail: vi.fn().mockResolvedValue({
      project: {
        ...baseProject,
        targetCount: 1,
        latestRunStatus: "running"
      },
      recentRuns: [],
      deploymentTargets: [],
      installation: null,
      repository: null,
      secretNames: ["ghcr_token"]
    }),
    updateProject: vi.fn().mockResolvedValue({
      ...baseProject,
      targetCount: 1,
      latestRunStatus: "running"
    }),
    listRuns: vi.fn().mockResolvedValue([]),
    getRunDetail: vi.fn().mockResolvedValue(null),
    listRunLogs: vi.fn().mockResolvedValue([]),
    createRun: vi.fn().mockResolvedValue({
      id: "run-manual",
      projectId: "project-1",
      projectName: "Project One",
      source: "manual_deploy",
      branch: "main",
      commitSha: "abcdef123456",
      status: "queued",
      queuedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      triggeredBy: "admin@autoops.local",
      errorMessage: null
    }),
    supersedeQueuedRuns: vi.fn().mockResolvedValue(undefined),
    rerun: vi.fn().mockResolvedValue({
      id: "run-2"
    }),
    syncDeploymentTargets: vi.fn().mockResolvedValue([]),
    listDeploymentTargets: vi.fn().mockResolvedValue([]),
    listDeploymentRevisions: vi.fn().mockResolvedValue([]),
    getDeploymentTargetDetail: vi.fn().mockResolvedValue({
      target: {
        id: "target-1",
        projectId: "project-1",
        projectName: "Project One",
        name: "production",
        targetType: "ssh_compose",
        hostRef: "prod",
        composeFile: "/srv/app/docker-compose.yml",
        service: "app",
        healthcheckUrl: "https://example.com/health",
        managedPort: null,
        managedRuntimeDir: null,
        managedDomain: null,
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
    fetchRepositoryFile: vi.fn(),
    fetchRepositoryFileOptional: vi.fn(),
    listInstallationRepositories: vi.fn().mockResolvedValue([]),
    getBranchHeadSha: vi.fn().mockResolvedValue("abcdef1234567890")
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

  it("syncs installation repositories and stores analysis results", async () => {
    const db = createDbMock();
    db.listGitHubRepositories.mockResolvedValue([
      {
        installationId: 1,
        repoId: 100,
        owner: "acme",
        name: "demo",
        fullName: "acme/demo",
        defaultBranch: "main",
        isPrivate: false,
        isArchived: false,
        htmlUrl: "https://github.com/acme/demo",
        pushedAt: new Date().toISOString(),
        analysisStatus: "analyzed",
        deployabilityStatus: "deployable",
        deployabilityReason: null,
        detectedFramework: "nextjs",
        packageManager: "npm",
        linkedProjectId: null,
        analyzedAt: new Date().toISOString(),
        syncedAt: new Date().toISOString()
      }
    ]);
    const github = createGithubMock();
    github.listInstallationRepositories.mockResolvedValue([
      {
        repoId: 100,
        owner: "acme",
        name: "demo",
        fullName: "acme/demo",
        defaultBranch: "main",
        isPrivate: false,
        isArchived: false,
        htmlUrl: "https://github.com/acme/demo",
        pushedAt: new Date().toISOString()
      }
    ]);
    github.fetchRepositoryFileOptional.mockImplementation(async ({ path }: { path: string }) => {
      if (path === "package.json") {
        return JSON.stringify({
          scripts: {
            build: "next build",
            start: "next start"
          },
          dependencies: {
            next: "15.0.0"
          }
        });
      }
      if (path === "package-lock.json") {
        return "{}";
      }
      return null;
    });

    const app = createApp({
      config: config as any,
      db: db as any,
      github: github as any
    });
    const token = await getBearerToken(app);

    const response = await request(app)
      .post("/api/github/installations/1/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(db.setGitHubInstallationSyncState).toHaveBeenCalled();
    expect(db.upsertGitHubRepositories).toHaveBeenCalledTimes(1);
    expect(response.body.repositories[0].deployabilityStatus).toBe("deployable");
  });

  it("imports a deployable repository into a managed Next.js project", async () => {
    const db = createDbMock();
    db.getProjectByRepo = vi.fn().mockResolvedValue(null);
    const createdProject = {
      id: "project-managed",
      name: "demo",
      repoOwner: "acme",
      repoName: "demo",
      installationId: 1,
      mode: "managed_nextjs",
      githubRepoId: 100,
      defaultBranch: "main",
      configPath: ".autoops/pipeline.yml",
      appSlug: "acme-demo-100",
      primaryUrl: "http://localhost:6100",
      managedConfig: {
        framework: "nextjs",
        packageManager: "pnpm",
        installCommand: "pnpm install --frozen-lockfile",
        buildCommand: "pnpm build",
        startCommand: "pnpm start",
        nodeVersion: "20",
        outputPort: 3000
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetCount: 1,
      latestRunStatus: null
    };
    db.createProject.mockResolvedValue(createdProject);
    db.getProject.mockResolvedValue(createdProject);

    const app = createApp({
      config: config as any,
      db: db as any,
      github: createGithubMock() as any
    });
    const token = await getBearerToken(app);

    const response = await request(app)
      .post("/api/github/repositories/import")
      .set("Authorization", `Bearer ${token}`)
      .send({
        installationId: 1,
        repoId: 100
      });

    expect(response.status).toBe(201);
    expect(db.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "managed_nextjs",
        githubRepoId: 100,
        appSlug: expect.stringContaining("acme-demo")
      })
    );
    expect(db.syncDeploymentTargets).toHaveBeenCalledTimes(1);
    expect(db.linkGitHubRepositoryToProject).toHaveBeenCalledWith(1, 100, "project-managed");
  });

  it("queues an explicit managed deployment for imported projects", async () => {
    const db = createDbMock();
    db.getProject.mockResolvedValue({
      id: "project-managed",
      name: "demo",
      repoOwner: "acme",
      repoName: "demo",
      installationId: 1,
      mode: "managed_nextjs",
      githubRepoId: 100,
      defaultBranch: "main",
      configPath: ".autoops/pipeline.yml",
      appSlug: "acme-demo-100",
      primaryUrl: "http://localhost:6100",
      managedConfig: {
        framework: "nextjs",
        packageManager: "pnpm",
        installCommand: "pnpm install --frozen-lockfile",
        buildCommand: "pnpm build",
        startCommand: "pnpm start",
        nodeVersion: "20",
        outputPort: 3000
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetCount: 1,
      latestRunStatus: null
    });
    const github = createGithubMock();
    github.getBranchHeadSha.mockResolvedValue("abcdef1234567890");
    const app = createApp({
      config: config as any,
      db: db as any,
      github: github as any
    });
    const token = await getBearerToken(app);

    const response = await request(app)
      .post("/api/projects/project-managed/deploy")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(202);
    expect(github.getBranchHeadSha).toHaveBeenCalledWith({
      installationId: 1,
      owner: "acme",
      repo: "demo",
      branch: "main"
    });
    expect(db.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-managed",
        source: "manual_deploy",
        branch: "main",
        commitSha: "abcdef1234567890"
      })
    );
  });
});
