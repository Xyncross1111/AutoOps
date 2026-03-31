import { FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  FolderGit2,
  RefreshCw,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { GitHubRepositorySummary, ProjectInstallationSummary } from "@autoops/core";

import { useAppSession } from "../app-context";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import {
  createProject,
  getGitHubInstallUrl,
  importGitHubRepository,
  listGitHubInstallations,
  listGitHubRepositories,
  syncGitHubInstallation
} from "../lib/api";
import { formatDateTime, formatRelativeTime } from "../lib/format";

const defaultSecretsJson = `{
  "ghcr_username": "",
  "ghcr_token": ""
}`;

export function NewProjectPage() {
  const { token, refreshApp } = useAppSession();
  const navigate = useNavigate();
  const [installations, setInstallations] = useState<ProjectInstallationSummary[]>([]);
  const [repositories, setRepositories] = useState<GitHubRepositorySummary[]>([]);
  const [installUrl, setInstallUrl] = useState("");
  const [selectedInstallationId, setSelectedInstallationId] = useState("");
  const [repoSearch, setRepoSearch] = useState("");
  const [showDeployableOnly, setShowDeployableOnly] = useState(false);
  const [showImportedOnly, setShowImportedOnly] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [importingRepoId, setImportingRepoId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    repoOwner: "",
    repoName: "",
    installationId: "",
    defaultBranch: "main",
    configPath: ".autoops/pipeline.yml",
    secretsJson: defaultSecretsJson
  });

  const deferredSearch = useDeferredValue(repoSearch.trim().toLowerCase());

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    void Promise.allSettled([
      listGitHubInstallations(token),
      listGitHubRepositories(token),
      getGitHubInstallUrl(token)
    ])
      .then(([installationsResult, repositoriesResult, installUrlResult]) => {
        if (!active) {
          return;
        }

        if (installationsResult.status === "fulfilled") {
          const nextInstallations = installationsResult.value.installations;
          setInstallations(nextInstallations);
          if (!selectedInstallationId && nextInstallations[0]) {
            const installationId = String(nextInstallations[0].installationId);
            setSelectedInstallationId(installationId);
            setForm((current) => ({ ...current, installationId }));
          }
        }

        if (repositoriesResult.status === "fulfilled") {
          setRepositories(repositoriesResult.value.repositories);
        }

        if (installUrlResult.status === "fulfilled") {
          setInstallUrl(installUrlResult.value.url);
        }

        if (
          installationsResult.status === "rejected" &&
          repositoriesResult.status === "rejected" &&
          installUrlResult.status === "rejected"
        ) {
          setError("Failed to load GitHub setup data.");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedInstallationId, token]);

  const filteredRepositories = useMemo(() => {
    return repositories.filter((repository) => {
      if (
        selectedInstallationId &&
        repository.installationId !== Number(selectedInstallationId)
      ) {
        return false;
      }
      if (showDeployableOnly && repository.deployabilityStatus !== "deployable") {
        return false;
      }
      if (showImportedOnly && !repository.linkedProjectId) {
        return false;
      }
      if (!deferredSearch) {
        return true;
      }

      return [
        repository.owner,
        repository.name,
        repository.fullName,
        repository.defaultBranch
      ]
        .join(" ")
        .toLowerCase()
        .includes(deferredSearch);
    });
  }, [
    deferredSearch,
    repositories,
    selectedInstallationId,
    showDeployableOnly,
    showImportedOnly
  ]);

  async function refreshCatalog() {
    const [installationsResponse, repositoriesResponse] = await Promise.all([
      listGitHubInstallations(token),
      listGitHubRepositories(token)
    ]);
    setInstallations(installationsResponse.installations);
    setRepositories(repositoriesResponse.repositories);
  }

  async function handleSyncInstallation() {
    if (!selectedInstallationId) {
      return;
    }

    setIsSyncing(true);
    setError("");

    try {
      await syncGitHubInstallation(token, Number(selectedInstallationId));
      await refreshCatalog();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Failed to sync GitHub installation"
      );
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleImportRepository(repository: GitHubRepositorySummary) {
    setImportingRepoId(repository.repoId);
    setError("");

    try {
      const response = await importGitHubRepository(token, {
        installationId: repository.installationId,
        repoId: repository.repoId
      });
      refreshApp();
      navigate(`/projects/${response.project.id}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Failed to import repository"
      );
    } finally {
      setImportingRepoId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await createProject(token, {
        name: form.name,
        repoOwner: form.repoOwner,
        repoName: form.repoName,
        installationId: Number(form.installationId),
        defaultBranch: form.defaultBranch,
        configPath: form.configPath,
        secrets: JSON.parse(form.secretsJson)
      });
      refreshApp();
      navigate(`/projects/${response.project.id}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to create project");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <LoadingBlock label="Loading GitHub setup..." />;
  }

  return (
    <div className="page-stack">
      {error ? <InlineError message={error} /> : null}

      <section className="content-grid onboarding-layout">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">GitHub connection</p>
              <h3>Discover deployable repositories</h3>
            </div>
            <FolderGit2 size={18} />
          </div>

          <div className="stack-list">
            <div className="guide-step">
              <span>1</span>
              <div>
                <strong>Install the AutoOps GitHub App</strong>
                <p>Grant AutoOps access only to the personal or org repos you want to manage.</p>
              </div>
            </div>

            <div className="guide-step">
              <span>2</span>
              <div>
                <strong>Sync an installation</strong>
                <p>AutoOps analyzes the accessible repos and flags which ones are eligible.</p>
              </div>
            </div>

            <div className="guide-step">
              <span>3</span>
              <div>
                <strong>Import a Next.js app</strong>
                <p>Deployable repos can be imported into a managed VPS target with one action.</p>
              </div>
            </div>
          </div>

          {installUrl ? (
            <a className="button-link" href={installUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              <span>Open GitHub Install Flow</span>
            </a>
          ) : (
            <EmptyState
              title="Install URL unavailable"
              description="The GitHub App slug is not configured yet on this server."
            />
          )}

          <div className="installation-list">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">Connected installations</p>
                <h3>Available GitHub scopes</h3>
              </div>
              <ShieldCheck size={18} />
            </div>

            {installations.length > 0 ? (
              <div className="stack-list">
                {installations.map((installation) => (
                  <button
                    key={installation.installationId}
                    type="button"
                    className={`list-row installation-row${
                      selectedInstallationId === String(installation.installationId)
                        ? " selected"
                        : ""
                    }`}
                    onClick={() => {
                      const installationId = String(installation.installationId);
                      setSelectedInstallationId(installationId);
                      setForm((current) => ({ ...current, installationId }));
                    }}
                  >
                    <div>
                      <strong>{installation.accountLogin}</strong>
                      <p>{installation.accountType}</p>
                    </div>
                    <div className="row-end">
                      <StatusBadge status={installation.syncStatus} />
                      <small>{installation.repoCount} repos</small>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No installations recorded"
                description="Complete the GitHub App installation flow first, then sync a connected account."
              />
            )}

            <div className="row-actions">
              <button
                type="button"
                onClick={() => void handleSyncInstallation()}
                disabled={!selectedInstallationId || isSyncing}
              >
                <RefreshCw size={16} />
                <span>{isSyncing ? "Syncing..." : "Sync Selected Installation"}</span>
              </button>
              {selectedInstallationId ? (
                <small className="muted-copy">
                  {renderInstallationMeta(
                    installations.find(
                      (installation) =>
                        installation.installationId === Number(selectedInstallationId)
                    ) ?? null
                  )}
                </small>
              ) : null}
            </div>
          </div>
        </article>

        <article className="panel-card project-form-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Repository catalog</p>
              <h3>Visible repositories</h3>
            </div>
            <Sparkles size={18} />
          </div>

          <label className="toolbar-search">
            <input
              value={repoSearch}
              onChange={(event) => setRepoSearch(event.target.value)}
              placeholder="Search by owner, repo, or branch"
            />
          </label>

          <div className="row-actions">
            <label className="toggle-chip">
              <input
                type="checkbox"
                checked={showDeployableOnly}
                onChange={(event) => setShowDeployableOnly(event.target.checked)}
              />
              <span>Deployable only</span>
            </label>
            <label className="toggle-chip">
              <input
                type="checkbox"
                checked={showImportedOnly}
                onChange={(event) => setShowImportedOnly(event.target.checked)}
              />
              <span>Imported only</span>
            </label>
          </div>

          {filteredRepositories.length > 0 ? (
            <div className="stack-list repo-catalog-list">
              {filteredRepositories.map((repository) => (
                <div className="repo-catalog-card" key={`${repository.installationId}-${repository.repoId}`}>
                  <div className="row-spread">
                    <div>
                      <strong>{repository.fullName}</strong>
                      <p>
                        Branch {repository.defaultBranch}
                        {repository.pushedAt
                          ? ` • Updated ${formatRelativeTime(repository.pushedAt)}`
                          : ""}
                      </p>
                    </div>
                    <StatusBadge status={repository.deployabilityStatus} />
                  </div>

                  <div className="project-meta-row">
                    <span>
                      {repository.isPrivate ? "Private" : "Public"} repo
                    </span>
                    <span>Installation #{repository.installationId}</span>
                    <span>{repository.detectedFramework ?? "Framework pending"}</span>
                    <span>{repository.packageManager ?? "No package manager detected"}</span>
                  </div>

                  <p className="muted-copy">
                    {repository.deployabilityReason ??
                      (repository.linkedProjectId
                        ? "Already imported into AutoOps."
                        : "Eligible for one-click managed import.")}
                  </p>

                  <div className="row-actions">
                    {repository.linkedProjectId ? (
                      <Link className="button-link" to={`/projects/${repository.linkedProjectId}`}>
                        Open Project
                      </Link>
                    ) : repository.deployabilityStatus === "deployable" ? (
                      <button
                        type="button"
                        onClick={() => void handleImportRepository(repository)}
                        disabled={importingRepoId === repository.repoId}
                      >
                        {importingRepoId === repository.repoId ? "Importing..." : "Import To AutoOps"}
                      </button>
                    ) : (
                      <a
                        className="button-link subtle-link"
                        href={repository.htmlUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View on GitHub
                      </a>
                    )}
                    <small>{formatDateTime(repository.syncedAt)}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No repositories match the current filters"
              description="Sync an installation or widen the filters to see more repositories."
            />
          )}
        </article>
      </section>

      <form className="panel-card" onSubmit={handleSubmit}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Manual custom pipeline path</p>
            <h3>Register a non-managed project</h3>
          </div>
        </div>

        <div className="split-inputs">
          <label>
            <span>Project name</span>
            <input
              required
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Customer API"
            />
          </label>

          <label>
            <span>Installation</span>
            <select
              required
              value={form.installationId}
              onChange={(event) =>
                setForm((current) => ({ ...current, installationId: event.target.value }))
              }
            >
              <option value="">Select installation</option>
              {installations.map((installation) => (
                <option key={installation.installationId} value={installation.installationId}>
                  {installation.accountLogin} #{installation.installationId}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="split-inputs">
          <label>
            <span>Repository owner</span>
            <input
              required
              value={form.repoOwner}
              onChange={(event) =>
                setForm((current) => ({ ...current, repoOwner: event.target.value }))
              }
              placeholder="acme"
            />
          </label>

          <label>
            <span>Repository name</span>
            <input
              required
              value={form.repoName}
              onChange={(event) =>
                setForm((current) => ({ ...current, repoName: event.target.value }))
              }
              placeholder="customer-api"
            />
          </label>
        </div>

        <div className="split-inputs">
          <label>
            <span>Default branch</span>
            <input
              required
              value={form.defaultBranch}
              onChange={(event) =>
                setForm((current) => ({ ...current, defaultBranch: event.target.value }))
              }
            />
          </label>

          <label>
            <span>Pipeline config path</span>
            <input
              required
              value={form.configPath}
              onChange={(event) =>
                setForm((current) => ({ ...current, configPath: event.target.value }))
              }
            />
          </label>
        </div>

        <label>
          <span>Secrets JSON</span>
          <textarea
            rows={10}
            value={form.secretsJson}
            onChange={(event) =>
              setForm((current) => ({ ...current, secretsJson: event.target.value }))
            }
          />
        </label>

        <div className="row-actions">
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Registering..." : "Register Custom Project"}
          </button>
        </div>
      </form>
    </div>
  );
}

function renderInstallationMeta(installation: ProjectInstallationSummary | null) {
  if (!installation) {
    return "Select an installation to sync its repositories.";
  }
  if (installation.lastSyncAt) {
    return `Last sync ${formatRelativeTime(installation.lastSyncAt)} • ${installation.repoCount} repos`;
  }
  if (installation.lastSyncError) {
    return installation.lastSyncError;
  }
  return "This installation has not been synced yet.";
}
