import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { encryptSecret } from "@autoops/core";

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
  GITHUB_OAUTH_CLIENT_ID: "oauth-client-id",
  GITHUB_OAUTH_CLIENT_SECRET: "oauth-client-secret",
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
  const baseManagedTarget = {
    id: "target-1",
    projectId: baseProject.id,
    projectName: baseProject.name,
    name: "managed-vps",
    targetType: "managed_vps",
    environment: "production" as const,
    promotionOrder: 2,
    protected: true,
    hostRef: "managed",
    composeFile: "/opt/autoops-managed/apps/acme-demo-100/docker-compose.yml",
    service: "app",
    healthcheckUrl: "http://acme-demo-100:3000/",
    managedPort: 6100,
    managedRuntimeDir: "/opt/autoops-managed/apps/acme-demo-100",
    managedDomain: null,
    lastStatus: null,
    lastDeployedImage: null,
    lastDeployedAt: null,
    lastError: null
  };

  return {
    healthcheck: vi.fn().mockResolvedValue(true),
    createUser: vi.fn().mockImplementation(async ({ email }: { email: string }) => ({
      email,
      passwordHash: "hashed-password",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })),
    upsertUserPassword: vi.fn().mockImplementation(async ({ email }: { email: string }) => ({
      email,
      passwordHash: "hashed-password",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })),
    getUserByEmail: vi.fn().mockResolvedValue(null),
    claimUnownedProjects: vi.fn().mockResolvedValue(0),
    getDashboardOverview: vi.fn().mockResolvedValue({
      metrics: {
        projectCount: 1,
        queuedRunCount: 2,
        runningRunCount: 1,
        successRate7d: 90,
        unhealthyTargetCount: 1,
        pendingApprovalCount: 0
      },
      attention: {
        latestFailedRun: null,
        activeRuns: [],
        unhealthyTargets: [],
        pendingApprovals: []
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
    upsertGitHubOAuthConnection: vi.fn().mockResolvedValue(undefined),
    getGitHubOAuthConnection: vi.fn().mockResolvedValue(null),
    deleteGitHubOAuthConnection: vi.fn().mockResolvedValue(undefined),
    upsertGitHubRepositories: vi.fn().mockResolvedValue(undefined),
    listGitHubRepositories: vi.fn().mockResolvedValue([]),
    getGitHubRepository: vi.fn().mockResolvedValue({
      installationId: 1,
      repoId: 100,
      owner: "acme",
      name: "demo",
      fullName: "acme/demo",
      description: "AutoOps demo app",
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
    listProjectsByRepo: vi.fn().mockResolvedValue([baseProject]),
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
    deleteProject: vi.fn().mockResolvedValue(baseProject),
    listRuns: vi.fn().mockResolvedValue([]),
    getRun: vi.fn().mockResolvedValue({
      summary: {
        id: "run-source",
        projectId: "project-1",
        projectName: "Project One",
        source: "push",
        branch: "main",
        commitSha: "abcdef123456",
        status: "succeeded",
        queuedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        triggeredBy: "admin@autoops.local",
        errorMessage: null
      },
      pipelineConfig: null,
      metadata: {}
    }),
    getRunDetail: vi.fn().mockResolvedValue(null),
    listRunLogs: vi.fn().mockResolvedValue([]),
    getRevision: vi.fn().mockResolvedValue({
      id: "revision-1",
      targetId: "target-preview",
      targetName: "preview:feature-one",
      projectId: "project-1",
      projectName: "Project One",
      runId: "run-source",
      runSource: "manual_deploy",
      imageRef: "ghcr.io/acme/demo:preview",
      imageDigest: "sha256:preview",
      status: "succeeded",
      deployedAt: new Date().toISOString(),
      rollbackOfRevisionId: null,
      promotedFromRevisionId: null,
      promotedFromTargetId: null,
      promotedFromTargetName: null,
      promotionApprovalId: null,
      promotionApprovalStatus: null
    }),
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
    syncDeploymentTargets: vi.fn().mockImplementation(async (projectId: string, targets: Array<any>) => (
      targets.map((target, index) => ({
        ...baseManagedTarget,
        id: `target-${index + 1}`,
        projectId,
        name: target.name,
        targetType: target.targetType ?? "ssh_compose",
        environment: target.environment ?? null,
        promotionOrder: target.promotionOrder ?? null,
        protected: target.protected ?? false,
        hostRef: target.hostRef,
        composeFile: target.composeFile,
        service: target.service,
        healthcheckUrl: target.healthcheckUrl,
        managedPort: target.managedPort ?? null,
        managedRuntimeDir: target.managedRuntimeDir ?? null,
        managedDomain: target.managedDomain ?? null
      }))
    )),
    listDeploymentTargets: vi.fn().mockResolvedValue([baseManagedTarget]),
    getDeploymentTargetById: vi.fn().mockImplementation(async (targetId: string) => {
      if (targetId === "target-preview") {
        return {
          ...baseManagedTarget,
          id: "target-preview",
          name: "preview:feature-one",
          environment: "preview" as const,
          promotionOrder: 1,
          protected: false,
          managedPort: 6101,
          managedRuntimeDir: "/opt/autoops-managed/apps/acme-demo-100-preview",
          healthcheckUrl: "http://acme-demo-100-preview:3000/"
        };
      }

      if (targetId === "target-staging") {
        return {
          ...baseManagedTarget,
          id: "target-staging",
          name: "staging",
          targetType: "ssh_compose" as const,
          environment: "staging" as const,
          promotionOrder: 2,
          protected: false,
          hostRef: "staging",
          composeFile: "/srv/staging/docker-compose.yml",
          managedPort: null,
          managedRuntimeDir: null,
          managedDomain: null,
          healthcheckUrl: "https://staging.example.com/health",
          lastDeployedImage: null
        };
      }

      return baseManagedTarget;
    }),
    listDeploymentRevisions: vi.fn().mockResolvedValue([]),
    getDeploymentTargetDetail: vi.fn().mockResolvedValue({
      target: {
        id: "target-1",
        projectId: "project-1",
        projectName: "Project One",
        name: "production",
        targetType: "ssh_compose",
        environment: "production",
        promotionOrder: 2,
        protected: true,
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
    findPendingPromotionApproval: vi.fn().mockResolvedValue(null),
    createPromotionApproval: vi.fn().mockResolvedValue({
      id: "approval-1",
      projectId: "project-1",
      projectName: "Project One",
      sourceRevisionId: "revision-1",
      sourceTargetId: "target-preview",
      sourceTargetName: "preview:feature-one",
      destinationTargetId: "target-1",
      destinationTargetName: "managed-vps",
      sourceImageRef: "ghcr.io/acme/demo:preview",
      sourceImageDigest: "sha256:preview",
      requestedBy: config.ADMIN_EMAIL,
      decidedBy: null,
      requestComment: null,
      decisionComment: null,
      status: "pending",
      queuedRunId: null,
      createdAt: new Date().toISOString(),
      decidedAt: null
    }),
    listPromotionApprovals: vi.fn().mockResolvedValue([]),
    getPromotionApproval: vi.fn().mockResolvedValue(null),
    decidePromotionApproval: vi.fn().mockResolvedValue(null),
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
    isOAuthConfigured: vi.fn().mockReturnValue(true),
    getOAuthAuthorizeUrl: vi.fn().mockImplementation((state: string) => (
      `https://github.com/login/oauth/authorize?state=${encodeURIComponent(state)}`
    )),
    getInstallation: vi.fn().mockResolvedValue({
      installationId: 1,
      accountLogin: "acme",
      accountType: "Organization"
    }),
    exchangeOAuthCode: vi.fn().mockResolvedValue({
      githubUserId: 99,
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      profileUrl: "https://github.com/octocat",
      scope: "read:user,repo",
      accessToken: "oauth-access-token"
    }),
    listUserRepositories: vi.fn().mockResolvedValue([
      {
        repoId: 101,
        owner: "octocat",
        name: "hello-world",
        fullName: "octocat/hello-world",
        description: "demo",
        defaultBranch: "main",
        isPrivate: false,
        isArchived: false,
        visibility: "public",
        htmlUrl: "https://github.com/octocat/hello-world",
        pushedAt: new Date().toISOString()
      }
    ]),
    fetchRepositoryFile: vi.fn(),
    fetchRepositoryFileOptional: vi.fn(),
    fetchRepositoryFileWithOAuth: vi.fn(),
    fetchRepositoryFileOptionalWithOAuth: vi.fn(),
    listInstallationRepositories: vi.fn().mockResolvedValue([]),
    getBranchHeadSha: vi.fn().mockResolvedValue("abcdef1234567890"),
    getBranchHeadShaWithOAuth: vi.fn().mockResolvedValue("abcdef1234567890")
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

  it("registers a new user and returns a token", async () => {
    const db = createDbMock();
    db.getUserByEmail.mockResolvedValue(null);
    const app = createApp({
      config: config as any,
      db: db as any,
      github: createGithubMock() as any
    });

    const response = await request(app)
      .post("/api/auth/register")
      .send({
        email: "operator@example.com",
        password: "strong-password"
      });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe("operator@example.com");
    expect(response.body.token).toEqual(expect.any(String));
    expect(db.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "operator@example.com"
      })
    );
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
    expect(db.getDashboardOverview).toHaveBeenCalledWith(config.ADMIN_EMAIL);
  });

  it("returns a GitHub OAuth authorization URL and stores the connected account", async () => {
    const db = createDbMock();
    db.getGitHubOAuthConnection.mockResolvedValue({
      actorEmail: config.ADMIN_EMAIL,
      githubUserId: 99,
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      profileUrl: "https://github.com/octocat",
      scope: "read:user,repo",
      encryptedAccessToken: encryptSecret("oauth-access-token", config.SECRET_MASTER_KEY),
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    db.listGitHubRepositories.mockResolvedValue([]);
    const github = createGithubMock();
    const app = createApp({
      config: config as any,
      db: db as any,
      github: github as any
    });
    const token = await getBearerToken(app);

    const oauthUrlResponse = await request(app)
      .get("/api/github/oauth-url")
      .set("Authorization", `Bearer ${token}`);

    expect(oauthUrlResponse.status).toBe(200);
    expect(github.getOAuthAuthorizeUrl).toHaveBeenCalledTimes(1);

    const state = new URL(oauthUrlResponse.body.url).searchParams.get("state");
    expect(state).toBeTruthy();

    const completeResponse = await request(app)
      .post("/api/github/oauth/complete")
      .set("Authorization", `Bearer ${token}`)
      .send({
        code: "oauth-code",
        state
      });

    expect(completeResponse.status).toBe(200);
    expect(github.exchangeOAuthCode).toHaveBeenCalledWith({
      code: "oauth-code",
      state
    });
    expect(db.upsertGitHubOAuthConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: config.ADMIN_EMAIL,
        login: "octocat"
      })
    );

    const repositoriesResponse = await request(app)
      .get("/api/github/account/repositories")
      .set("Authorization", `Bearer ${token}`);

    expect(repositoriesResponse.status).toBe(200);
    expect(github.listUserRepositories).toHaveBeenCalledWith("oauth-access-token");
    expect(repositoriesResponse.body.repositories[0].fullName).toBe("octocat/hello-world");
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
    }, config.ADMIN_EMAIL);
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
    expect(db.updateProject.mock.calls[0][2]).toBe(config.ADMIN_EMAIL);
  });

  it("deletes a project for the authenticated owner", async () => {
    const db = createDbMock();
    const app = createApp({
      config: config as any,
      db: db as any,
      github: createGithubMock() as any
    });
    const token = await getBearerToken(app);

    const response = await request(app)
      .delete("/api/projects/project-1")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.project.id).toBe("project-1");
    expect(db.deleteProject).toHaveBeenCalledWith("project-1", config.ADMIN_EMAIL);
    expect(db.writeAuditLog).toHaveBeenCalledWith(
      config.ADMIN_EMAIL,
      "project.deleted",
      "project",
      "project-1",
      expect.objectContaining({
        projectId: "project-1",
        projectName: "Project One",
        repoOwner: "acme",
        repoName: "demo"
      })
    );
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
    expect(db.getDeploymentTargetDetail).toHaveBeenCalledWith("target-1", config.ADMIN_EMAIL);
  });

  it("creates a pending approval for promotions into protected targets", async () => {
    const db = createDbMock();
    db.listDeploymentTargets.mockResolvedValue([
      await db.getDeploymentTargetById("target-preview"),
      await db.getDeploymentTargetById("target-1")
    ]);
    const app = createApp({
      config: config as any,
      db: db as any,
      github: createGithubMock() as any
    });
    const token = await getBearerToken(app);

    const response = await request(app)
      .post("/api/promotions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        sourceRevisionId: "8f6f67db-6846-4a73-b44f-f63074e03d99",
        destinationTargetId: "f9bf8411-9c84-4460-bf45-85af7e228bdf"
      });

    expect(response.status).toBe(202);
    expect(response.body.mode).toBe("approval_required");
    expect(db.createPromotionApproval).toHaveBeenCalledTimes(1);
    expect(db.createRun).not.toHaveBeenCalled();
  });

  it("queues an immediate promotion for unprotected next-step targets", async () => {
    const db = createDbMock();
    db.getDeploymentTargetById.mockImplementation(async (targetId: string) => {
      if (targetId === "target-preview") {
        return {
          ...(await createDbMock().getDeploymentTargetById("target-preview"))
        };
      }

      if (targetId === "2d1590f4-5098-455f-8d2d-5945d40a361d") {
        return {
          id: "target-staging",
          projectId: "project-1",
          projectName: "Project One",
          name: "staging",
          targetType: "ssh_compose",
          environment: "staging",
          promotionOrder: 2,
          protected: false,
          hostRef: "staging",
          composeFile: "/srv/staging/docker-compose.yml",
          service: "app",
          healthcheckUrl: "https://staging.example.com/health",
          managedPort: null,
          managedRuntimeDir: null,
          managedDomain: null,
          lastStatus: null,
          lastDeployedImage: null,
          lastDeployedAt: null,
          lastError: null
        };
      }

      return null;
    });
    db.listDeploymentTargets.mockResolvedValue([
      await db.getDeploymentTargetById("target-preview"),
      await db.getDeploymentTargetById("2d1590f4-5098-455f-8d2d-5945d40a361d")
    ]);
    db.createRun.mockResolvedValue({
      id: "run-promotion",
      projectId: "project-1",
      projectName: "Project One",
      source: "manual_promotion",
      branch: "main",
      commitSha: "abcdef123456",
      status: "queued",
      queuedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      triggeredBy: config.ADMIN_EMAIL,
      errorMessage: null
    });
    const app = createApp({
      config: config as any,
      db: db as any,
      github: createGithubMock() as any
    });
    const token = await getBearerToken(app);

    const response = await request(app)
      .post("/api/promotions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        sourceRevisionId: "8f6f67db-6846-4a73-b44f-f63074e03d99",
        destinationTargetId: "2d1590f4-5098-455f-8d2d-5945d40a361d"
      });

    expect(response.status).toBe(202);
    expect(response.body.mode).toBe("queued");
    expect(db.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "manual_promotion",
        metadata: expect.objectContaining({
          manualPromotion: expect.objectContaining({
            sourceRevisionId: "revision-1",
            destinationTargetId: "target-staging"
          })
        })
      })
    );
  });

  it("approves a pending promotion and queues a manual promotion run", async () => {
    const db = createDbMock();
    db.getPromotionApproval.mockResolvedValue({
      id: "approval-1",
      projectId: "project-1",
      projectName: "Project One",
      sourceRevisionId: "revision-1",
      sourceTargetId: "target-preview",
      sourceTargetName: "preview:feature-one",
      destinationTargetId: "target-1",
      destinationTargetName: "managed-vps",
      sourceImageRef: "ghcr.io/acme/demo:preview",
      sourceImageDigest: "sha256:preview",
      requestedBy: config.ADMIN_EMAIL,
      decidedBy: null,
      requestComment: null,
      decisionComment: null,
      status: "pending",
      queuedRunId: null,
      createdAt: new Date().toISOString(),
      decidedAt: null
    });
    db.listDeploymentTargets.mockResolvedValue([
      await db.getDeploymentTargetById("target-preview"),
      await db.getDeploymentTargetById("target-1")
    ]);
    db.createRun.mockResolvedValue({
      id: "run-promotion",
      projectId: "project-1",
      projectName: "Project One",
      source: "manual_promotion",
      branch: "main",
      commitSha: "abcdef123456",
      status: "queued",
      queuedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      triggeredBy: config.ADMIN_EMAIL,
      errorMessage: null
    });
    db.decidePromotionApproval.mockResolvedValue({
      id: "approval-1",
      projectId: "project-1",
      projectName: "Project One",
      sourceRevisionId: "revision-1",
      sourceTargetId: "target-preview",
      sourceTargetName: "preview:feature-one",
      destinationTargetId: "target-1",
      destinationTargetName: "managed-vps",
      sourceImageRef: "ghcr.io/acme/demo:preview",
      sourceImageDigest: "sha256:preview",
      requestedBy: config.ADMIN_EMAIL,
      decidedBy: config.ADMIN_EMAIL,
      requestComment: null,
      decisionComment: null,
      status: "approved",
      queuedRunId: "run-promotion",
      createdAt: new Date().toISOString(),
      decidedAt: new Date().toISOString()
    });
    const app = createApp({
      config: config as any,
      db: db as any,
      github: createGithubMock() as any
    });
    const token = await getBearerToken(app);

    const response = await request(app)
      .post("/api/approvals/approval-1/approve")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(202);
    expect(db.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "manual_promotion"
      })
    );
    expect(db.decidePromotionApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: "approval-1",
        status: "approved",
        queuedRunId: "run-promotion"
      })
    );
  });

  it("rejects a pending promotion without queueing a run", async () => {
    const db = createDbMock();
    db.getPromotionApproval.mockResolvedValue({
      id: "approval-1",
      projectId: "project-1",
      projectName: "Project One",
      sourceRevisionId: "revision-1",
      sourceTargetId: "target-preview",
      sourceTargetName: "preview:feature-one",
      destinationTargetId: "target-1",
      destinationTargetName: "managed-vps",
      sourceImageRef: "ghcr.io/acme/demo:preview",
      sourceImageDigest: "sha256:preview",
      requestedBy: config.ADMIN_EMAIL,
      decidedBy: null,
      requestComment: null,
      decisionComment: null,
      status: "pending",
      queuedRunId: null,
      createdAt: new Date().toISOString(),
      decidedAt: null
    });
    db.decidePromotionApproval.mockResolvedValue({
      id: "approval-1",
      projectId: "project-1",
      projectName: "Project One",
      sourceRevisionId: "revision-1",
      sourceTargetId: "target-preview",
      sourceTargetName: "preview:feature-one",
      destinationTargetId: "target-1",
      destinationTargetName: "managed-vps",
      sourceImageRef: "ghcr.io/acme/demo:preview",
      sourceImageDigest: "sha256:preview",
      requestedBy: config.ADMIN_EMAIL,
      decidedBy: config.ADMIN_EMAIL,
      requestComment: null,
      decisionComment: null,
      status: "rejected",
      queuedRunId: null,
      createdAt: new Date().toISOString(),
      decidedAt: new Date().toISOString()
    });
    const app = createApp({
      config: config as any,
      db: db as any,
      github: createGithubMock() as any
    });
    const token = await getBearerToken(app);

    const response = await request(app)
      .post("/api/approvals/approval-1/reject")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(200);
    expect(db.createRun).not.toHaveBeenCalled();
    expect(db.decidePromotionApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: "approval-1",
        status: "rejected"
      })
    );
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
    }, config.ADMIN_EMAIL);
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
        description: "AutoOps demo app",
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
        description: "AutoOps demo app",
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
    expect(response.body.repositories[0].description).toBe("AutoOps demo app");
  });

  it("bootstraps a newly installed GitHub App installation before syncing", async () => {
    const db = createDbMock();
    db.getGitHubInstallation.mockResolvedValueOnce(null).mockResolvedValueOnce({
      installationId: 1,
      accountLogin: "acme",
      accountType: "Organization",
      repoCount: 0,
      syncStatus: "idle",
      lastSyncAt: null,
      lastSyncError: null,
      updatedAt: new Date().toISOString()
    });
    db.listGitHubRepositories.mockResolvedValue([]);

    const github = createGithubMock();
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
    expect(github.getInstallation).toHaveBeenCalledWith(1);
    expect(db.upsertGitHubInstallation).toHaveBeenCalledWith({
      installationId: 1,
      accountLogin: "acme",
      accountType: "Organization"
    });
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
        outputPort: 3000,
        outputDirectory: ".next"
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
        repoId: 100,
        owner: "acme",
        name: "demo",
        defaultBranch: "main"
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

  it("imports a deployable React repository into a managed project", async () => {
    const db = createDbMock();
    db.getProjectByRepo = vi.fn().mockResolvedValue(null);
    db.getGitHubRepository.mockResolvedValue({
      installationId: 1,
      repoId: 101,
      owner: "acme",
      name: "react-demo",
      fullName: "acme/react-demo",
      description: "React demo app",
      defaultBranch: "main",
      isPrivate: false,
      isArchived: false,
      htmlUrl: "https://github.com/acme/react-demo",
      pushedAt: new Date().toISOString(),
      analysisStatus: "analyzed",
      deployabilityStatus: "deployable",
      deployabilityReason: null,
      detectedFramework: "react",
      packageManager: "pnpm",
      linkedProjectId: null,
      analyzedAt: new Date().toISOString(),
      syncedAt: new Date().toISOString()
    });
    const createdProject = {
      id: "project-react",
      name: "react-demo",
      repoOwner: "acme",
      repoName: "react-demo",
      installationId: 1,
      mode: "managed_nextjs",
      githubRepoId: 101,
      defaultBranch: "main",
      configPath: ".autoops/pipeline.yml",
      appSlug: "acme-react-demo-101",
      primaryUrl: "http://localhost:6100",
      managedConfig: {
        framework: "react",
        packageManager: "pnpm",
        installCommand: "pnpm install --frozen-lockfile",
        buildCommand: "pnpm build",
        startCommand: null,
        nodeVersion: "20",
        outputPort: 80,
        outputDirectory: "dist"
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
        repoId: 101,
        owner: "acme",
        name: "react-demo",
        defaultBranch: "main"
      });

    expect(response.status).toBe(201);
    expect(db.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        githubRepoId: 101,
        managedConfig: expect.objectContaining({
          framework: "react",
          outputPort: 80,
          outputDirectory: "dist"
        })
      })
    );
    expect(db.syncDeploymentTargets).toHaveBeenCalledWith(
      "project-react",
      expect.arrayContaining([
        expect.objectContaining({
          healthcheckUrl: expect.stringContaining(":80/")
        })
      ])
    );
  });

  it("imports a deployable static HTML repository into a managed project", async () => {
    const db = createDbMock();
    db.getProjectByRepo = vi.fn().mockResolvedValue(null);
    db.getGitHubRepository.mockResolvedValue({
      installationId: 1,
      repoId: 102,
      owner: "acme",
      name: "landing-page",
      fullName: "acme/landing-page",
      description: "Static landing page",
      defaultBranch: "main",
      isPrivate: false,
      isArchived: false,
      htmlUrl: "https://github.com/acme/landing-page",
      pushedAt: new Date().toISOString(),
      analysisStatus: "analyzed",
      deployabilityStatus: "deployable",
      deployabilityReason: null,
      detectedFramework: "static_html",
      packageManager: null,
      linkedProjectId: null,
      analyzedAt: new Date().toISOString(),
      syncedAt: new Date().toISOString()
    });
    const createdProject = {
      id: "project-static",
      name: "landing-page",
      repoOwner: "acme",
      repoName: "landing-page",
      installationId: 1,
      mode: "managed_nextjs",
      githubRepoId: 102,
      defaultBranch: "main",
      configPath: ".autoops/pipeline.yml",
      appSlug: "acme-landing-page-102",
      primaryUrl: "http://localhost:6101",
      managedConfig: {
        framework: "static_html",
        packageManager: null,
        installCommand: null,
        buildCommand: null,
        startCommand: null,
        nodeVersion: null,
        outputPort: 80,
        outputDirectory: "."
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
        repoId: 102,
        owner: "acme",
        name: "landing-page",
        defaultBranch: "main"
      });

    expect(response.status).toBe(201);
    expect(db.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        githubRepoId: 102,
        managedConfig: expect.objectContaining({
          framework: "static_html",
          outputPort: 80
        })
      })
    );
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
        outputPort: 3000,
        outputDirectory: ".next"
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
        commitSha: "abcdef1234567890",
        metadata: {
          repoAccess: {
            type: "installation",
            installationId: 1
          },
          managedDeployment: {
            targetId: "target-1",
            targetName: "managed-vps",
            environment: "production",
            targetUrl: "http://localhost:6100"
          }
        }
      })
    );
    expect(response.body.target.id).toBe("target-1");
  });

  it("imports an OAuth-connected repository without requiring an app installation", async () => {
    const db = createDbMock();
    db.getProjectByRepo = vi.fn().mockResolvedValue(null);
    db.getGitHubOAuthConnection.mockResolvedValue({
      actorEmail: config.ADMIN_EMAIL,
      githubUserId: 99,
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      profileUrl: "https://github.com/octocat",
      scope: "read:user,repo",
      encryptedAccessToken: encryptSecret("oauth-access-token", config.SECRET_MASTER_KEY),
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const createdProject = {
      id: "project-oauth",
      name: "hello-world",
      repoOwner: "octocat",
      repoName: "hello-world",
      installationId: 9000000000099,
      mode: "managed_nextjs",
      githubRepoId: 101,
      defaultBranch: "main",
      configPath: ".autoops/pipeline.yml",
      appSlug: "octocat-hello-world-101",
      primaryUrl: "http://localhost:6100",
      managedConfig: {
        framework: "nextjs",
        packageManager: "pnpm",
        installCommand: "pnpm install --frozen-lockfile",
        buildCommand: "pnpm build",
        startCommand: "pnpm start",
        nodeVersion: "20",
        outputPort: 3000,
        outputDirectory: ".next"
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetCount: 1,
      latestRunStatus: null
    };
    db.createProject.mockResolvedValue(createdProject);
    db.getProject.mockResolvedValue(createdProject);

    const github = createGithubMock();
    github.fetchRepositoryFileOptionalWithOAuth
      .mockResolvedValueOnce(JSON.stringify({
        dependencies: {
          next: "^15.0.0"
        },
        scripts: {
          build: "next build",
          start: "next start"
        },
        packageManager: "pnpm@9.0.0"
      }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("lockfileVersion: '9.0'")
      .mockResolvedValueOnce(null);

    const app = createApp({
      config: config as any,
      db: db as any,
      github: github as any
    });
    const token = await getBearerToken(app);

    const response = await request(app)
      .post("/api/github/repositories/import")
      .set("Authorization", `Bearer ${token}`)
      .send({
        repoId: 101,
        owner: "octocat",
        name: "hello-world",
        defaultBranch: "main",
        isArchived: false
      });

    expect(response.status).toBe(201);
    expect(db.upsertGitHubInstallation).toHaveBeenCalledWith({
      installationId: 9000000000099,
      accountLogin: "octocat",
      accountType: "OAuth"
    });
    expect(db.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        repoOwner: "octocat",
        repoName: "hello-world",
        installationId: 9000000000099,
        mode: "managed_nextjs"
      })
    );
    expect(db.linkGitHubRepositoryToProject).not.toHaveBeenCalled();
  });

  it("queues managed deployments through the connected GitHub OAuth account when no app installation exists", async () => {
    const db = createDbMock();
    db.getProject.mockResolvedValue({
      id: "project-oauth",
      name: "hello-world",
      repoOwner: "octocat",
      repoName: "hello-world",
      installationId: 9000000000099,
      mode: "managed_nextjs",
      githubRepoId: 101,
      defaultBranch: "main",
      configPath: ".autoops/pipeline.yml",
      appSlug: "octocat-hello-world-101",
      primaryUrl: "http://localhost:6100",
      managedConfig: {
        framework: "nextjs",
        packageManager: "pnpm",
        installCommand: "pnpm install --frozen-lockfile",
        buildCommand: "pnpm build",
        startCommand: "pnpm start",
        nodeVersion: "20",
        outputPort: 3000,
        outputDirectory: ".next"
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetCount: 1,
      latestRunStatus: null
    });
    db.getGitHubOAuthConnection.mockResolvedValue({
      actorEmail: config.ADMIN_EMAIL,
      githubUserId: 99,
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      profileUrl: "https://github.com/octocat",
      scope: "read:user,repo",
      encryptedAccessToken: encryptSecret("oauth-access-token", config.SECRET_MASTER_KEY),
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const github = createGithubMock();
    github.getBranchHeadShaWithOAuth.mockResolvedValue("fedcba0987654321");

    const app = createApp({
      config: config as any,
      db: db as any,
      github: github as any
    });
    const token = await getBearerToken(app);

    const response = await request(app)
      .post("/api/projects/project-oauth/deploy")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(202);
    expect(github.getBranchHeadShaWithOAuth).toHaveBeenCalledWith({
      owner: "octocat",
      repo: "hello-world",
      branch: "main",
      accessToken: "oauth-access-token"
    });
    expect(db.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-oauth",
        source: "manual_deploy",
        branch: "main",
        commitSha: "fedcba0987654321",
        metadata: {
          repoAccess: {
            type: "oauth",
            actorEmail: config.ADMIN_EMAIL
          },
          managedDeployment: {
            targetId: "target-1",
            targetName: "managed-vps",
            environment: "production",
            targetUrl: "http://localhost:6100"
          }
        }
      })
    );
  });

  it("creates a preview target when manually deploying a non-default branch", async () => {
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
        outputPort: 3000,
        outputDirectory: ".next"
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetCount: 1,
      latestRunStatus: null
    });
    db.listDeploymentTargets.mockResolvedValue([]);
    db.reserveNextManagedPort.mockResolvedValue(6101);
    db.syncDeploymentTargets.mockResolvedValue([
      {
        id: "target-preview",
        projectId: "project-managed",
        projectName: "demo",
        name: "preview:feature/nav-refresh",
        targetType: "managed_vps",
        hostRef: "managed",
        composeFile: "/opt/autoops-managed/apps/acme-demo-100-feature-nav-refresh-c53e4d7a/docker-compose.yml",
        service: "app",
        healthcheckUrl: "http://acme-demo-100-feature-nav-refresh-c53e4d7a:3000/",
        managedPort: 6101,
        managedRuntimeDir: "/opt/autoops-managed/apps/acme-demo-100-feature-nav-refresh-c53e4d7a",
        managedDomain: null,
        lastStatus: null,
        lastDeployedImage: null,
        lastDeployedAt: null,
        lastError: null
      }
    ]);
    const github = createGithubMock();
    github.getBranchHeadSha.mockResolvedValue("9999999999999999");
    const app = createApp({
      config: config as any,
      db: db as any,
      github: github as any
    });
    const token = await getBearerToken(app);

    const response = await request(app)
      .post("/api/projects/project-managed/deploy")
      .set("Authorization", `Bearer ${token}`)
      .send({ branch: "feature/nav-refresh" });

    expect(response.status).toBe(202);
    expect(github.getBranchHeadSha).toHaveBeenCalledWith({
      installationId: 1,
      owner: "acme",
      repo: "demo",
      branch: "feature/nav-refresh"
    });
    expect(db.reserveNextManagedPort).toHaveBeenCalledTimes(1);
    expect(db.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "feature/nav-refresh",
        commitSha: "9999999999999999",
        metadata: {
          repoAccess: {
            type: "installation",
            installationId: 1
          },
          managedDeployment: {
            targetId: "target-preview",
            targetName: "preview:feature/nav-refresh",
            environment: "preview",
            targetUrl: "http://localhost:6101"
          }
        }
      })
    );
    expect(response.body.target.id).toBe("target-preview");
  });
});
