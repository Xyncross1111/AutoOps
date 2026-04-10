// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AppSessionContext } from "../app-context";
import { DeploymentsPage } from "./DeploymentsPage";

describe("DeploymentsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a promote action only for the immediate next release target", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes("/api/deployments/targets/target-preview")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                target: {
                  id: "target-preview",
                  projectId: "project-1",
                  projectName: "Demo",
                  name: "preview:feature-one",
                  targetType: "ssh_compose",
                  environment: "preview",
                  promotionOrder: 1,
                  protected: false,
                  hostRef: "preview",
                  composeFile: "/srv/preview/docker-compose.yml",
                  service: "app",
                  healthcheckUrl: "https://preview.example.com/health",
                  managedPort: null,
                  managedRuntimeDir: null,
                  managedDomain: null,
                  lastStatus: "succeeded",
                  lastDeployedImage: "ghcr.io/acme/demo:preview@sha256:preview",
                  lastDeployedAt: "2026-04-08T00:00:00.000Z",
                  lastError: null
                },
                revisions: [
                  {
                    id: "revision-1",
                    targetId: "target-preview",
                    targetName: "preview:feature-one",
                    projectId: "project-1",
                    projectName: "Demo",
                    runId: "run-1",
                    runSource: "manual_deploy",
                    imageRef: "ghcr.io/acme/demo:preview",
                    imageDigest: "sha256:preview",
                    status: "succeeded",
                    deployedAt: "2026-04-08T00:00:00.000Z",
                    rollbackOfRevisionId: null,
                    promotedFromRevisionId: null,
                    promotedFromTargetId: null,
                    promotedFromTargetName: null,
                    promotionApprovalId: null,
                    promotionApprovalStatus: null
                  }
                ],
                linkedRuns: []
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" }
              }
            )
          );
        }

        if (url.includes("/api/deployments")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                targets: [
                  {
                    id: "target-preview",
                    projectId: "project-1",
                    projectName: "Demo",
                    name: "preview:feature-one",
                    targetType: "ssh_compose",
                    environment: "preview",
                    promotionOrder: 1,
                    protected: false,
                    hostRef: "preview",
                    composeFile: "/srv/preview/docker-compose.yml",
                    service: "app",
                    healthcheckUrl: "https://preview.example.com/health",
                    managedPort: null,
                    managedRuntimeDir: null,
                    managedDomain: null,
                    lastStatus: "succeeded",
                    lastDeployedImage: "ghcr.io/acme/demo:preview@sha256:preview",
                    lastDeployedAt: "2026-04-08T00:00:00.000Z",
                    lastError: null
                  },
                  {
                    id: "target-production",
                    projectId: "project-1",
                    projectName: "Demo",
                    name: "production",
                    targetType: "ssh_compose",
                    environment: "production",
                    promotionOrder: 2,
                    protected: true,
                    hostRef: "prod",
                    composeFile: "/srv/prod/docker-compose.yml",
                    service: "app",
                    healthcheckUrl: "https://demo.example.com/health",
                    managedPort: null,
                    managedRuntimeDir: null,
                    managedDomain: null,
                    lastStatus: "succeeded",
                    lastDeployedImage: "ghcr.io/acme/demo:old@sha256:old",
                    lastDeployedAt: "2026-04-07T00:00:00.000Z",
                    lastError: null
                  },
                  {
                    id: "target-staging",
                    projectId: "project-1",
                    projectName: "Demo",
                    name: "staging",
                    targetType: "ssh_compose",
                    environment: "staging",
                    promotionOrder: 3,
                    protected: true,
                    hostRef: "staging",
                    composeFile: "/srv/staging/docker-compose.yml",
                    service: "app",
                    healthcheckUrl: "https://staging.example.com/health",
                    managedPort: null,
                    managedRuntimeDir: null,
                    managedDomain: null,
                    lastStatus: "succeeded",
                    lastDeployedImage: "ghcr.io/acme/demo:old@sha256:old",
                    lastDeployedAt: "2026-04-07T00:00:00.000Z",
                    lastError: null
                  }
                ],
                revisions: []
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" }
              }
            )
          );
        }

        return Promise.reject(new Error(`Unexpected request: ${url}`));
      })
    );

    render(
      <AppSessionContext.Provider
        value={{
          token: "test-token",
          userEmail: "admin@autoops.local",
          refreshNonce: 0,
          setUserEmail: vi.fn(),
          refreshApp: vi.fn(),
          logout: vi.fn()
        }}
      >
        <MemoryRouter initialEntries={["/deployments?target=target-preview"]}>
          <Routes>
            <Route path="/deployments" element={<DeploymentsPage />} />
          </Routes>
        </MemoryRouter>
      </AppSessionContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText("Revision ledger")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Promote to Production" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Promote to Staging" })).not.toBeInTheDocument();
  });
});
