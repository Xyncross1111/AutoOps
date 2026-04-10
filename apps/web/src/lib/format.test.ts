import { describe, expect, it } from "vitest";

import { formatFailureSummary } from "./format";

describe("formatFailureSummary", () => {
  it("condenses git host resolution failures", () => {
    expect(
      formatFailureSummary(
        "git -C /tmp/autoops/run-xxxx fetch --depth 1 origin abc123 failed with exit code 128: fatal: unable to access 'https://github.com/Xyncross111/AxleSense.git/': Could not resolve host: github.com"
      )
    ).toBe("Git sync failed: Could not resolve host: github.com");
  });

  it("highlights missing environment variables", () => {
    expect(
      formatFailureSummary(
        "next build failed with exit code 1: Please define MONGODB_URI environment variable inside .env.local"
      )
    ).toBe("Missing environment variable: MONGODB_URI");
  });

  it("falls back to a compact docker build summary for noisy logs", () => {
    expect(
      formatFailureSummary(
        "docker build -f Dockerfile.autoops -t demo failed with exit code 1: #1 [internal] load build definition from Dockerfile.autoops #1 transferring dockerfile: 587B 0.0s done #1 DONE 0.3s #2 resolve image config for docker-image://docker.io/docker/dockerfile:1.7 #2 DONE 11.4s #3 docker-image://docker.io/docker/dockerfile:1.7@sha256:abc 8.40kB / 8.40kB done #3 482B / 482B done"
      )
    ).toBe("Docker build failed. Open deployments for full logs.");
  });
});
