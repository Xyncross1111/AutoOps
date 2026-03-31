import { describe, expect, it } from "vitest";

import { matchesPushTrigger, parsePipelineConfig } from "./pipeline.js";

const SAMPLE_PIPELINE = `
version: 1
triggers:
  push:
    branches:
      - main
      - release/*
build:
  context: .
  dockerfile: Dockerfile
  image: ghcr.io/acme/app
test:
  commands:
    - npm ci
    - npm test
deploy:
  targets:
    - name: production
      hostRef: prod
      composeFile: /srv/app/docker-compose.yml
      service: web
      healthcheck:
        url: https://example.com/health
`;

describe("pipeline config", () => {
  it("parses the expected phase 1 schema", () => {
    const parsed = parsePipelineConfig(SAMPLE_PIPELINE);
    expect(parsed.build.image).toBe("ghcr.io/acme/app");
    expect(parsed.deploy.targets[0]?.name).toBe("production");
  });

  it("matches push branches using glob patterns", () => {
    const parsed = parsePipelineConfig(SAMPLE_PIPELINE);
    expect(matchesPushTrigger(parsed, "refs/heads/main")).toBe(true);
    expect(matchesPushTrigger(parsed, "refs/heads/release/v1")).toBe(true);
    expect(matchesPushTrigger(parsed, "refs/heads/feature/test")).toBe(false);
  });
});

