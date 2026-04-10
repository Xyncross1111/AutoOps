// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

describe("App", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  function stubAuthenticatedFetch(options?: {
    githubAccount?: {
      githubUserId: number;
      login: string;
      name: string | null;
      avatarUrl: string | null;
      profileUrl: string;
      scope: string | null;
      connectedAt: string;
      updatedAt: string;
    } | null;
    installations?: Array<{
      installationId: number;
      accountLogin: string;
      accountType: string;
      syncStatus: string;
      repoCount: number;
      installedAt: string;
      updatedAt: string;
      lastSyncAt: string | null;
      lastSyncError: string | null;
    }>;
  }) {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes("/api/auth/me")) {
          return Promise.resolve(
            new Response(JSON.stringify({ user: { email: "admin@autoops.local" } }), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            })
          );
        }

        if (url.includes("/api/dashboard/overview")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                overview: {
                  metrics: {
                    projectCount: 4,
                    queuedRunCount: 2,
                    runningRunCount: 1,
                    successRate7d: 94,
                    unhealthyTargetCount: 1,
                    pendingApprovalCount: 0
                  },
                  attention: {
                    latestFailedRun: null,
                    activeRuns: [],
                    unhealthyTargets: [],
                    pendingApprovals: []
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

        if (url.includes("/api/github/account")) {
          return Promise.resolve(
            new Response(JSON.stringify({ account: options?.githubAccount ?? null }), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            })
          );
        }

        if (url.includes("/api/github/installations")) {
          return Promise.resolve(
            new Response(JSON.stringify({ installations: options?.installations ?? [] }), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            })
          );
        }

        return Promise.resolve(
          new Response(JSON.stringify({ projects: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      })
    );
  }

  it("renders the new operator login screen when no token is present", () => {
    render(<App />);

    expect(
      screen.getByText("Sign in to your workspace")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /ship reliable pipelines from day one/i
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enter Control Plane" })
    ).toBeInTheDocument();
  });

  it("renders the overview shell for an authenticated user", async () => {
    localStorage.setItem("autoops-token", "test-token");

    stubAuthenticatedFetch();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Operational overview")).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "Track delivery health, active work, and the operational items that need attention first."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Projects$/i })).toBeInTheDocument();
    expect(screen.getByText("4 projects")).toBeInTheDocument();
    expect(screen.getByText("94% success")).toBeInTheDocument();

    const sidebarFooter = document.querySelector(".ao-sidebar__footer");
    expect(sidebarFooter).not.toBeNull();
    await waitFor(() => {
      expect(within(sidebarFooter as HTMLElement).getByRole("link", { name: "Connect GitHub" })).toBeInTheDocument();
    });
  });

  it("hides the sidebar connect action after GitHub is already connected", async () => {
    localStorage.setItem("autoops-token", "test-token");

    stubAuthenticatedFetch({
      githubAccount: {
        githubUserId: 99,
        login: "octocat",
        name: "Octocat",
        avatarUrl: null,
        profileUrl: "https://github.com/octocat",
        scope: "repo",
        connectedAt: "2026-04-07T20:00:00.000Z",
        updatedAt: "2026-04-07T20:00:00.000Z"
      }
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Operational overview")).toBeInTheDocument();
    });

    const sidebarFooter = document.querySelector(".ao-sidebar__footer");
    expect(sidebarFooter).not.toBeNull();
    await waitFor(() => {
      expect(within(sidebarFooter as HTMLElement).queryByRole("link", { name: "Connect GitHub" })).not.toBeInTheDocument();
    });
  });
});
