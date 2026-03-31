import { FormEvent, useEffect, useMemo, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

interface Project {
  id: string;
  name: string;
  repoOwner: string;
  repoName: string;
  installationId: number;
  defaultBranch: string;
  configPath: string;
  targetCount: number;
  latestRunStatus: string | null;
}

interface RunSummary {
  id: string;
  projectId: string;
  projectName: string;
  source: string;
  branch: string;
  commitSha: string;
  status: string;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  triggeredBy: string;
  errorMessage: string | null;
}

interface StageRun {
  id: string;
  stageName: string;
  stageOrder: number;
  status: string;
}

interface RunLog {
  id: number;
  stageName: string;
  message: string;
  createdAt: string;
}

interface RunDetail {
  run: RunSummary;
  stages: StageRun[];
  logs: RunLog[];
}

interface DeploymentTarget {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  hostRef: string;
  composeFile: string;
  service: string;
  healthcheckUrl: string;
  lastStatus: string | null;
  lastDeployedImage: string | null;
  lastDeployedAt: string | null;
  lastError: string | null;
}

interface DeploymentRevision {
  id: string;
  targetId: string;
  targetName: string;
  projectId: string;
  projectName: string;
  runId: string | null;
  imageRef: string;
  imageDigest: string;
  status: string;
  deployedAt: string;
  rollbackOfRevisionId: string | null;
}

interface LoginResponse {
  token: string;
  user: {
    email: string;
  };
}

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem("autoops-token") ?? "");
  const [userEmail, setUserEmail] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [deployments, setDeployments] = useState<DeploymentTarget[]>([]);
  const [revisions, setRevisions] = useState<DeploymentRevision[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>("");
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [liveLogs, setLiveLogs] = useState<RunLog[]>([]);
  const [projectForm, setProjectForm] = useState({
    name: "",
    repoOwner: "",
    repoName: "",
    installationId: "",
    defaultBranch: "main",
    configPath: ".autoops/pipeline.yml",
    secretsJson: "{\n  \"ghcr_username\": \"\",\n  \"ghcr_token\": \"\"\n}"
  });

  const selectedRunSummary = useMemo(
    () => runs.find((run) => run.id === selectedRun) ?? null,
    [runs, selectedRun]
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    localStorage.setItem("autoops-token", token);
    void loadDashboard(token);
  }, [token]);

  useEffect(() => {
    if (!selectedRun || !token) {
      return;
    }
    let active = true;
    setLiveLogs([]);
    void fetchRunDetail(selectedRun, token).then((detail) => {
      if (active) {
        setRunDetail(detail);
        setLiveLogs(detail.logs);
      }
    });

    const source = new EventSource(
      `${API_BASE_URL}/api/runs/${selectedRun}/stream?token=${encodeURIComponent(token)}`
    );
    source.addEventListener("log", (event) => {
      const parsed = JSON.parse((event as MessageEvent).data) as RunLog;
      setLiveLogs((current) =>
        current.some((log) => log.id === parsed.id) ? current : [...current, parsed]
      );
    });
    source.addEventListener("status", (event) => {
      const parsed = JSON.parse((event as MessageEvent).data) as RunSummary;
      setRuns((current) => current.map((run) => (run.id === parsed.id ? parsed : run)));
    });

    return () => {
      active = false;
      source.close();
    };
  }, [selectedRun, token]);

  async function loadDashboard(activeToken: string) {
    try {
      setError("");
      const [authMe, projectsResponse, runsResponse, deploymentsResponse] =
        await Promise.all([
          fetchJson<{ user: { email: string } }>(`${API_BASE_URL}/api/auth/me`, activeToken),
          fetchJson<{ projects: Project[] }>(`${API_BASE_URL}/api/projects`, activeToken),
          fetchJson<{ runs: RunSummary[] }>(`${API_BASE_URL}/api/runs`, activeToken),
          fetchJson<{ targets: DeploymentTarget[]; revisions: DeploymentRevision[] }>(
            `${API_BASE_URL}/api/deployments`,
            activeToken
          )
        ]);
      setUserEmail(authMe.user.email);
      setProjects(projectsResponse.projects);
      setRuns(runsResponse.runs);
      setDeployments(deploymentsResponse.targets);
      setRevisions(deploymentsResponse.revisions);
      if (!selectedRun && runsResponse.runs[0]) {
        setSelectedRun(runsResponse.runs[0].id);
      }
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password")
        })
      });
      if (!response.ok) {
        throw new Error("Login failed.");
      }
      const data = (await response.json()) as LoginResponse;
      setToken(data.token);
      setUserEmail(data.user.email);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await fetchJson(
        `${API_BASE_URL}/api/projects`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            name: projectForm.name,
            repoOwner: projectForm.repoOwner,
            repoName: projectForm.repoName,
            installationId: Number(projectForm.installationId),
            defaultBranch: projectForm.defaultBranch,
            configPath: projectForm.configPath,
            secrets: JSON.parse(projectForm.secretsJson)
          })
        }
      );
      await loadDashboard(token);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function handleRerun(runId: string) {
    try {
      await fetchJson(
        `${API_BASE_URL}/api/runs/${runId}/rerun`,
        token,
        { method: "POST" }
      );
      await loadDashboard(token);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function handleRollback(targetId: string, revisionId: string) {
    try {
      await fetchJson(
        `${API_BASE_URL}/api/rollbacks`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ targetId, revisionId })
        }
      );
      await loadDashboard(token);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  if (!token) {
    return (
      <div className="login-shell">
        <form className="card login-card" onSubmit={handleLogin}>
          <h1>AutoOps</h1>
          <p>Sign in with the bootstrap admin account.</p>
          <label>
            Email
            <input name="email" type="email" placeholder="admin@autoops.local" />
          </label>
          <label>
            Password
            <input name="password" type="password" placeholder="admin123" />
          </label>
          <button type="submit">Sign In</button>
          {error ? <div className="error-banner">{error}</div> : null}
        </form>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h1>AutoOps Control Plane</h1>
          <p>Logged in as {userEmail}</p>
        </div>
        <div className="topbar-actions">
          <button onClick={() => void loadDashboard(token)}>Refresh</button>
          <button
            className="secondary"
            onClick={() => {
              localStorage.removeItem("autoops-token");
              setToken("");
              setUserEmail("");
            }}
          >
            Log Out
          </button>
        </div>
      </header>
      {error ? <div className="error-banner">{error}</div> : null}
      <main className="dashboard-grid">
        <section className="column">
          <div className="card">
            <h2>Register Project</h2>
            <form className="stack" onSubmit={handleCreateProject}>
              <input
                value={projectForm.name}
                onChange={(event) =>
                  setProjectForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Project name"
              />
              <input
                value={projectForm.repoOwner}
                onChange={(event) =>
                  setProjectForm((current) => ({ ...current, repoOwner: event.target.value }))
                }
                placeholder="GitHub owner"
              />
              <input
                value={projectForm.repoName}
                onChange={(event) =>
                  setProjectForm((current) => ({ ...current, repoName: event.target.value }))
                }
                placeholder="GitHub repository"
              />
              <input
                value={projectForm.installationId}
                onChange={(event) =>
                  setProjectForm((current) => ({
                    ...current,
                    installationId: event.target.value
                  }))
                }
                placeholder="GitHub installation ID"
              />
              <input
                value={projectForm.defaultBranch}
                onChange={(event) =>
                  setProjectForm((current) => ({
                    ...current,
                    defaultBranch: event.target.value
                  }))
                }
                placeholder="Default branch"
              />
              <textarea
                rows={8}
                value={projectForm.secretsJson}
                onChange={(event) =>
                  setProjectForm((current) => ({
                    ...current,
                    secretsJson: event.target.value
                  }))
                }
              />
              <button type="submit">Create Project</button>
            </form>
          </div>
          <div className="card">
            <h2>Projects</h2>
            <div className="stack">
              {projects.map((project) => (
                <button
                  className="list-button"
                  key={project.id}
                  onClick={() => {
                    const firstRun = runs.find((run) => run.projectId === project.id);
                    if (firstRun) {
                      setSelectedRun(firstRun.id);
                    }
                  }}
                >
                  <strong>{project.name}</strong>
                  <span>
                    {project.repoOwner}/{project.repoName}
                  </span>
                  <span>
                    Targets: {project.targetCount} | Latest:{" "}
                    {project.latestRunStatus ?? "none"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="column column-wide">
          <div className="card">
            <h2>Runs</h2>
            <div className="stack">
              {runs.map((run) => (
                <button
                  className={`list-button ${selectedRun === run.id ? "active" : ""}`}
                  key={run.id}
                  onClick={() => setSelectedRun(run.id)}
                >
                  <strong>{run.projectName}</strong>
                  <span>
                    {run.branch} · {run.status} · {run.source}
                  </span>
                  <span>{run.commitSha.slice(0, 12)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-heading">
              <div>
                <h2>Run Detail</h2>
                {selectedRunSummary ? (
                  <p>
                    {selectedRunSummary.projectName} · {selectedRunSummary.status}
                  </p>
                ) : null}
              </div>
              {selectedRunSummary ? (
                <button onClick={() => void handleRerun(selectedRunSummary.id)}>Rerun</button>
              ) : null}
            </div>
            {runDetail ? (
              <>
                <div className="stage-grid">
                  {runDetail.stages.map((stage) => (
                    <div className="stage-chip" key={stage.id}>
                      <strong>{stage.stageName}</strong>
                      <span>{stage.status}</span>
                    </div>
                  ))}
                </div>
                <div className="log-panel">
                  {liveLogs.map((log) => (
                    <div className="log-line" key={log.id}>
                      <span>[{log.stageName}]</span>
                      <span>{log.message}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p>Select a run to inspect live logs.</p>
            )}
          </div>
        </section>

        <section className="column">
          <div className="card">
            <h2>Targets</h2>
            <div className="stack">
              {deployments.map((target) => (
                <div className="list-card" key={target.id}>
                  <strong>{target.projectName}</strong>
                  <span>{target.name}</span>
                  <span>{target.lastStatus ?? "never deployed"}</span>
                  <small>{target.lastDeployedImage ?? target.composeFile}</small>
                  {target.lastError ? <small>{target.lastError}</small> : null}
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h2>Deployment History</h2>
            <div className="stack">
              {revisions.map((revision) => (
                <div className="list-card" key={revision.id}>
                  <strong>
                    {revision.projectName} / {revision.targetName}
                  </strong>
                  <span>{revision.imageRef}</span>
                  <small>{revision.imageDigest}</small>
                  <button onClick={() => void handleRollback(revision.targetId, revision.id)}>
                    Roll Back To This
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );

  async function fetchRunDetail(runId: string, activeToken: string) {
    return fetchJson<RunDetail>(`${API_BASE_URL}/api/runs/${runId}`, activeToken);
  }
}

async function fetchJson<T>(
  url: string,
  token: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

