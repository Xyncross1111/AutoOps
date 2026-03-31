import { FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  FolderGit2,
  RefreshCw,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type {
  GitHubConnectedAccount,
  GitHubRepositorySummary,
  GitHubUserRepositorySummary,
  ProjectInstallationSummary
} from "@autoops/core";

import { useAppSession } from "../app-context";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import {
  createProject,
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

const defaultSecretsJson = `{
  "ghcr_username": "",
  "ghcr_token": ""
}`;

export function NewProjectPage() {
  const { token, refreshApp } = useAppSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [githubAccount, setGitHubAccount] = useState<GitHubConnectedAccount | null>(null);
  const [githubUserRepositories, setGitHubUserRepositories] = useState<
    GitHubUserRepositorySummary[]
  >([]);
  const [installations, setInstallations] = useState<ProjectInstallationSummary[]>([]);
  const [repositories, setRepositories] = useState<GitHubRepositorySummary[]>([]);
  const [installUrl, setInstallUrl] = useState("");
  const [oauthUrl, setOauthUrl] = useState("");
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
  const connectedInstallationId = searchParams.get("installationId");
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
          const nextInstallations = installationsResult.value.installations;
          setInstallations(nextInstallations);
          const preferredInstallationId =
            connectedInstallationId && nextInstallations.some(
              (installation) =>
                String(installation.installationId) === connectedInstallationId
            )
              ? connectedInstallationId
              : selectedInstallationId;

          if (preferredInstallationId) {
            setSelectedInstallationId(preferredInstallationId);
            setForm((current) => ({ ...current, installationId: preferredInstallationId }));
          } else if (nextInstallations[0]) {
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
  }, [connectedInstallationId, selectedInstallationId, token]);

  const repositoriesByFullName = useMemo(() => {
    return new Map(
      repositories.map((repository) => [repository.fullName.toLowerCase(), repository])
    );
  }, [repositories]);

  const filteredRepositories = useMemo(() => {
    if (githubUserRepositories.length > 0) {
      return githubUserRepositories.filter((repository) => {
        const autoOpsRepository = repositoriesByFullName.get(repository.fullName.toLowerCase());
        const deployabilityStatus =
          autoOpsRepository?.deployabilityStatus ?? repository.autoOpsDeployabilityStatus;
        const linkedProjectId = autoOpsRepository?.linkedProjectId ?? repository.linkedProjectId;
        if (
          showDeployableOnly &&
          deployabilityStatus !== "deployable" &&
          !linkedProjectId
        ) {
          return false;
        }
        if (showImportedOnly && !linkedProjectId) {
          return false;
        }
        if (!deferredSearch) {
          return true;
        }

        return [
          repository.owner,
          repository.name,
          repository.fullName,
          repository.defaultBranch,
          repository.description ?? ""
        ]
          .join(" ")
          .toLowerCase()
          .includes(deferredSearch);
      });
    }

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
    githubUserRepositories,
    repositories,
    repositoriesByFullName,
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
      {showConnectedBanner ? (
        <div className="success-banner">
          <strong>GitHub connected</strong>
          <span>
            {searchParams.get("oauth") === "connected"
              ? "AutoOps signed in with GitHub and loaded the repository catalog below."
              : "AutoOps returned from GitHub, synced the installation, and loaded the visible repositories below."}
          </span>
        </div>
      ) : null}
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
                <strong>Connect GitHub with OAuth</strong>
                <p>Sign in with GitHub so AutoOps can show the repositories your account can access.</p>
              </div>
            </div>

            <div className="guide-step">
              <span>2</span>
              <div>
                <strong>Import directly from GitHub</strong>
                <p>OAuth-connected repos can be imported straight into AutoOps for manual deployment.</p>
              </div>
            </div>

            <div className="guide-step">
              <span>3</span>
              <div>
                <strong>Optionally install the AutoOps GitHub App</strong>
                <p>Add the app later if you want installation-level controls and webhook-driven redeploys.</p>
              </div>
            </div>

            <div className="guide-step">
              <span>4</span>
              <div>
                <strong>Import a Next.js app</strong>
                <p>AutoOps validates the repo during import, then you can deploy it onto the managed VPS target.</p>
              </div>
            </div>
          </div>

          <div className="row-actions">
            {oauthUrl ? (
              <button
                type="button"
                onClick={() => window.location.assign(oauthUrl)}
              >
                <ExternalLink size={16} />
                <span>{githubAccount ? "Reconnect GitHub" : "Connect GitHub"}</span>
              </button>
            ) : (
              <EmptyState
                title="OAuth unavailable"
                description="GitHub OAuth client credentials are not configured yet on this server."
              />
            )}

            {installUrl ? (
              <button
                type="button"
                className="secondary"
                onClick={() => window.location.assign(installUrl)}
              >
                <ShieldCheck size={16} />
                <span>Install AutoOps GitHub App</span>
              </button>
            ) : null}
          </div>

          <p className="muted-copy">
            GitHub opens in this tab. OAuth is enough to import and deploy supported repos.
            The AutoOps GitHub App is optional and mainly adds webhook-based automation.
          </p>

          {githubAccount ? (
            <div className="account-summary-card">
              {githubAccount.avatarUrl ? (
                <img
                  className="account-avatar"
                  src={githubAccount.avatarUrl}
                  alt={githubAccount.login}
                />
              ) : null}
              <div>
                <strong>{githubAccount.name ?? githubAccount.login}</strong>
                <p>
                  Connected as{" "}
                  <a href={githubAccount.profileUrl} target="_blank" rel="noreferrer">
                    @{githubAccount.login}
                  </a>
                </p>
                <small>
                  Scope {githubAccount.scope ?? "default"} • Connected {formatDateTime(githubAccount.connectedAt)}
                </small>
              </div>
            </div>
          ) : null}

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
                description="This section is optional. Install the AutoOps GitHub App later if you want webhook-driven redeploys and installation sync."
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
              <h3>{githubAccount ? "Your GitHub repositories" : "Visible repositories"}</h3>
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
                <RepositoryCatalogCard
                  key={`catalog-${repository.repoId}`}
                  repository={repository}
                  autoOpsRepository={resolveAutoOpsRepository(repository, repositoriesByFullName)}
                  importingRepoId={importingRepoId}
                  onImport={handleImportRepository}
                />
              ))}
            </div>
          ) : githubAccount ? (
            <EmptyState
              title="No repositories match the current filters"
              description="Try another search term or widen the current filters."
            />
          ) : (
            <EmptyState
              title="Connect GitHub to load your repositories"
              description="OAuth is now the main discovery flow. After connecting GitHub, AutoOps will show the repositories your account can access and which ones are ready for management."
              action={
                oauthUrl ? (
                  <button type="button" onClick={() => window.location.assign(oauthUrl)}>
                    Connect GitHub
                  </button>
                ) : undefined
              }
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

function RepositoryCatalogCard(props: {
  repository: GitHubRepositorySummary | GitHubUserRepositorySummary;
  autoOpsRepository: GitHubRepositorySummary | null;
  importingRepoId: number | null;
  onImport: (repository: GitHubRepositorySummary | GitHubUserRepositorySummary) => Promise<void>;
}) {
  const autoOpsRepository = props.autoOpsRepository;
  const linkedProjectId = autoOpsRepository?.linkedProjectId ?? props.repository.linkedProjectId;
  const status = linkedProjectId
    ? "imported"
    : autoOpsRepository
      ? autoOpsRepository.deployabilityStatus
      : "connected";

  return (
    <div className="repo-catalog-card">
      <div className="row-spread">
        <div>
          <strong>{props.repository.fullName}</strong>
          <p>
            Branch {props.repository.defaultBranch}
            {props.repository.pushedAt
              ? ` • Updated ${formatRelativeTime(props.repository.pushedAt)}`
              : ""}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="project-meta-row">
        <span>{props.repository.isPrivate ? "Private" : "Public"} repo</span>
        {"visibility" in props.repository ? <span>{props.repository.visibility}</span> : null}
        {autoOpsRepository ? <span>Installation #{autoOpsRepository.installationId}</span> : null}
        {autoOpsRepository ? (
          <span>{autoOpsRepository.detectedFramework ?? "Framework pending"}</span>
        ) : (
          <span>GitHub OAuth access</span>
        )}
        {autoOpsRepository ? (
          <span>{autoOpsRepository.packageManager ?? "No package manager detected"}</span>
        ) : null}
      </div>

      <p className="muted-copy">
        {linkedProjectId
          ? "Already imported into AutoOps."
          : autoOpsRepository
          ? autoOpsRepository.deployabilityReason ??
            "Eligible for one-click managed import."
          : "This repo is available through your GitHub connection. AutoOps will validate it during import and can deploy supported Next.js apps immediately."}
      </p>

      <div className="row-actions">
        {linkedProjectId ? (
          <Link className="button-link" to={`/projects/${linkedProjectId}`}>
            Open Project
          </Link>
        ) : autoOpsRepository?.deployabilityStatus === "unsupported" ||
          autoOpsRepository?.deployabilityStatus === "archived" ? (
          <a
            className="button-link subtle-link"
            href={props.repository.htmlUrl}
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub
          </a>
        ) : (
          <button
            type="button"
            onClick={() => void props.onImport(autoOpsRepository ?? props.repository)}
            disabled={props.importingRepoId === props.repository.repoId}
          >
            {props.importingRepoId === props.repository.repoId ? "Importing..." : "Import To AutoOps"}
          </button>
        )}
        {"syncedAt" in props.repository && typeof props.repository.syncedAt === "string" ? (
          <small>{formatDateTime(props.repository.syncedAt)}</small>
        ) : null}
      </div>
    </div>
  );
}

function resolveAutoOpsRepository(
  repository: GitHubRepositorySummary | GitHubUserRepositorySummary,
  repositoriesByFullName: Map<string, GitHubRepositorySummary>
): GitHubRepositorySummary | null {
  if ("deployabilityStatus" in repository) {
    return repository;
  }

  return repositoriesByFullName.get(repository.fullName.toLowerCase()) ?? null;
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
