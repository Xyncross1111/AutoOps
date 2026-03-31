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
  defaultBranch: "main",
  configPath: ".autoops/pipeline.yml",
  branch: "main",
  commitSha: "abcdef1234567890",
  source: "push" as const,
  triggeredBy: "anas",
  pipelineConfig: PIPELINE,
  metadata: {}
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
        hostRef: "prod",
        composeFile: "/srv/app/docker-compose.yml",
        service: "app",
        healthcheckUrl: "https://example.com/health",
        lastStatus: null,
        lastDeployedImage: null,
        lastDeployedAt: null,
        lastError: null
      }
    ]),
    upsertStageRun: vi.fn().mockResolvedValue(undefined),
    createDeploymentRevision: vi.fn().mockResolvedValue(undefined),
    markDeploymentTargetStatus: vi.fn().mockResolvedValue(undefined),
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
    deployComposeTarget: vi.fn().mockResolvedValue(undefined),
    waitForHealthcheck: vi.fn().mockResolvedValue(undefined),
    cleanupPath: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe("PipelineWorker", () => {
  it("processes a successful queued run end to end", async () => {
    const db = createDb();
    const infra = createInfra();
    const worker = new PipelineWorker(
      db as any,
      { createInstallationToken: vi.fn().mockResolvedValue("installation-token") } as any,
      infra as any,
      {
        DATABASE_URL: "",
        SECRET_MASTER_KEY: "master-key-123",
        GITHUB_APP_ID: 0,
        GITHUB_PRIVATE_KEY: "",
        WORKER_POLL_INTERVAL_MS: 1000,
        RUNNER_TEMP_DIR: "./tmp"
      }
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
      {
        DATABASE_URL: "",
        SECRET_MASTER_KEY: "master-key-123",
        GITHUB_APP_ID: 0,
        GITHUB_PRIVATE_KEY: "",
        WORKER_POLL_INTERVAL_MS: 1000,
        RUNNER_TEMP_DIR: "./tmp"
      }
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
});
