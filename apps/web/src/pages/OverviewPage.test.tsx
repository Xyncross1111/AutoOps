// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AppSessionContext } from "../app-context";
import { OverviewPage } from "./OverviewPage";

describe("OverviewPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces the pending approvals metric and queue preview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes("/api/dashboard/overview")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                overview: {
                  metrics: {
                    projectCount: 2,
                    queuedRunCount: 1,
                    runningRunCount: 0,
                    successRate7d: 100,
                    unhealthyTargetCount: 0,
                    pendingApprovalCount: 1
                  },
                  attention: {
                    latestFailedRun: null,
                    activeRuns: [],
                    unhealthyTargets: [],
                    pendingApprovals: [
                      {
                        id: "approval-1",
                        projectId: "project-1",
                        projectName: "Demo",
                        sourceRevisionId: "revision-1",
                        sourceTargetId: "target-preview",
                        sourceTargetName: "preview:feature-one",
                        destinationTargetId: "target-production",
                        destinationTargetName: "production",
                        sourceImageRef: "ghcr.io/acme/demo:preview",
                        sourceImageDigest: "sha256:preview",
                        requestedBy: "admin@autoops.local",
                        decidedBy: null,
                        requestComment: null,
                        decisionComment: null,
                        status: "pending",
                        queuedRunId: null,
                        createdAt: "2026-04-08T00:00:00.000Z",
                        decidedAt: null
                      }
                    ]
                  },
                  recentRuns: [],
                  recentDeployments: [],
                  recentActivity: []
                }
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
        <MemoryRouter>
          <OverviewPage />
        </MemoryRouter>
      </AppSessionContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText("Pending approvals")).toBeInTheDocument();
    });

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("preview:feature-one to production")).toBeInTheDocument();
    expect(screen.getByText("Open queue")).toBeInTheDocument();
  });
});
