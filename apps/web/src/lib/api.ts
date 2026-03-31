import type {
  ActivityEvent,
  DashboardOverview,
  DeploymentRevisionSummary,
  DeploymentTargetDetail,
  DeploymentTargetSummary,
  GitHubConnectedAccount,
  GitHubRepositoryFilters,
  GitHubRepositorySummary,
  GitHubUserRepositorySummary,
  PipelineRunSummary,
  ProjectDetail,
  ProjectInstallationSummary,
  ProjectSummary,
  ProjectUpdateInput,
  RollbackRequest,
  RunListFilters,
  RunLogEntry,
  StageRun
} from "@autoops/core";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export interface LoginResponse {
  token: string;
  user: {
    email: string;
  };
}

export interface ProjectCreateInput {
  name: string;
  repoOwner: string;
  repoName: string;
  installationId: number;
  defaultBranch: string;
  configPath: string;
  secrets?: Record<string, string>;
}

export interface RunDetail {
  run: PipelineRunSummary;
  stages: StageRun[];
  logs: RunLogEntry[];
}

export interface DeploymentsIndex {
  targets: DeploymentTargetSummary[];
  revisions: DeploymentRevisionSummary[];
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, API_BASE_URL);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

async function fetchJson<T>(
  path: string,
  token?: string,
  init: RequestInit = {},
  query?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function buildRunStreamUrl(runId: string, token: string) {
  return buildUrl(`/api/runs/${runId}/stream`, { token });
}

export function login(email: string, password: string) {
  return fetchJson<LoginResponse>("/api/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function register(email: string, password: string) {
  return fetchJson<LoginResponse>("/api/auth/register", undefined, {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function getAuthMe(token: string) {
  return fetchJson<{ user: { email: string } }>("/api/auth/me", token);
}

export function getDashboardOverview(token: string) {
  return fetchJson<{ overview: DashboardOverview }>("/api/dashboard/overview", token);
}

export function listProjects(token: string) {
  return fetchJson<{ projects: ProjectSummary[] }>("/api/projects", token);
}

export function getProject(token: string, projectId: string) {
  return fetchJson<ProjectDetail>(`/api/projects/${projectId}`, token);
}

export function createProject(token: string, input: ProjectCreateInput) {
  return fetchJson<{ project: ProjectSummary }>("/api/projects", token, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateProject(
  token: string,
  projectId: string,
  input: ProjectUpdateInput
) {
  return fetchJson<{ project: ProjectSummary }>(`/api/projects/${projectId}`, token, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listRuns(token: string, filters: RunListFilters = {}) {
  return fetchJson<{ runs: PipelineRunSummary[] }>(
    "/api/runs",
    token,
    {},
    filters as Record<string, string | number | undefined>
  );
}

export function getRun(token: string, runId: string) {
  return fetchJson<RunDetail>(`/api/runs/${runId}`, token);
}

export function rerunRun(token: string, runId: string) {
  return fetchJson<{ run: PipelineRunSummary }>(`/api/runs/${runId}/rerun`, token, {
    method: "POST"
  });
}

export function listDeployments(token: string) {
  return fetchJson<DeploymentsIndex>("/api/deployments", token);
}

export function getDeploymentTarget(token: string, targetId: string) {
  return fetchJson<DeploymentTargetDetail>(`/api/deployments/targets/${targetId}`, token);
}

export function rollbackToRevision(token: string, input: Omit<RollbackRequest, "initiatedBy">) {
  return fetchJson<{ run: PipelineRunSummary }>("/api/rollbacks", token, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listActivity(
  token: string,
  query: { limit?: number; kind?: "audit" | "webhook"; status?: string } = {}
) {
  return fetchJson<{ events: ActivityEvent[] }>("/api/activity", token, {}, query);
}

export function listGitHubInstallations(token: string) {
  return fetchJson<{ installations: ProjectInstallationSummary[] }>(
    "/api/github/installations",
    token
  );
}

export function syncGitHubInstallation(token: string, installationId: number) {
  return fetchJson<{
    installation: ProjectInstallationSummary | null;
    repositories: GitHubRepositorySummary[];
  }>(`/api/github/installations/${installationId}/sync`, token, {
    method: "POST"
  });
}

export function listGitHubRepositories(
  token: string,
  filters: GitHubRepositoryFilters = {}
) {
  return fetchJson<{ repositories: GitHubRepositorySummary[] }>(
    "/api/github/repositories",
    token,
    {},
    filters as Record<string, string | number | boolean | undefined>
  );
}

export function importGitHubRepository(
  token: string,
  input: {
    installationId?: number;
    repoId: number;
    owner: string;
    name: string;
    defaultBranch: string;
    htmlUrl?: string;
    isPrivate?: boolean;
    isArchived?: boolean;
  }
) {
  return fetchJson<{ project: ProjectSummary }>("/api/github/repositories/import", token, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getGitHubInstallUrl(token: string, state?: string) {
  return fetchJson<{ url: string }>(
    "/api/github/install-url",
    token,
    {},
    state ? { state } : undefined
  );
}

export function getGitHubOAuthUrl(token: string) {
  return fetchJson<{ url: string }>("/api/github/oauth-url", token);
}

export function completeGitHubOAuth(
  token: string,
  input: { code: string; state: string }
) {
  return fetchJson<{ account: GitHubConnectedAccount | null }>(
    "/api/github/oauth/complete",
    token,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export function getGitHubAccount(token: string) {
  return fetchJson<{ account: GitHubConnectedAccount | null }>(
    "/api/github/account",
    token
  );
}

export function listGitHubUserRepositories(token: string) {
  return fetchJson<{ repositories: GitHubUserRepositorySummary[] }>(
    "/api/github/account/repositories",
    token
  );
}

export function deployManagedProject(token: string, projectId: string) {
  return fetchJson<{ run: PipelineRunSummary }>(`/api/projects/${projectId}/deploy`, token, {
    method: "POST"
  });
}
