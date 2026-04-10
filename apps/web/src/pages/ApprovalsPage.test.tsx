// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AppSessionContext } from "../app-context";
import { ApprovalsPage } from "./ApprovalsPage";

describe("ApprovalsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders pending and completed approval entries with dashboard actions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes("/api/approvals")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                approvals: [
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
                    requestComment: "Ready for production",
                    decisionComment: null,
                    status: "pending",
                    queuedRunId: null,
                    createdAt: "2026-04-08T00:00:00.000Z",
                    decidedAt: null
                  },
                  {
                    id: "approval-2",
                    projectId: "project-1",
                    projectName: "Demo",
                    sourceRevisionId: "revision-2",
                    sourceTargetId: "target-preview",
                    sourceTargetName: "preview:feature-two",
                    destinationTargetId: "target-production",
                    destinationTargetName: "production",
                    sourceImageRef: "ghcr.io/acme/demo:preview-2",
                    sourceImageDigest: "sha256:preview2",
                    requestedBy: "admin@autoops.local",
                    decidedBy: "admin@autoops.local",
                    requestComment: null,
                    decisionComment: "Looks good",
                    status: "approved",
                    queuedRunId: "run-2",
                    createdAt: "2026-04-07T00:00:00.000Z",
                    decidedAt: "2026-04-07T01:00:00.000Z"
                  }
                ]
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
          <ApprovalsPage />
        </MemoryRouter>
      </AppSessionContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText("Pending approvals")).toBeInTheDocument();
    });

    expect(screen.getByText("preview:feature-one to production")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByText("Recent decisions")).toBeInTheDocument();
    expect(screen.getByText("Looks good")).toBeInTheDocument();
  });
});
