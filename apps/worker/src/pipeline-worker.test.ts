import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { encryptSecret } from "@autoops/core";

import { PipelineWorker } from "./pipeline-worker.js";

const PIPELINE = {
  version: 1 as const,
  triggers: {
    push: {
      branches: ["main"]
    }
  },
  build: {
    context: ".",
    dockerfile: "Dockerfile",
    image: "ghcr.io/acme/app"
  },
  test: {
    commands: ["npm test"]
  },
  deploy: {
    targets: [
      {
        name: "production",
        hostRef: "prod",
        composeFile: "/srv/app/docker-compose.yml",
        service: "app",
        healthcheck: {
          url: "https://example.com/health",
          timeoutSeconds: 10
        }
      }
    ]
  }
};

const CLAIMED_RUN = {
  id: "run-1",
  projectId: "project-1",
  projectName: "Demo",
  repoOwner: "acme",
  repoName: "demo",
  installationId: 12,
  mode: "custom_pipeline" as const,
  githubRepoId: null,
  defaultBranch: "main",
  configPath: ".autoops/pipeline.yml",
  appSlug: null,
  primaryUrl: null,
  managedConfig: null,
  branch: "main",
  commitSha: "abcdef1234567890",
  source: "push" as const,
  triggeredBy: "anas",
  pipelineConfig: PIPELINE,
  metadata: {}
};

const MANAGED_RUN = {
  ...CLAIMED_RUN,
  source: "manual_deploy" as const,
  mode: "managed_nextjs" as const,
  githubRepoId: 100,
  appSlug: "acme-demo-100",
  primaryUrl: "http://localhost:6100",
  managedConfig: {
    framework: "nextjs" as const,
    packageManager: "pnpm" as const,
    packageManagerVersion: "9.0.0",
    installCommand: "pnpm install --frozen-lockfile",
    buildCommand: "pnpm build",
    startCommand: "pnpm start",
    nodeVersion: "20",
    outputPort: 3000,
    outputDirectory: ".next"
  },
  pipelineConfig: null
};

const OAUTH_MANAGED_RUN = {
  ...MANAGED_RUN,
  installationId: 9000000000099,
  metadata: {
    repoAccess: {
      type: "oauth" as const,
      actorEmail: "admin@autoops.local"
    }
  }
};

const PREVIEW_MANAGED_RUN = {
  ...MANAGED_RUN,
  branch: "feature/nav-refresh",
  metadata: {
    repoAccess: {
      type: "installation" as const,
      installationId: 12
    },
    managedDeployment: {
      targetId: "target-preview",
      targetName: "preview:feature/nav-refresh",
      environment: "preview" as const,
      targetUrl: "http://localhost:6101"
    }
  }
};

const PROMOTION_RUN = {
  ...CLAIMED_RUN,
  source: "manual_promotion" as const,
  metadata: {
    manualPromotion: {
      sourceRevisionId: "revision-preview",
      sourceTargetId: "target-preview",
      destinationTargetId: "target-staging",
      requestedBy: "anas",
      approvalId: "approval-1",
      imageRef: "ghcr.io/acme/app:preview",
      imageDigest: "sha256:preview"
    }
  }
};

const MANAGED_ENVIRONMENT = {
  MONGODB_URI: "mongodb://mongo.internal:27017/autoops",
  NEXT_PUBLIC_APP_URL: "https://demo.autoops.local"
};

function createDb(overrides: Record<string, unknown> = {}) {
  return {
    claimNextQueuedRun: vi.fn().mockResolvedValue(CLAIMED_RUN),
    appendRunLog: vi.fn().mockResolvedValue(undefined),
    setRunStatus: vi.fn().mockResolvedValue(undefined),
    listProjectSecrets: vi.fn().mockResolvedValue({
      ghcr_username: encryptSecret("octocat", "master-key-123"),
      ghcr_token: encryptSecret("ghp_example", "master-key-123"),
      prod_host: encryptSecret("deploy.example.com", "master-key-123"),
      prod_user: encryptSecret("deploy", "master-key-123"),
      prod_private_key: encryptSecret(
        "-----BEGIN PRIVATE KEY-----\nexample\n-----END PRIVATE KEY-----",
        "master-key-123"
      ),
      prod_port: encryptSecret("22", "master-key-123")
    }),
    syncDeploymentTargets: vi.fn().mockResolvedValue([
      {
        id: "target-1",
        projectId: "project-1",
        projectName: "Demo",
        name: "production",
        targetType: "ssh_compose",
        hostRef: "prod",
        composeFile: "/srv/app/docker-compose.yml",
        service: "app",
        healthcheckUrl: "https://example.com/health",
        managedPort: null,
        managedRuntimeDir: null,
        managedDomain: null,
        lastStatus: null,
        lastDeployedImage: null,
        lastDeployedAt: null,
        lastError: null
      }
    ]),
    upsertStageRun: vi.fn().mockResolvedValue(undefined),
    createDeploymentRevision: vi.fn().mockResolvedValue(undefined),
    markDeploymentTargetStatus: vi.fn().mockResolvedValue(undefined),
    listDeploymentTargets: vi.fn().mockResolvedValue([]),
    listTargetRevisions: vi.fn().mockResolvedValue([
      {
        id: "revision-1",
        targetId: "target-1",
        targetName: "production",
        projectId: "project-1",
        projectName: "Demo",
        runId: "old-run",
        imageRef: "ghcr.io/acme/app",
        imageDigest: "sha256:stable",
        status: "succeeded",
        deployedAt: "2026-03-30T00:00:00.000Z",
        rollbackOfRevisionId: null
      }
    ]),
    createRollbackEvent: vi.fn().mockResolvedValue("rollback-1"),
    completeRollbackEvent: vi.fn().mockResolvedValue(undefined),
    getDeploymentTargetById: vi.fn().mockResolvedValue(null),
    getRevision: vi.fn().mockResolvedValue(null),
    getGitHubOAuthConnection: vi.fn().mockResolvedValue(null),
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function createInfra(overrides: Record<string, unknown> = {}) {
  return {
    cloneRepository: vi.fn().mockResolvedValue("/tmp/repo"),
    readFile: vi.fn().mockResolvedValue(""),
    buildImage: vi.fn().mockResolvedValue(undefined),
    runTestCommands: vi.fn().mockResolvedValue(undefined),
    pushImage: vi.fn().mockResolvedValue({
      imageRef: "ghcr.io/acme/app",
      imageDigest: "sha256:new"
    }),
    inspectImageId: vi.fn().mockResolvedValue("sha256:new"),
    deployComposeTarget: vi.fn().mockResolvedValue(undefined),
    deployManagedTarget: vi.fn().mockResolvedValue(undefined),
    waitForHealthcheck: vi.fn().mockResolvedValue(undefined),
    cleanupPath: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

const WORKER_CONFIG = {
  DATABASE_URL: "",
  SECRET_MASTER_KEY: "master-key-123",
  GITHUB_APP_ID: 0,
  GITHUB_PRIVATE_KEY: "",
  WORKER_POLL_INTERVAL_MS: 1000,
  RUNNER_TEMP_DIR: "./tmp",
  MANAGED_APPS_DIR: "/opt/autoops-managed",
  MANAGED_BASE_DOMAIN: "",
  MANAGED_EDGE_CONTAINER_NAME: "autoops-caddy",
  MANAGED_NETWORK_NAME: "autoops-managed"
};

describe("PipelineWorker", () => {
  it("processes a successful queued run end to end", async () => {
    const db = createDb();
    const infra = createInfra();
    const worker = new PipelineWorker(
      db as any,
      { createInstallationToken: vi.fn().mockResolvedValue("installation-token") } as any,
      infra as any,
      WORKER_CONFIG
    );

    const processed = await worker.processOnce();

    expect(processed).toBe(true);
    expect(infra.buildImage).toHaveBeenCalledTimes(1);
    expect(infra.runTestCommands).toHaveBeenCalledTimes(1);
    expect(infra.pushImage).toHaveBeenCalledTimes(1);
    expect(infra.deployComposeTarget).toHaveBeenCalledTimes(1);
    expect(db.createDeploymentRevision).toHaveBeenCalledTimes(1);
    expect(db.setRunStatus).toHaveBeenCalledWith("run-1", "succeeded");
  });

  it("attempts automatic rollback when deployment fails", async () => {
    const db = createDb();
    const infra = createInfra({
      deployComposeTarget: vi
        .fn()
        .mockRejectedValueOnce(new Error("deploy failed"))
        .mockResolvedValueOnce(undefined)
    });
    const worker = new PipelineWorker(
      db as any,
      { createInstallationToken: vi.fn().mockResolvedValue("installation-token") } as any,
      infra as any,
      WORKER_CONFIG
    );

    await worker.processOnce();

    expect(db.createRollbackEvent).toHaveBeenCalledTimes(1);
    expect(db.completeRollbackEvent).toHaveBeenCalledWith("rollback-1", "succeeded");
    expect(infra.deployComposeTarget).toHaveBeenCalledTimes(2);
    expect(db.setRunStatus).toHaveBeenCalledWith(
      "run-1",
      "failed",
      expect.stringContaining("deploy failed")
    );
  });

  it("processes a managed Next.js deployment locally on the VPS", async () => {
    const runtimeDir = mkdtempSync(join(tmpdir(), "autoops-managed-test-"));
    const repoDir = mkdtempSync(join(tmpdir(), "autoops-managed-repo-"));

    try {
      const db = createDb({
        claimNextQueuedRun: vi.fn().mockResolvedValue(MANAGED_RUN),
        listProjectSecrets: vi.fn().mockResolvedValue(
          Object.fromEntries(
            Object.entries(MANAGED_ENVIRONMENT).map(([name, value]) => [
              name,
              encryptSecret(value, "master-key-123")
            ])
          )
        ),
        listDeploymentTargets: vi.fn().mockResolvedValue([
          {
            id: "target-managed",
            projectId: "project-1",
            projectName: "Demo",
            name: "managed-vps",
            targetType: "managed_vps",
            hostRef: "managed",
            composeFile: `${runtimeDir}/docker-compose.yml`,
            service: "app",
            healthcheckUrl: "http://acme-demo-100:3000/",
            managedPort: 6100,
            managedRuntimeDir: runtimeDir,
            managedDomain: null,
            lastStatus: null,
            lastDeployedImage: null,
            lastDeployedAt: null,
            lastError: null
          }
        ])
      });
      const infra = createInfra({
        cloneRepository: vi.fn().mockResolvedValue(repoDir)
      });
      const worker = new PipelineWorker(
        db as any,
        { createInstallationToken: vi.fn().mockResolvedValue("installation-token") } as any,
        infra as any,
        WORKER_CONFIG
      );

      const processed = await worker.processOnce();

      expect(processed).toBe(true);
      expect(infra.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          dockerfile: "Dockerfile.autoops",
          buildEnvironment: MANAGED_ENVIRONMENT,
          baseImages: ["node:20-alpine"],
          maxAttempts: 3
        })
      );
      expect(infra.inspectImageId).toHaveBeenCalledTimes(1);
      expect(infra.deployManagedTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          containerPort: 3000,
          runtimeEnvironment: MANAGED_ENVIRONMENT
        })
      );
      expect(db.createDeploymentRevision).toHaveBeenCalledTimes(1);
      expect(db.setRunStatus).toHaveBeenCalledWith("run-1", "succeeded");

      const dockerfile = readFileSync(join(repoDir, "Dockerfile.autoops"), "utf8");
      expect(dockerfile).toContain("--mount=type=secret,id=autoops_build_env,target=/run/secrets/autoops_build_env");
      expect(dockerfile).toContain(". /run/secrets/autoops_build_env");
      expect(dockerfile).toContain("pnpm ignored-builds");
      expect(dockerfile).toContain("pnpm.onlyBuiltDependencies");
      expect(dockerfile).toContain("pnpm rebuild --reporter append-only");
    } finally {
      rmSync(runtimeDir, { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("processes a managed React deployment with an nginx runtime", async () => {
    const runtimeDir = mkdtempSync(join(tmpdir(), "autoops-managed-react-test-"));
    const repoDir = mkdtempSync(join(tmpdir(), "autoops-managed-react-repo-"));
    const reactRun = {
      ...MANAGED_RUN,
      managedConfig: {
        framework: "react" as const,
        packageManager: "pnpm" as const,
        packageManagerVersion: "9.0.0",
        installCommand: "pnpm install --frozen-lockfile",
        buildCommand: "pnpm build",
        startCommand: null,
        nodeVersion: "20",
        outputPort: 80,
        outputDirectory: "dist"
      }
    };

    try {
      const db = createDb({
        claimNextQueuedRun: vi.fn().mockResolvedValue(reactRun),
        listProjectSecrets: vi.fn().mockResolvedValue({}),
        listDeploymentTargets: vi.fn().mockResolvedValue([
          {
            id: "target-managed",
            projectId: "project-1",
            projectName: "Demo",
            name: "managed-vps",
            targetType: "managed_vps",
            hostRef: "managed",
            composeFile: `${runtimeDir}/docker-compose.yml`,
            service: "app",
            healthcheckUrl: "http://acme-demo-100/",
            managedPort: 6100,
            managedRuntimeDir: runtimeDir,
            managedDomain: null,
            lastStatus: null,
            lastDeployedImage: null,
            lastDeployedAt: null,
            lastError: null
          }
        ])
      });
      const infra = createInfra({
        cloneRepository: vi.fn().mockResolvedValue(repoDir)
      });
      const worker = new PipelineWorker(
        db as any,
        { createInstallationToken: vi.fn().mockResolvedValue("installation-token") } as any,
        infra as any,
        WORKER_CONFIG
      );

      const processed = await worker.processOnce();

      expect(processed).toBe(true);
      expect(infra.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          baseImages: ["node:20-alpine", "nginx:1.27-alpine"]
        })
      );
      expect(infra.deployManagedTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          containerPort: 80
        })
      );

      const dockerfile = readFileSync(join(repoDir, "Dockerfile.autoops"), "utf8");
      expect(dockerfile).toContain("# syntax=docker/dockerfile:1.7");
      expect(dockerfile).toContain("FROM node:20-alpine AS base");
      expect(dockerfile).toContain("FROM base AS deps");
      expect(dockerfile).toContain("COPY package.json pnpm-lock.yaml ./");
      expect(dockerfile).toContain("corepack prepare pnpm@9.0.0 --activate");
      expect(dockerfile).toContain("pnpm install --store-dir /pnpm/store --frozen-lockfile");
      expect(dockerfile).toContain("pnpm ignored-builds");
      expect(dockerfile).toContain("RUN --mount=type=cache,target=/app/node_modules/.cache pnpm build");
      expect(dockerfile).toContain("FROM nginx:1.27-alpine");
      expect(dockerfile).toContain("COPY --from=build /app/dist /usr/share/nginx/html");
    } finally {
      rmSync(runtimeDir, { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("processes a managed Nuxt deployment with a Node runtime", async () => {
    const runtimeDir = mkdtempSync(join(tmpdir(), "autoops-managed-nuxt-test-"));
    const repoDir = mkdtempSync(join(tmpdir(), "autoops-managed-nuxt-repo-"));
    const nuxtRun = {
      ...MANAGED_RUN,
      managedConfig: {
        framework: "nuxt" as const,
        packageManager: "npm" as const,
        installCommand: "npm ci",
        buildCommand: "npm run build",
        startCommand: "npm run start",
        nodeVersion: "20",
        outputPort: 3000,
        outputDirectory: ".output"
      }
    };

    try {
      const db = createDb({
        claimNextQueuedRun: vi.fn().mockResolvedValue(nuxtRun),
        listProjectSecrets: vi.fn().mockResolvedValue({}),
        listDeploymentTargets: vi.fn().mockResolvedValue([
          {
            id: "target-managed",
            projectId: "project-1",
            projectName: "Demo",
            name: "managed-vps",
            targetType: "managed_vps",
            hostRef: "managed",
            composeFile: `${runtimeDir}/docker-compose.yml`,
            service: "app",
            healthcheckUrl: "http://acme-demo-100/",
            managedPort: 6102,
            managedRuntimeDir: runtimeDir,
            managedDomain: null,
            lastStatus: null,
            lastDeployedImage: null,
            lastDeployedAt: null,
            lastError: null
          }
        ])
      });
      const infra = createInfra({
        cloneRepository: vi.fn().mockResolvedValue(repoDir)
      });
      const worker = new PipelineWorker(
        db as any,
        { createInstallationToken: vi.fn().mockResolvedValue("installation-token") } as any,
        infra as any,
        WORKER_CONFIG
      );

      const processed = await worker.processOnce();

      expect(processed).toBe(true);
      expect(infra.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          baseImages: ["node:20-alpine"]
        })
      );
      expect(infra.deployManagedTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          containerPort: 3000
        })
      );

      const dockerfile = readFileSync(join(repoDir, "Dockerfile.autoops"), "utf8");
      expect(dockerfile).toContain("FROM node:20-alpine AS base");
      expect(dockerfile).toContain("ENV PORT=3000");
      expect(dockerfile).toContain("RUN --mount=type=cache,target=/root/.npm npm ci");
      expect(dockerfile).toContain("RUN --mount=type=cache,target=/app/.nuxt npm run build");
      expect(dockerfile).toContain('CMD ["sh", "-lc", "npm run start"]');
    } finally {
      rmSync(runtimeDir, { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("processes a managed static HTML deployment without a Node build stage", async () => {
    const runtimeDir = mkdtempSync(join(tmpdir(), "autoops-managed-static-test-"));
    const repoDir = mkdtempSync(join(tmpdir(), "autoops-managed-static-repo-"));
    const staticRun = {
      ...MANAGED_RUN,
      managedConfig: {
        framework: "static_html" as const,
        packageManager: null,
        installCommand: null,
        buildCommand: null,
        startCommand: null,
        nodeVersion: null,
        outputPort: 80,
        outputDirectory: "."
      }
    };

    try {
      const db = createDb({
        claimNextQueuedRun: vi.fn().mockResolvedValue(staticRun),
        listProjectSecrets: vi.fn().mockResolvedValue({}),
        listDeploymentTargets: vi.fn().mockResolvedValue([
          {
            id: "target-managed",
            projectId: "project-1",
            projectName: "Demo",
            name: "managed-vps",
            targetType: "managed_vps",
            hostRef: "managed",
            composeFile: `${runtimeDir}/docker-compose.yml`,
            service: "app",
            healthcheckUrl: "http://acme-demo-100/",
            managedPort: 6100,
            managedRuntimeDir: runtimeDir,
            managedDomain: null,
            lastStatus: null,
            lastDeployedImage: null,
            lastDeployedAt: null,
            lastError: null
          }
        ])
      });
      const infra = createInfra({
        cloneRepository: vi.fn().mockResolvedValue(repoDir)
      });
      const worker = new PipelineWorker(
        db as any,
        { createInstallationToken: vi.fn().mockResolvedValue("installation-token") } as any,
        infra as any,
        WORKER_CONFIG
      );

      const processed = await worker.processOnce();

      expect(processed).toBe(true);
      expect(infra.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          baseImages: ["nginx:1.27-alpine"]
        })
      );

      const dockerfile = readFileSync(join(repoDir, "Dockerfile.autoops"), "utf8");
      expect(dockerfile).not.toContain("FROM node:");
      expect(dockerfile).toContain("COPY . /usr/share/nginx/html");
      expect(readFileSync(join(repoDir, "nginx.autoops.conf"), "utf8")).toContain("try_files");
    } finally {
      rmSync(runtimeDir, { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("uses the connected GitHub OAuth token for managed deployments without an app installation", async () => {
    const runtimeDir = mkdtempSync(join(tmpdir(), "autoops-managed-oauth-test-"));
    const repoDir = mkdtempSync(join(tmpdir(), "autoops-managed-oauth-repo-"));

    try {
      const db = createDb({
        claimNextQueuedRun: vi.fn().mockResolvedValue(OAUTH_MANAGED_RUN),
        listProjectSecrets: vi.fn().mockResolvedValue({}),
        getGitHubOAuthConnection: vi.fn().mockResolvedValue({
          actorEmail: "admin@autoops.local",
          githubUserId: 99,
          login: "octocat",
          name: "The Octocat",
          avatarUrl: null,
          profileUrl: "https://github.com/octocat",
          scope: "read:user,repo",
          encryptedAccessToken: encryptSecret("oauth-access-token", "master-key-123"),
          connectedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }),
        listDeploymentTargets: vi.fn().mockResolvedValue([
          {
            id: "target-managed",
            projectId: "project-1",
            projectName: "Demo",
            name: "managed-vps",
            targetType: "managed_vps",
            hostRef: "managed",
            composeFile: `${runtimeDir}/docker-compose.yml`,
            service: "app",
            healthcheckUrl: "http://acme-demo-100:3000/",
            managedPort: 6100,
            managedRuntimeDir: runtimeDir,
            managedDomain: null,
            lastStatus: null,
            lastDeployedImage: null,
            lastDeployedAt: null,
            lastError: null
          }
        ])
      });
      const infra = createInfra({
        cloneRepository: vi.fn().mockResolvedValue(repoDir)
      });
      const github = {
        createInstallationToken: vi.fn().mockResolvedValue("installation-token")
      };
      const worker = new PipelineWorker(
        db as any,
        github as any,
        infra as any,
        WORKER_CONFIG
      );

      const processed = await worker.processOnce();

      expect(processed).toBe(true);
      expect(infra.cloneRepository).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "oauth-access-token"
        })
      );
      expect(github.createInstallationToken).not.toHaveBeenCalled();
      expect(db.setRunStatus).toHaveBeenCalledWith("run-1", "succeeded");
    } finally {
      rmSync(runtimeDir, { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("deploys managed preview runs to the target referenced in run metadata", async () => {
    const runtimeDir = mkdtempSync(join(tmpdir(), "autoops-managed-preview-test-"));
    const repoDir = mkdtempSync(join(tmpdir(), "autoops-managed-preview-repo-"));
    const previewTarget = {
      id: "target-preview",
      projectId: "project-1",
      projectName: "Demo",
      name: "preview:feature/nav-refresh",
      targetType: "managed_vps",
      hostRef: "managed",
      composeFile: `${runtimeDir}/docker-compose.yml`,
      service: "app",
      healthcheckUrl: "http://acme-demo-100-feature-nav-refresh-c53e4d7a:3000/",
      managedPort: 6101,
      managedRuntimeDir: runtimeDir,
      managedDomain: null,
      lastStatus: null,
      lastDeployedImage: null,
      lastDeployedAt: null,
      lastError: null
    };

    try {
      const db = createDb({
        claimNextQueuedRun: vi.fn().mockResolvedValue(PREVIEW_MANAGED_RUN),
        listProjectSecrets: vi.fn().mockResolvedValue({}),
        getDeploymentTargetById: vi.fn().mockResolvedValue(previewTarget),
        listDeploymentTargets: vi.fn().mockResolvedValue([
          {
            id: "target-managed",
            projectId: "project-1",
            projectName: "Demo",
            name: "managed-vps",
            targetType: "managed_vps",
            hostRef: "managed",
            composeFile: "/tmp/ignored/docker-compose.yml",
            service: "app",
            healthcheckUrl: "http://acme-demo-100:3000/",
            managedPort: 6100,
            managedRuntimeDir: "/tmp/ignored",
            managedDomain: null,
            lastStatus: null,
            lastDeployedImage: null,
            lastDeployedAt: null,
            lastError: null
          }
        ])
      });
      const infra = createInfra({
        cloneRepository: vi.fn().mockResolvedValue(repoDir)
      });
      const worker = new PipelineWorker(
        db as any,
        { createInstallationToken: vi.fn().mockResolvedValue("installation-token") } as any,
        infra as any,
        WORKER_CONFIG
      );

      const processed = await worker.processOnce();

      expect(processed).toBe(true);
      expect(db.getDeploymentTargetById).toHaveBeenCalledWith("target-preview");
      expect(infra.deployManagedTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          appSlug: expect.stringContaining("autoops-managed-preview-test-")
        })
      );
      expect(db.createDeploymentRevision).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: "target-preview"
        })
      );
    } finally {
      rmSync(runtimeDir, { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("deploys manual promotions without rebuilding the source revision", async () => {
    const stagingTarget = {
      id: "target-staging",
      projectId: "project-1",
      projectName: "Demo",
      name: "staging",
      targetType: "ssh_compose" as const,
      environment: "staging" as const,
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
    const previewTarget = {
      ...stagingTarget,
      id: "target-preview",
      name: "preview",
      environment: "preview" as const,
      promotionOrder: 1,
      protected: false,
      hostRef: "preview",
      composeFile: "/srv/preview/docker-compose.yml",
      healthcheckUrl: "https://preview.example.com/health"
    };
    const db = createDb({
      claimNextQueuedRun: vi.fn().mockResolvedValue(PROMOTION_RUN),
      listProjectSecrets: vi.fn().mockResolvedValue({
        staging_host: encryptSecret("staging.example.com", "master-key-123"),
        staging_user: encryptSecret("deploy", "master-key-123"),
        staging_private_key: encryptSecret("private-key", "master-key-123")
      }),
      getDeploymentTargetById: vi.fn().mockImplementation(async (targetId: string) => {
        if (targetId === "target-staging") {
          return stagingTarget;
        }
        if (targetId === "target-preview") {
          return previewTarget;
        }
        return null;
      }),
      getRevision: vi.fn().mockResolvedValue({
        id: "revision-preview",
        targetId: "target-preview",
        targetName: "preview",
        projectId: "project-1",
        projectName: "Demo",
        runId: "run-source",
        runSource: "manual_deploy",
        imageRef: "ghcr.io/acme/app:preview",
        imageDigest: "sha256:preview",
        status: "succeeded",
        deployedAt: "2026-03-30T00:00:00.000Z",
        rollbackOfRevisionId: null,
        promotedFromRevisionId: null,
        promotedFromTargetId: null,
        promotedFromTargetName: null,
        promotionApprovalId: null,
        promotionApprovalStatus: null
      })
    });
    const infra = createInfra();
    const worker = new PipelineWorker(
      db as any,
      { createInstallationToken: vi.fn().mockResolvedValue("installation-token") } as any,
      infra as any,
      WORKER_CONFIG
    );

    const processed = await worker.processOnce();

    expect(processed).toBe(true);
    expect(infra.cloneRepository).not.toHaveBeenCalled();
    expect(infra.buildImage).not.toHaveBeenCalled();
    expect(infra.runTestCommands).not.toHaveBeenCalled();
    expect(infra.pushImage).not.toHaveBeenCalled();
    expect(infra.deployComposeTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "staging.example.com",
        composeFile: "/srv/staging/docker-compose.yml",
        imageRef: "ghcr.io/acme/app:preview",
        imageDigest: "sha256:preview"
      })
    );
    expect(db.createDeploymentRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: "target-staging",
        imageRef: "ghcr.io/acme/app:preview",
        imageDigest: "sha256:preview"
      })
    );
    expect(db.writeAuditLog).toHaveBeenCalledWith(
      "anas",
      "promotion.succeeded",
      "run",
      "run-1",
      expect.objectContaining({
        sourceRevisionId: "revision-preview",
        destinationTargetId: "target-staging"
      })
    );
  });
});
