import { FormEvent, useEffect, useState } from "react";
import { ExternalLink, GitBranch, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ProjectInstallationSummary } from "@autoops/core";

import { useAppSession } from "../app-context";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import { createProject, getGitHubInstallUrl, listGitHubInstallations } from "../lib/api";

const defaultSecretsJson = `{
  "ghcr_username": "",
  "ghcr_token": ""
}`;

export function NewProjectPage() {
  const { token, refreshApp } = useAppSession();
  const navigate = useNavigate();
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
      listGitHubInstallations(token),
      getGitHubInstallUrl(token)
    ])
      .then(([installationsResult, installUrlResult]) => {
        if (!active) {
          return;
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

        if (
          installationsResult.status === "rejected" &&
          installUrlResult.status === "rejected"
        ) {
          setError("Failed to load GitHub installation data.");
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
  }, [form.installationId, token]);

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
              <p className="eyebrow">Guided onboarding</p>
              <h3>Prepare GitHub access</h3>
            </div>
            <GitBranch size={18} />
          </div>

          <div className="stack-list">
            <div className="guide-step">
              <span>1</span>
              <div>
                <strong>Install the GitHub App</strong>
                <p>Connect AutoOps to the organizations or repositories you want to operate.</p>
              </div>
            </div>

            <div className="guide-step">
              <span>2</span>
              <div>
                <strong>Select the installation</strong>
                <p>Pick the installation ID that matches the repository you are registering.</p>
              </div>
            </div>

            <div className="guide-step">
              <span>3</span>
              <div>
                <strong>Provide runtime secrets</strong>
                <p>Add registry and environment secrets. Values are write-only once submitted.</p>
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
                <p className="eyebrow">Available installations</p>
                <h3>Known GitHub installs</h3>
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
                      form.installationId === String(installation.installationId) ? " selected" : ""
                    }`}
                    onClick={() => {
                      setForm((current) => ({
                        ...current,
                        installationId: String(installation.installationId)
                      }));
                    }}
                  >
                    <div>
                      <strong>{installation.accountLogin}</strong>
                      <p>{installation.accountType}</p>
                    </div>
                    <small>#{installation.installationId}</small>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No installations recorded"
                description="Complete the GitHub App installation flow first, then refresh this page."
              />
            )}
          </div>
        </article>

        <form className="panel-card project-form-card" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Project registration</p>
              <h3>Connect a repository</h3>
            </div>
          </div>

          <label>
            <span>Project name</span>
            <input
              required
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Customer API"
            />
          </label>

          <div className="split-inputs">
            <label>
              <span>Repository owner</span>
              <input
                required
                value={form.repoOwner}
                onChange={(event) => (
                  setForm((current) => ({ ...current, repoOwner: event.target.value }))
                )}
                placeholder="acme"
              />
            </label>

            <label>
              <span>Repository name</span>
              <input
                required
                value={form.repoName}
                onChange={(event) => (
                  setForm((current) => ({ ...current, repoName: event.target.value }))
                )}
                placeholder="customer-api"
              />
            </label>
          </div>

          <div className="split-inputs">
            <label>
              <span>Installation</span>
              <select
                required
                value={form.installationId}
                onChange={(event) => (
                  setForm((current) => ({ ...current, installationId: event.target.value }))
                )}
              >
                <option value="">Select installation</option>
                {installations.map((installation) => (
                  <option key={installation.installationId} value={installation.installationId}>
                    {installation.accountLogin} #{installation.installationId}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Default branch</span>
              <input
                required
                value={form.defaultBranch}
                onChange={(event) => (
                  setForm((current) => ({ ...current, defaultBranch: event.target.value }))
                )}
              />
            </label>
          </div>

          <label>
            <span>Pipeline config path</span>
            <input
              required
              value={form.configPath}
              onChange={(event) => (
                setForm((current) => ({ ...current, configPath: event.target.value }))
              )}
            />
          </label>

          <label>
            <span>Secrets JSON</span>
            <textarea
              rows={10}
              value={form.secretsJson}
              onChange={(event) => (
                setForm((current) => ({ ...current, secretsJson: event.target.value }))
              )}
            />
          </label>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Registering..." : "Register Project"}
          </button>
        </form>
      </section>
    </div>
  );
}
