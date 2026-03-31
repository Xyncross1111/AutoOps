import { FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ExternalLink, KeyRound, Rocket, Settings2 } from "lucide-react";
import type { ProjectDetail } from "@autoops/core";

import { useAppSession } from "../app-context";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import { deployManagedProject, getProject, updateProject } from "../lib/api";
import { formatDateTime, formatRelativeTime, shortSha } from "../lib/format";

export function ProjectDetailPage() {
  const { token, refreshNonce, refreshApp } = useAppSession();
  const { projectId = "" } = useParams();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [form, setForm] = useState({
    name: "",
    defaultBranch: "",
    configPath: "",
    secretName: "",
    secretValue: ""
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    void getProject(token, projectId)
      .then((response) => {
        if (!active) {
          return;
        }

        setDetail(response);
        setForm((current) => ({
          ...current,
          name: response.project.name,
          defaultBranch: response.project.defaultBranch,
          configPath: response.project.configPath
        }));
      })
      .catch((caughtError) => {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : "Failed to load project");
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
  }, [projectId, refreshNonce, token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) {
      return;
    }
    setIsSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      await updateProject(token, projectId, {
        name: form.name,
        defaultBranch: form.defaultBranch,
        configPath: detail.project.mode === "custom_pipeline" ? form.configPath : undefined,
        secrets:
          detail.project.mode === "custom_pipeline" && form.secretName && form.secretValue
            ? { [form.secretName]: form.secretValue }
            : undefined
      });
      setSuccessMessage("Project settings saved.");
      setForm((current) => ({ ...current, secretName: "", secretValue: "" }));
      refreshApp();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to save project");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeployNow() {
    setIsDeploying(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await deployManagedProject(token, projectId);
      refreshApp();
      setSuccessMessage(`Deployment queued for ${shortSha(response.run.commitSha)}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to queue deployment");
    } finally {
      setIsDeploying(false);
    }
  }

  if (isLoading) {
    return <LoadingBlock label="Loading project workspace..." />;
  }

  if (error && !detail) {
    return <InlineError message={error} />;
  }

  if (!detail) {
    return (
      <EmptyState
        title="Project not found"
        description="The selected project could not be loaded."
      />
    );
  }

  return (
    <div className="page-stack">
      {error ? <InlineError message={error} /> : null}
      {successMessage ? <div className="success-banner">{successMessage}</div> : null}

      <section className="content-grid project-detail-layout">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Repository context</p>
              <h3>{detail.project.name}</h3>
            </div>
            <div className="row-actions">
              {detail.project.mode === "managed_nextjs" ? (
                <button type="button" onClick={() => void handleDeployNow()} disabled={isDeploying}>
                  <Rocket size={16} />
                  <span>{isDeploying ? "Queueing..." : "Deploy Now"}</span>
                </button>
              ) : null}
              <Settings2 size={18} />
            </div>
          </div>

          <div className="meta-grid">
            <MetaItem
              label="Repository"
              value={`${detail.project.repoOwner}/${detail.project.repoName}`}
            />
            <MetaItem label="Project mode" value={detail.project.mode} />
            <MetaItem label="Default branch" value={detail.project.defaultBranch} />
            <MetaItem
              label="Config path"
              value={
                detail.project.mode === "custom_pipeline"
                  ? detail.project.configPath
                  : "Managed by AutoOps"
              }
            />
            <MetaItem label="Target count" value={String(detail.project.targetCount)} />
            <MetaItem
              label="Installation"
              value={
                detail.installation
                  ? `${detail.installation.accountLogin} #${detail.installation.installationId}`
                  : "Not linked"
              }
            />
            <MetaItem
              label="Primary URL"
              value={
                detail.project.primaryUrl ? (
                  <a href={detail.project.primaryUrl} target="_blank" rel="noreferrer">
                    {detail.project.primaryUrl}
                  </a>
                ) : (
                  "Pending managed edge domain"
                )
              }
            />
            <MetaItem label="Updated" value={formatDateTime(detail.project.updatedAt)} />
          </div>

          {detail.repository ? (
            <div className="panel-card inset-card">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">Catalog status</p>
                  <h3>{detail.repository.fullName}</h3>
                </div>
                <StatusBadge status={detail.repository.deployabilityStatus} />
              </div>

              <div className="row-actions">
                <a
                  className="button-link subtle-link"
                  href={detail.repository.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} />
                  <span>Open Repository</span>
                </a>
                <small>
                  Last synced {formatRelativeTime(detail.repository.syncedAt)}
                </small>
              </div>

              <p className="muted-copy">
                {detail.repository.deployabilityReason ??
                  "This repository is being managed directly from the synced GitHub catalog."}
              </p>
            </div>
          ) : null}

          <form className="detail-stack" onSubmit={handleSubmit}>
            <label>
              <span>Name</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>

            <div className="split-inputs">
              <label>
                <span>Default branch</span>
                <input
                  value={form.defaultBranch}
                  onChange={(event) => (
                    setForm((current) => ({ ...current, defaultBranch: event.target.value }))
                  )}
                />
              </label>

              {detail.project.mode === "custom_pipeline" ? (
                <label>
                  <span>Pipeline config path</span>
                  <input
                    value={form.configPath}
                    onChange={(event) => (
                      setForm((current) => ({ ...current, configPath: event.target.value }))
                    )}
                  />
                </label>
              ) : (
                <label>
                  <span>Managed deployment recipe</span>
                  <input value="Generated from GitHub repo analysis" readOnly />
                </label>
              )}
            </div>

            {detail.project.mode === "custom_pipeline" ? (
              <div className="panel-card inset-card">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Write-only secret update</p>
                    <h3>Upsert a project secret</h3>
                  </div>
                  <KeyRound size={18} />
                </div>

                <div className="split-inputs">
                  <label>
                    <span>Secret name</span>
                    <input
                      value={form.secretName}
                      onChange={(event) => (
                        setForm((current) => ({ ...current, secretName: event.target.value }))
                      )}
                      placeholder="prod_private_key"
                    />
                  </label>

                  <label>
                    <span>Secret value</span>
                    <input
                      value={form.secretValue}
                      onChange={(event) => (
                        setForm((current) => ({ ...current, secretValue: event.target.value }))
                      )}
                      placeholder="New encrypted value source"
                    />
                  </label>
                </div>

                {detail.secretNames.length > 0 ? (
                  <div className="tag-list">
                    {detail.secretNames.map((name) => (
                      <span className="tag-chip" key={name}>
                        {name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="muted-copy">No secret names have been stored yet.</p>
                )}
              </div>
            ) : (
              <div className="panel-card inset-card">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Managed runtime</p>
                    <h3>AutoOps handles the deploy recipe</h3>
                  </div>
                  <Rocket size={18} />
                </div>
                <p className="muted-copy">
                  Imported Next.js projects do not require pipeline files, registry credentials,
                  or SSH target secrets. Update the branch, then use Deploy Now to roll out the
                  latest commit.
                </p>
              </div>
            )}

            <button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Project Settings"}
            </button>
          </form>
        </article>

        <div className="page-stack">
          <article className="panel-card">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Recent runs</p>
                <h3>Execution pulse</h3>
              </div>
            </div>

            {detail.recentRuns.length > 0 ? (
              <div className="stack-list">
                {detail.recentRuns.map((run) => (
                  <Link className="list-row" key={run.id} to={`/runs?run=${run.id}`}>
                    <div>
                      <strong>{run.branch}</strong>
                      <p>{shortSha(run.commitSha)}</p>
                    </div>
                    <div className="row-end">
                      <StatusBadge status={run.status} />
                      <small>{formatRelativeTime(run.queuedAt)}</small>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No runs recorded"
                description="Pipeline activity for this project will appear here."
              />
            )}
          </article>

          <article className="panel-card">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Deployment targets</p>
                <h3>Managed environments</h3>
              </div>
            </div>

            {detail.deploymentTargets.length > 0 ? (
              <div className="stack-list">
                {detail.deploymentTargets.map((target) => (
                  <Link
                    className="list-row"
                    key={target.id}
                    to={`/deployments?target=${target.id}`}
                  >
                    <div>
                      <strong>{target.name}</strong>
                      <p>
                        {target.targetType === "managed_vps"
                          ? `Managed VPS • ${target.managedDomain ?? target.managedPort}`
                          : target.service}
                      </p>
                    </div>
                    <div className="row-end">
                      <StatusBadge status={target.lastStatus} />
                      <small>{target.lastDeployedImage ?? target.composeFile}</small>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No deployment targets"
                description="Targets will appear once AutoOps syncs deploy configuration for this project."
              />
            )}
          </article>
        </div>
      </section>
    </div>
  );
}

function MetaItem(props: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="meta-item">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
