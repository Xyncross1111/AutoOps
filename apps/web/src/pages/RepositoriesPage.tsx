import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ExternalLink, FolderGit2, RefreshCw, ShieldCheck } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type {
  GitHubConnectedAccount,
  GitHubRepositorySummary,
  GitHubUserRepositorySummary,
  ProjectInstallationSummary
} from "@autoops/core";

import { useAppSession } from "../app-context";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { Toolbar } from "../components/Toolbar";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import {
  getGitHubAccount,
  getGitHubInstallUrl,
  getGitHubOAuthUrl,
  importGitHubRepository,
  listGitHubInstallations,
  listGitHubRepositories,
  listGitHubUserRepositories,
  syncGitHubInstallation
} from "../lib/api";
import { formatDateTime, formatRelativeTime } from "../lib/format";
import { formatRepositoryFrameworkName } from "../lib/managed-app";

type CatalogFilter = "all" | "supported" | "imported" | "unsupported";
type FrameworkFilter =
  | "all"
  | "nextjs"
  | "nuxt"
  | "express"
  | "nestjs"
  | "react"
  | "vue"
  | "astro"
  | "static_html"
  | "unknown";

const catalogFilterOptions: Array<{ value: CatalogFilter; label: string }> = [
  { value: "all", label: "All repos" },
  { value: "supported", label: "Supported" },
  { value: "imported", label: "Imported" },
  { value: "unsupported", label: "Unsupported" }
];

const frameworkOptions: Array<{ value: FrameworkFilter; label: string }> = [
  { value: "all", label: "All frameworks" },
  { value: "nextjs", label: "Next.js" },
  { value: "nuxt", label: "Nuxt" },
  { value: "express", label: "Express" },
  { value: "nestjs", label: "NestJS" },
  { value: "react", label: "React" },
  { value: "vue", label: "Vue" },
  { value: "astro", label: "Astro" },
  { value: "static_html", label: "HTML" },
  { value: "unknown", label: "Unknown" }
];

export function RepositoriesPage() {
  const { token, refreshApp } = useAppSession();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [githubAccount, setGitHubAccount] = useState<GitHubConnectedAccount | null>(null);
  const [githubUserRepositories, setGitHubUserRepositories] = useState<
    GitHubUserRepositorySummary[]
  >([]);
  const [installations, setInstallations] = useState<ProjectInstallationSummary[]>([]);
  const [repositories, setRepositories] = useState<GitHubRepositorySummary[]>([]);
  const [installUrl, setInstallUrl] = useState("");
  const [oauthUrl, setOauthUrl] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [importingRepoId, setImportingRepoId] = useState<number | null>(null);

  const connectedInstallationId = searchParams.get("installationId");
  const installationFilter = searchParams.get("installation") ?? connectedInstallationId ?? "";
  const repoSearch = searchParams.get("search") ?? "";
  const catalogFilter = (searchParams.get("status") as CatalogFilter | null) ?? "all";
  const frameworkFilter = (searchParams.get("framework") as FrameworkFilter | null) ?? "all";
  const deferredSearch = useDeferredValue(repoSearch.trim().toLowerCase());
  const showConnectedBanner =
    searchParams.get("connected") === "1" || searchParams.get("oauth") === "connected";

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    void Promise.allSettled([
      getGitHubAccount(token),
      listGitHubUserRepositories(token),
      getGitHubOAuthUrl(token),
      listGitHubInstallations(token),
      listGitHubRepositories(token),
      getGitHubInstallUrl(token)
    ])
      .then(([
        accountResult,
        userRepositoriesResult,
        oauthUrlResult,
        installationsResult,
        repositoriesResult,
        installUrlResult
      ]) => {
        if (!active) {
          return;
        }

        if (accountResult.status === "fulfilled") {
          setGitHubAccount(accountResult.value.account);
        }

        if (userRepositoriesResult.status === "fulfilled") {
          setGitHubUserRepositories(userRepositoriesResult.value.repositories);
        }

        if (oauthUrlResult.status === "fulfilled") {
          setOauthUrl(oauthUrlResult.value.url);
        }

        if (installationsResult.status === "fulfilled") {
          setInstallations(installationsResult.value.installations);
        }

        if (repositoriesResult.status === "fulfilled") {
          setRepositories(repositoriesResult.value.repositories);
        }

        if (installUrlResult.status === "fulfilled") {
          setInstallUrl(installUrlResult.value.url);
        }

        if (
          accountResult.status === "rejected" &&
          userRepositoriesResult.status === "rejected" &&
          oauthUrlResult.status === "rejected" &&
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
  }, [token]);

  const repositoriesByFullName = useMemo(
    () => new Map(repositories.map((repository) => [repository.fullName.toLowerCase(), repository])),
    [repositories]
  );

  const mergedRepositories = useMemo(() => {
    if (githubUserRepositories.length > 0) {
      return githubUserRepositories.map((repository) => {
        const autoOpsRepository =
          repositoriesByFullName.get(repository.fullName.toLowerCase()) ?? null;
        const linkedProjectId = autoOpsRepository?.linkedProjectId ?? repository.linkedProjectId;
        const detectedFramework = autoOpsRepository?.detectedFramework ?? null;
        const deployabilityStatus =
          linkedProjectId
            ? "imported"
            : autoOpsRepository?.deployabilityStatus ?? repository.autoOpsDeployabilityStatus;

        return {
          repository,
          autoOpsRepository,
          linkedProjectId,
          deployabilityStatus,
          detectedFramework,
          installationId: autoOpsRepository?.installationId ?? repository.installationId
        };
      });
    }

    return repositories.map((repository) => ({
      repository,
      autoOpsRepository: repository,
      linkedProjectId: repository.linkedProjectId,
      deployabilityStatus: repository.linkedProjectId ? "imported" : repository.deployabilityStatus,
      detectedFramework: repository.detectedFramework,
      installationId: repository.installationId
    }));
  }, [githubUserRepositories, repositories, repositoriesByFullName]);

  const filteredRepositories = mergedRepositories.filter((entry) => {
    if (installationFilter && entry.installationId !== Number(installationFilter)) {
      return false;
    }

    if (catalogFilter === "supported") {
      if (entry.deployabilityStatus !== "deployable" && !entry.linkedProjectId) {
        return false;
      }
    }

    if (catalogFilter === "imported" && !entry.linkedProjectId) {
      return false;
    }

    if (
      catalogFilter === "unsupported" &&
      entry.deployabilityStatus !== "unsupported" &&
      entry.deployabilityStatus !== "archived"
    ) {
      return false;
    }

    if (frameworkFilter !== "all") {
      const nextFramework =
        entry.detectedFramework === "react_cra" ? "react" : entry.detectedFramework ?? "unknown";
      if (nextFramework !== frameworkFilter) {
        return false;
      }
    }

    if (!deferredSearch) {
      return true;
    }

    return [
      entry.repository.owner,
      entry.repository.name,
      entry.repository.fullName,
      entry.repository.defaultBranch,
      entry.repository.description ?? "",
      entry.autoOpsRepository?.deployabilityReason ?? ""
    ]
      .join(" ")
      .toLowerCase()
      .includes(deferredSearch);
  });

  async function refreshCatalog() {
    const [installationsResponse, repositoriesResponse] = await Promise.all([
      listGitHubInstallations(token),
      listGitHubRepositories(token)
    ]);
    setInstallations(installationsResponse.installations);
    setRepositories(repositoriesResponse.repositories);
  }

  async function handleSyncInstallation() {
    if (!installationFilter) {
      return;
    }

    setIsSyncing(true);
    setError("");

    try {
      await syncGitHubInstallation(token, Number(installationFilter));
      await refreshCatalog();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Failed to sync GitHub installation"
      );
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleImportRepository(
    repository: GitHubRepositorySummary | GitHubUserRepositorySummary
  ) {
    setImportingRepoId(repository.repoId);
    setError("");

    try {
      const response = await importGitHubRepository(token, {
        installationId:
          "installationId" in repository && typeof repository.installationId === "number"
            ? repository.installationId
            : undefined,
        repoId: repository.repoId,
        owner: repository.owner,
        name: repository.name,
        defaultBranch: repository.defaultBranch,
        htmlUrl: repository.htmlUrl,
        isPrivate: repository.isPrivate,
        isArchived: repository.isArchived
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

  function updateParams(nextValues: Record<string, string>) {
    const next = new URLSearchParams(searchParams);

    Object.entries(nextValues).forEach(([key, value]) => {
      if (!value || value === "all") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });

    setSearchParams(next, { replace: true });
  }

  if (isLoading) {
    return <LoadingBlock label="Loading repository console..." />;
  }

  return (
    <div className="ao-page ao-repositories-grid">
      <PageHeader
        eyebrow="Inventory / Import"
        title="Repositories"
        description="Connect GitHub, sync installation access, and import supported repos into AutoOps."
        meta={
          <div className="ao-inline-meta">
            <span className="ao-chip">{githubAccount ? "GitHub connected" : "GitHub not connected"}</span>
            <span className="ao-chip">{filteredRepositories.length} visible repos</span>
            {installations.length > 0 ? (
              <span className="ao-chip">{installations.length} installations</span>
            ) : null}
          </div>
        }
        actions={
          <>
            {oauthUrl ? (
              <button
                className="ao-button ao-button--primary"
                type="button"
                onClick={() => window.location.assign(oauthUrl)}
              >
                <ExternalLink size={16} />
                <span>{githubAccount ? "Reconnect GitHub" : "Connect GitHub"}</span>
              </button>
            ) : null}
            {installUrl ? (
              <button
                className="ao-button ao-button--secondary"
                type="button"
                onClick={() => window.location.assign(installUrl)}
              >
                <ShieldCheck size={16} />
                <span>Install GitHub App</span>
              </button>
            ) : null}
          </>
        }
      />

      {showConnectedBanner ? (
        <div className="ao-inline-message">
          <strong>GitHub connected</strong>
          <span>
            {searchParams.get("oauth") === "connected"
              ? "AutoOps completed the GitHub OAuth flow and loaded the repository catalog below."
              : "AutoOps returned from GitHub, synced the selected installation, and refreshed the catalog."}
          </span>
        </div>
      ) : null}

      {error ? <InlineError message={error} /> : null}

      <section className="ao-repositories-status">
        <article className="ao-panel ao-repositories-card">
          <div className="ao-section-header">
            <div className="ao-section-header__copy">
              <p className="ao-section-header__eyebrow">Connection</p>
              <h2>GitHub access</h2>
              <p>OAuth powers repo discovery. The GitHub App remains optional for sync and webhook automation.</p>
            </div>
            <FolderGit2 size={18} />
          </div>

          {githubAccount ? (
            <div className="ao-panel ao-panel--inset">
              <div className="ao-inline-cluster">
                {githubAccount.avatarUrl ? (
                  <img
                    alt={githubAccount.login}
                    className="account-avatar"
                    src={githubAccount.avatarUrl}
                  />
                ) : null}
                <div className="ao-stack ao-stack--sm">
                  <strong>{githubAccount.name ?? githubAccount.login}</strong>
                  <span className="ao-muted">
                    Connected as @{githubAccount.login} • {formatDateTime(githubAccount.connectedAt)}
                  </span>
                </div>
              </div>
              <div className="ao-inline-meta">
                <span className="ao-chip">Scope {githubAccount.scope ?? "default"}</span>
                <a className="ao-link" href={githubAccount.profileUrl} rel="noreferrer" target="_blank">
                  Open GitHub profile
                </a>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Connect GitHub to begin importing"
              description="After connecting GitHub, AutoOps can show the repositories your account can access and validate which ones are ready for managed deployment."
              action={
                oauthUrl ? (
                  <button
                    className="ao-button ao-button--primary"
                    type="button"
                    onClick={() => window.location.assign(oauthUrl)}
                  >
                    Connect GitHub
                  </button>
                ) : undefined
              }
            />
          )}
        </article>

        <article className="ao-panel ao-repositories-card">
          <div className="ao-section-header">
            <div className="ao-section-header__copy">
              <p className="ao-section-header__eyebrow">Installation sync</p>
              <h2>GitHub App scopes</h2>
              <p>Use installation sync when you want installation-wide repo visibility and webhook automation.</p>
            </div>
            <ShieldCheck size={18} />
          </div>

          {installations.length > 0 ? (
            <>
              <div className="ao-installation-list">
                {installations.map((installation) => (
                  <button
                    className={`ao-installation-item${
                      installationFilter === String(installation.installationId) ? " is-selected" : ""
                    }`}
                    key={installation.installationId}
                    type="button"
                    onClick={() => updateParams({ installation: String(installation.installationId) })}
                  >
                    <div className="ao-stack ao-stack--sm">
                      <strong>{installation.accountLogin}</strong>
                      <p>{installation.accountType}</p>
                    </div>
                    <div className="ao-stack ao-stack--sm">
                      <StatusBadge status={installation.syncStatus} />
                      <span className="ao-muted">{installation.repoCount} repos</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="ao-inline-cluster">
                <button
                  className="ao-button ao-button--secondary"
                  disabled={!installationFilter || isSyncing}
                  type="button"
                  onClick={() => void handleSyncInstallation()}
                >
                  <RefreshCw size={16} />
                  <span>{isSyncing ? "Syncing..." : "Sync selected installation"}</span>
                </button>
                {installationFilter ? (
                  <span className="ao-muted">
                    {renderInstallationMeta(
                      installations.find(
                        (installation) => installation.installationId === Number(installationFilter)
                      ) ?? null
                    )}
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <EmptyState
              title="No app installations recorded"
              description="The GitHub App is optional. Install it later if you want installation sync and webhook-driven redeploys."
            />
          )}
        </article>
      </section>

      <section className="ao-panel">
        <Toolbar sticky>
          <label className="ao-search-input">
            <FolderGit2 size={14} />
            <input
              aria-label="Search repositories"
              onChange={(event) => updateParams({ search: event.target.value })}
              placeholder="Search repositories or descriptions"
              value={repoSearch}
            />
          </label>

          <select
            aria-label="Filter by framework"
            value={frameworkFilter}
            onChange={(event) => updateParams({ framework: event.target.value })}
          >
            {frameworkOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="ao-segmented" role="tablist" aria-label="Repository status filter">
            {catalogFilterOptions.map((option) => (
              <button
                key={option.value}
                className={`ao-segmented__item${catalogFilter === option.value ? " is-active" : ""}`}
                type="button"
                onClick={() => updateParams({ status: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="ao-toolbar__spacer" />

          <span className="ao-muted">
            Showing {filteredRepositories.length} of {mergedRepositories.length}
          </span>
        </Toolbar>

        {filteredRepositories.length > 0 ? (
          <div className="ao-table-wrap">
            <table className="ao-table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Description</th>
                  <th>Framework</th>
                  <th>Status</th>
                  <th>Visibility</th>
                  <th>Updated</th>
                  <th aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {filteredRepositories.map((entry) => {
                  const normalizedFramework =
                    entry.detectedFramework === "react_cra" ? "react" : entry.detectedFramework;
                  const status = entry.linkedProjectId ? "imported" : entry.deployabilityStatus ?? "connected";

                  return (
                    <tr key={entry.repository.repoId}>
                      <td>
                        <div className="ao-table__repository">
                          <strong>{entry.repository.fullName}</strong>
                          <span className="ao-table__secondary ao-mono">
                            {entry.repository.defaultBranch}
                            {entry.installationId ? ` • installation ${entry.installationId}` : ""}
                          </span>
                        </div>
                      </td>
                      <td>{entry.repository.description ?? "No description provided."}</td>
                      <td>
                        <span className={`ao-chip${normalizedFramework ? " ao-chip--accent" : ""}`}>
                          {formatRepositoryFrameworkName(normalizedFramework ?? null)}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={status} tone="subtle" />
                      </td>
                      <td>
                        <span className="ao-table__secondary">
                          {"visibility" in entry.repository
                            ? entry.repository.visibility
                            : entry.repository.isPrivate
                              ? "private"
                              : "public"}
                        </span>
                      </td>
                      <td className="ao-mono">
                        {entry.repository.pushedAt ? formatRelativeTime(entry.repository.pushedAt) : "No activity"}
                      </td>
                      <td>
                        <div className="ao-table__action">
                          {entry.linkedProjectId ? (
                            <Link className="ao-link-button ao-link-button--secondary" to={`/projects/${entry.linkedProjectId}`}>
                              Open
                            </Link>
                          ) : entry.autoOpsRepository?.deployabilityStatus === "unsupported" ||
                            entry.autoOpsRepository?.deployabilityStatus === "archived" ? (
                            <a
                              className="ao-link-button ao-link-button--secondary"
                              href={entry.repository.htmlUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              View
                            </a>
                          ) : (
                            <button
                              className="ao-button ao-button--primary"
                              disabled={importingRepoId === entry.repository.repoId}
                              type="button"
                              onClick={() => void handleImportRepository(entry.autoOpsRepository ?? entry.repository)}
                            >
                              {importingRepoId === entry.repository.repoId ? "Importing..." : "Import"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={githubAccount ? "No repositories match the current filters" : "Connect GitHub to load repositories"}
            description={
              githubAccount
                ? "Try another search term or widen the current catalog filters."
                : "After connecting GitHub, AutoOps will show visible repositories and highlight which ones are ready for managed deployment."
            }
            action={
              !githubAccount && oauthUrl ? (
                <button
                  className="ao-button ao-button--primary"
                  type="button"
                  onClick={() => window.location.assign(oauthUrl)}
                >
                  Connect GitHub
                </button>
              ) : undefined
            }
          />
        )}
      </section>
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
