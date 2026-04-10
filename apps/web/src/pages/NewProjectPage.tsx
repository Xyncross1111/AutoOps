import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, FolderGit2, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { GitHubConnectedAccount, ProjectInstallationSummary } from "@autoops/core";

import { useAppSession } from "../app-context";
import { MetaList } from "../components/MetaList";
import { PageHeader } from "../components/PageHeader";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import {
  createProject,
  getGitHubAccount,
  getGitHubInstallUrl,
  listGitHubInstallations
} from "../lib/api";
import { formatDateTime } from "../lib/format";

const defaultSecretsJson = `{
  "ghcr_username": "",
  "ghcr_token": ""
}`;

export function NewProjectPage() {
  const { token, refreshApp } = useAppSession();
  const navigate = useNavigate();
  const [githubAccount, setGitHubAccount] = useState<GitHubConnectedAccount | null>(null);
  const [installations, setInstallations] = useState<ProjectInstallationSummary[]>([]);
  const [installUrl, setInstallUrl] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    repoOwner: "",
    repoName: "",
    installationId: "",
    defaultBranch: "main",
    configPath: ".autoops/pipeline.yml",
    secretsJson: defaultSecretsJson
  });

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    void Promise.allSettled([
      getGitHubAccount(token),
      listGitHubInstallations(token),
      getGitHubInstallUrl(token)
    ])
      .then(([accountResult, installationsResult, installUrlResult]) => {
        if (!active) {
          return;
        }

        if (accountResult.status === "fulfilled") {
          setGitHubAccount(accountResult.value.account);
        }

        if (installationsResult.status === "fulfilled") {
          setInstallations(installationsResult.value.installations);

          if (!form.installationId && installationsResult.value.installations[0]) {
            setForm((current) => ({
              ...current,
              installationId: String(installationsResult.value.installations[0].installationId)
            }));
          }
        }

        if (installUrlResult.status === "fulfilled") {
          setInstallUrl(installUrlResult.value.url);
        }
      })
      .catch((caughtError) => {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : "Failed to load project setup");
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
    return <LoadingBlock label="Loading project setup..." />;
  }

  return (
    <div className="ao-page">
      <PageHeader
        eyebrow="Inventory / Manual setup"
        title="New custom pipeline project"
        description="Register a non-managed project that ships from an existing pipeline file and deployment target configuration."
        meta={
          <div className="ao-inline-meta">
            <span className="ao-chip">{githubAccount ? "GitHub connected" : "GitHub optional"}</span>
            <span className="ao-chip">{installations.length} installations</span>
          </div>
        }
        actions={
          <Link className="ao-link-button ao-link-button--secondary" to="/repositories">
            <FolderGit2 size={16} />
            <span>Open repository import console</span>
          </Link>
        }
      />

      {error ? <InlineError message={error} /> : null}

      <section className="ao-project-detail__layout">
        <div className="ao-project-detail__main">
          <article className="ao-panel">
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Manual path</p>
                <h2>Register the project</h2>
                <p>Keep the existing custom pipeline behavior. AutoOps will reference your pipeline config and stored secrets.</p>
              </div>
            </div>

            <form className="ao-form-grid" onSubmit={handleSubmit}>
              <div className="ao-form-grid ao-form-grid--two">
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

              <div className="ao-form-grid ao-form-grid--two">
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

              <div className="ao-form-grid ao-form-grid--two">
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

              <div className="ao-inline-cluster">
                <button className="ao-button ao-button--primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Registering..." : "Register custom project"}
                </button>
                <Link className="ao-link-button ao-link-button--secondary" to="/projects">
                  View projects
                </Link>
              </div>
            </form>
          </article>
        </div>

        <div className="ao-project-detail__side">
          <article className="ao-panel">
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Guidance</p>
                <h2>When to use this flow</h2>
              </div>
            </div>
            <div className="ao-stack ao-stack--sm">
              <span className="ao-chip">Custom pipeline</span>
              <p className="ao-muted">
                Use this route when the repo already contains an AutoOps pipeline file and deploy configuration, or when the project does not qualify for managed Next.js/React/HTML deployment.
              </p>
            </div>
            <MetaList
              items={[
                { label: "GitHub account", value: githubAccount ? `@${githubAccount.login}` : "Optional" },
                { label: "Installations", value: `${installations.length}` },
                {
                  label: "Last known account update",
                  value: githubAccount ? formatDateTime(githubAccount.updatedAt) : "Not connected"
                }
              ]}
            />
          </article>

          <article className="ao-panel">
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Managed import</p>
                <h2>Import a supported app instead</h2>
                <p>Managed repos are imported from the repository console and deployed with generated runtime config.</p>
              </div>
            </div>

            <div className="ao-stack ao-stack--sm">
              <span className="ao-chip ao-chip--accent">Next.js • React • HTML</span>
              <Link className="ao-link-button ao-link-button--secondary" to="/repositories">
                <FolderGit2 size={16} />
                <span>Go to repositories</span>
              </Link>
            </div>
          </article>

          {installations.length === 0 ? (
            <article className="ao-panel">
              <EmptyState
                title="No installation selected yet"
                description="Custom projects still need an installation context. Install the GitHub App if you want installation-level access for this repo."
                action={
                  installUrl ? (
                    <button
                      className="ao-button ao-button--secondary"
                      type="button"
                      onClick={() => window.location.assign(installUrl)}
                    >
                      <ShieldCheck size={16} />
                      <span>Install GitHub App</span>
                    </button>
                  ) : undefined
                }
              />
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
}
