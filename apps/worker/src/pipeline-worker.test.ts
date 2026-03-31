import { mkdtempSync, rmSync } from "node:fs";
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
    installCommand: "pnpm install --frozen-lockfile",
    buildCommand: "pnpm build",
    startCommand: "pnpm start",
    nodeVersion: "20",
    outputPort: 3000
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
      expect(infra.buildImage).toHaveBeenCalledTimes(1);
      expect(infra.inspectImageId).toHaveBeenCalledTimes(1);
      expect(infra.deployManagedTarget).toHaveBeenCalledTimes(1);
      expect(db.createDeploymentRevision).toHaveBeenCalledTimes(1);
      expect(db.setRunStatus).toHaveBeenCalledWith("run-1", "succeeded");
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
});
