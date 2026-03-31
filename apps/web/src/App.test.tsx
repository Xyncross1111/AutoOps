// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

  it("renders the premium login screen when no token is present", () => {
    render(<App />);

    expect(
      screen.getByText("Sign in to AutoOps")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /premium control room/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enter Control Plane" })
    ).toBeInTheDocument();
  });

  it("renders the overview shell for an authenticated user", async () => {
    localStorage.setItem("autoops-token", "test-token");

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
                    unhealthyTargetCount: 1
                  },
                  attention: {
                    latestFailedRun: null,
                    activeRuns: [],
                    unhealthyTargets: []
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

        return Promise.resolve(
          new Response(JSON.stringify({ projects: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Operational Overview")).toBeInTheDocument();
    });

    expect(screen.getByText("Premium operations dashboard")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Projects$/i })).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("94%")).toBeInTheDocument();
  });
});
