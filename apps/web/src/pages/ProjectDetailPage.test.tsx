// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AppSessionContext } from "../app-context";
import { ProjectDetailPage } from "./ProjectDetailPage";

const managedDetail = {
  project: {
    id: "project-1",
    name: "Demo",
    repoOwner: "acme",
    repoName: "demo",
    installationId: 1,
    mode: "managed_nextjs" as const,
    githubRepoId: 100,
    defaultBranch: "main",
    configPath: ".autoops/pipeline.yml",
    appSlug: "acme-demo-100",
    primaryUrl: "https://demo.autoops.local",
    managedConfig: {
      framework: "nextjs" as const,
      packageManager: "pnpm" as const,
      packageManagerVersion: "9.0.0",
      installCommand: "pnpm install --frozen-lockfile",
      buildCommand: "pnpm build",
      startCommand: "pnpm start",
      nodeVersion: "20",
      outputPort: 3000,
      outputDirectory: ".next"
    },
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    targetCount: 1,
    latestRunStatus: "failed" as const
  },
  recentRuns: [],
  deploymentTargets: [
    {
      id: "target-1",
      projectId: "project-1",
      projectName: "Demo",
      name: "production",
      targetType: "managed_vps" as const,
      hostRef: "managed",
      composeFile: "docker-compose.yml",
      service: "app",
      healthcheckUrl: "https://demo.autoops.local/health",
      managedPort: 6100,
      managedRuntimeDir: "/opt/autoops-managed/apps/demo",
      managedDomain: null,
      lastStatus: "succeeded",
      lastDeployedImage:
        "autoops-managed-xyncross111-saikrupa-1084578851:b191067a-5580-47e9-b2bf-f07383a88c21@sha256:c739a3ff6d0925faea0480a2f4d1498b31b06a2ab94d4016556114ef278d36c8",
      lastDeployedAt: "2026-04-01T00:00:00.000Z",
      lastError: null
    },
    {
      id: "target-preview",
      projectId: "project-1",
      projectName: "Demo",
      name: "preview:feature/nav-refresh",
      targetType: "managed_vps" as const,
      environment: "preview" as const,
      promotionOrder: 1,
      protected: false,
      hostRef: "managed",
      composeFile: "docker-compose.preview.yml",
      service: "app",
      healthcheckUrl: "http://acme-demo-100-preview/health",
      managedPort: 6101,
      managedRuntimeDir: "/opt/autoops-managed/apps/demo-preview",
      managedDomain: "demo-preview.autoops.local",
      lastStatus: "running",
      lastDeployedImage: "ghcr.io/acme/demo@sha256:preview",
      lastDeployedAt: "2026-04-02T00:00:00.000Z",
      lastError: null
    }
  ],
  installation: null,
  repository: null,
  secretNames: ["NEXT_PUBLIC_APP_URL"]
};

describe("ProjectDetailPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("allows managed projects to save application secrets", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/projects/project-1") && (!init?.method || init.method === "GET")) {
        return Promise.resolve(
          new Response(JSON.stringify(managedDetail), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      if (url.includes("/api/projects/project-1") && init?.method === "PATCH") {
        return Promise.resolve(
          new Response(JSON.stringify({ project: managedDetail.project }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

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
        <MemoryRouter initialEntries={["/projects/project-1"]}>
          <Routes>
            <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AppSessionContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText("Demo")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Secrets" }));

    expect(screen.getByText("Managed builds and runtime containers receive these values as environment variables.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Secret name"), {
      target: { value: "MONGODB_URI" }
    });
    fireEvent.change(screen.getByLabelText("Secret value"), {
      target: { value: "mongodb://mongo.internal:27017/app" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save secret update" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/projects/project-1"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            name: "Demo",
            defaultBranch: "main",
            secrets: {
              MONGODB_URI: "mongodb://mongo.internal:27017/app"
            }
          })
        })
      );
    });
  });

  it("preserves the full deployment text in the environment summary tooltip", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/api/projects/project-1") && (!init?.method || init.method === "GET")) {
          return Promise.resolve(
            new Response(JSON.stringify(managedDetail), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            })
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
        <MemoryRouter initialEntries={["/projects/project-1"]}>
          <Routes>
            <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AppSessionContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText("Environments")).toBeInTheDocument();
    });

    expect(
      screen.getByTitle(managedDetail.deploymentTargets[0].lastDeployedImage)
    ).toBeInTheDocument();
  });

  it("surfaces preview environments with direct open links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/api/projects/project-1") && (!init?.method || init.method === "GET")) {
          return Promise.resolve(
            new Response(JSON.stringify(managedDetail), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            })
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
        <MemoryRouter initialEntries={["/projects/project-1"]}>
          <Routes>
            <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AppSessionContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText("Branch deploys")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Preview / feature/nav-refresh")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Open preview" })).toHaveAttribute(
      "href",
      "https://demo-preview.autoops.local"
    );
  });

  it("deletes a project after the name is confirmed", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/projects/project-1") && (!init?.method || init.method === "GET")) {
        return Promise.resolve(
          new Response(JSON.stringify(managedDetail), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      if (url.includes("/api/projects/project-1") && init?.method === "DELETE") {
        return Promise.resolve(
          new Response(JSON.stringify({ project: managedDetail.project }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

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
        <MemoryRouter initialEntries={["/projects/project-1"]}>
          <Routes>
            <Route path="/projects" element={<div>Projects list</div>} />
            <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AppSessionContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText("Demo")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const deleteButton = screen.getByRole("button", { name: "Delete project" });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Type project name to confirm"), {
      target: { value: "Demo" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/projects/project-1"),
        expect.objectContaining({
          method: "DELETE"
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Projects list")).toBeInTheDocument();
    });
  });
});
