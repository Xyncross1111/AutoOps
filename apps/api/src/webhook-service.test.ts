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

describe("GitHubWebhookService", () => {
  it("queues a run for a matching push event", async () => {
    const db = {
      hasWebhookDelivery: vi.fn().mockResolvedValue(false),
      recordWebhookDelivery: vi.fn().mockResolvedValue(undefined),
      upsertGitHubInstallation: vi.fn().mockResolvedValue(undefined),
      getProjectByRepo: vi.fn().mockResolvedValue({
        id: "project-1",
        configPath: ".autoops/pipeline.yml"
      }),
      createRun: vi.fn().mockResolvedValue({ id: "run-1" }),
      supersedeQueuedRuns: vi.fn().mockResolvedValue(undefined)
    };
    const github = {
      fetchRepositoryFile: vi.fn().mockResolvedValue(PIPELINE)
    };

    const service = new GitHubWebhookService(db as any, github as any);
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
        configPath: ".autoops/pipeline.yml"
      }),
      createRun: vi.fn().mockResolvedValue({ id: "run-1" }),
      supersedeQueuedRuns: vi.fn().mockResolvedValue(undefined)
    };
    const github = {
      fetchRepositoryFile: vi.fn().mockResolvedValue(PIPELINE)
    };

    const service = new GitHubWebhookService(db as any, github as any);
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
});
