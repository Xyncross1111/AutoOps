import { describe, expect, it, vi } from "vitest";

import { GitHubWebhookService } from "./webhook-service.js";

const PIPELINE = `
version: 1
triggers:
  push:
    branches:
      - main
build:
  context: .
  dockerfile: Dockerfile
  image: ghcr.io/acme/app
test:
  commands:
    - npm test
deploy:
  targets:
    - name: production
      hostRef: prod
      composeFile: /srv/app/docker-compose.yml
      service: app
      healthcheck:
        url: https://example.com/health
`;

const MANAGED_CONFIG = {
  framework: "nextjs" as const,
  packageManager: "pnpm" as const,
  installCommand: "pnpm install --frozen-lockfile",
  buildCommand: "pnpm build",
  startCommand: "pnpm start",
  nodeVersion: "20",
  outputPort: 3000,
  outputDirectory: ".next"
};

const CONFIG = {
  MANAGED_APPS_DIR: "/opt/autoops-managed",
  MANAGED_BASE_DOMAIN: "",
  WEB_BASE_URL: "http://213.199.63.29"
};

describe("GitHubWebhookService", () => {
  it("queues a run for a matching push event", async () => {
    const db = {
      hasWebhookDelivery: vi.fn().mockResolvedValue(false),
      recordWebhookDelivery: vi.fn().mockResolvedValue(undefined),
      upsertGitHubInstallation: vi.fn().mockResolvedValue(undefined),
      getProjectByRepo: vi.fn().mockResolvedValue({
        id: "project-1",
        mode: "custom_pipeline",
        defaultBranch: "main",
        configPath: ".autoops/pipeline.yml"
      }),
      createRun: vi.fn().mockResolvedValue({ id: "run-1" }),
      supersedeQueuedRuns: vi.fn().mockResolvedValue(undefined)
    };
    const github = {
      fetchRepositoryFile: vi.fn().mockResolvedValue(PIPELINE)
    };

    const service = new GitHubWebhookService(db as any, github as any, CONFIG as any);
    const result = await service.handle(
      {
        deliveryId: "delivery-1",
        eventName: "push",
        signature: "sha256=test"
      },
      {
        ref: "refs/heads/main",
        after: "abc123",
        sender: { login: "anas" },
        installation: { id: 12 },
        repository: {
          name: "demo",
          owner: { login: "acme" }
        }
      }
    );

    expect(result).toEqual({ status: "processed", runId: "run-1" });
    expect(github.fetchRepositoryFile).toHaveBeenCalledWith({
      installationId: 12,
      owner: "acme",
      repo: "demo",
      path: ".autoops/pipeline.yml",
      ref: "abc123"
    });
    expect(db.createRun).toHaveBeenCalledTimes(1);
    expect(db.supersedeQueuedRuns).toHaveBeenCalledWith("project-1", "main", "run-1");
  });

  it("ignores pushes that do not match the configured branches", async () => {
    const db = {
      hasWebhookDelivery: vi.fn().mockResolvedValue(false),
      recordWebhookDelivery: vi.fn().mockResolvedValue(undefined),
      getProjectByRepo: vi.fn().mockResolvedValue({
        id: "project-1",
        mode: "custom_pipeline",
        defaultBranch: "main",
        configPath: ".autoops/pipeline.yml"
      }),
      createRun: vi.fn().mockResolvedValue({ id: "run-1" }),
      supersedeQueuedRuns: vi.fn().mockResolvedValue(undefined)
    };
    const github = {
      fetchRepositoryFile: vi.fn().mockResolvedValue(PIPELINE)
    };

    const service = new GitHubWebhookService(db as any, github as any, CONFIG as any);
    const result = await service.handle(
      {
        deliveryId: "delivery-2",
        eventName: "push",
        signature: "sha256=test"
      },
      {
        ref: "refs/heads/feature/not-deployed",
        after: "abc123",
        sender: { login: "anas" },
        installation: { id: 12 },
        repository: {
          name: "demo",
          owner: { login: "acme" }
        }
      }
    );

    expect(result).toEqual({ status: "ignored" });
    expect(db.createRun).not.toHaveBeenCalled();
  });

  it("queues managed production deployments without fetching pipeline.yml", async () => {
    const productionTarget = {
      id: "target-production",
      projectId: "project-1",
      projectName: "Demo",
      name: "managed-vps",
      targetType: "managed_vps",
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
    const db = {
      hasWebhookDelivery: vi.fn().mockResolvedValue(false),
      recordWebhookDelivery: vi.fn().mockResolvedValue(undefined),
      getProjectByRepo: vi.fn().mockResolvedValue({
        id: "project-1",
        mode: "managed_nextjs",
        defaultBranch: "main",
        configPath: ".autoops/pipeline.yml",
        appSlug: "acme-demo-100",
        managedConfig: MANAGED_CONFIG
      }),
      listDeploymentTargets: vi.fn().mockResolvedValue([productionTarget]),
      syncDeploymentTargets: vi.fn().mockResolvedValue([productionTarget]),
      createRun: vi.fn().mockResolvedValue({ id: "run-managed" }),
      supersedeQueuedRuns: vi.fn().mockResolvedValue(undefined)
    };
    const github = {
      fetchRepositoryFile: vi.fn()
    };

    const service = new GitHubWebhookService(db as any, github as any, CONFIG as any);
    const result = await service.handle(
      {
        deliveryId: "delivery-3",
        eventName: "push",
        signature: "sha256=test"
      },
      {
        ref: "refs/heads/main",
        after: "def456",
        sender: { login: "anas" },
        installation: { id: 12 },
        repository: {
          name: "demo",
          owner: { login: "acme" }
        }
      }
    );

    expect(result).toEqual({ status: "processed", runId: "run-managed" });
    expect(github.fetchRepositoryFile).not.toHaveBeenCalled();
    expect(db.createRun).toHaveBeenCalledWith({
      projectId: "project-1",
      deliveryId: "delivery-3",
      source: "push",
      branch: "main",
      commitSha: "def456",
      triggeredBy: "anas",
      metadata: {
        repoAccess: {
          type: "installation",
          installationId: 12
        },
        managedDeployment: {
          targetId: "target-production",
          targetName: "managed-vps",
          environment: "production",
          targetUrl: "http://213.199.63.29:6100"
        }
      }
    });
  });

  it("creates a preview target for non-default managed branches", async () => {
    const previewTarget = {
      id: "target-preview",
      projectId: "project-1",
      projectName: "Demo",
      name: "preview:feature/new-nav",
      targetType: "managed_vps",
      hostRef: "managed",
      composeFile: "/opt/autoops-managed/apps/acme-demo-100-feature-new-nav-d1b4c84d/docker-compose.yml",
      service: "app",
      healthcheckUrl: "http://acme-demo-100-feature-new-nav-d1b4c84d:3000/",
      managedPort: 6101,
      managedRuntimeDir: "/opt/autoops-managed/apps/acme-demo-100-feature-new-nav-d1b4c84d",
      managedDomain: null,
      lastStatus: null,
      lastDeployedImage: null,
      lastDeployedAt: null,
      lastError: null
    };
    const db = {
      hasWebhookDelivery: vi.fn().mockResolvedValue(false),
      recordWebhookDelivery: vi.fn().mockResolvedValue(undefined),
      listProjectsByRepo: vi.fn().mockResolvedValue([
        {
          id: "project-1",
          mode: "managed_nextjs",
          defaultBranch: "main",
          configPath: ".autoops/pipeline.yml",
          appSlug: "acme-demo-100",
          managedConfig: MANAGED_CONFIG
        }
      ]),
      listDeploymentTargets: vi.fn().mockResolvedValue([]),
      reserveNextManagedPort: vi.fn().mockResolvedValue(6101),
      syncDeploymentTargets: vi.fn().mockResolvedValue([previewTarget]),
      createRun: vi.fn().mockResolvedValue({ id: "run-preview" }),
      supersedeQueuedRuns: vi.fn().mockResolvedValue(undefined)
    };
    const github = {
      fetchRepositoryFile: vi.fn()
    };

    const service = new GitHubWebhookService(db as any, github as any, CONFIG as any);
    const result = await service.handle(
      {
        deliveryId: "delivery-4",
        eventName: "push",
        signature: "sha256=test"
      },
      {
        ref: "refs/heads/feature/new-nav",
        after: "123456",
        sender: { login: "anas" },
        installation: { id: 12 },
        repository: {
          name: "demo",
          owner: { login: "acme" }
        }
      }
    );

    expect(result).toEqual({ status: "processed", runId: "run-preview" });
    expect(db.reserveNextManagedPort).toHaveBeenCalledTimes(1);
    expect(db.createRun).toHaveBeenCalledWith({
      projectId: "project-1",
      deliveryId: "delivery-4",
      source: "push",
      branch: "feature/new-nav",
      commitSha: "123456",
      triggeredBy: "anas",
      metadata: {
        repoAccess: {
          type: "installation",
          installationId: 12
        },
        managedDeployment: {
          targetId: "target-preview",
          targetName: "preview:feature/new-nav",
          environment: "preview",
          targetUrl: "http://213.199.63.29:6101"
        }
      }
    });
  });
});
