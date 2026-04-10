import { FormEvent, useEffect, useMemo, useState } from "react";
import { ExternalLink, KeyRound, Rocket, Save, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ProjectDetail } from "@autoops/core";

import { useAppSession } from "../app-context";
import { MetaList } from "../components/MetaList";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import { deleteProject, deployManagedProject, getProject, updateProject } from "../lib/api";
import { formatDateTime, formatRelativeTime, shortSha } from "../lib/format";
import {
  formatManagedFrameworkName,
  formatManagedModeLabel,
  formatRepositoryFrameworkName
} from "../lib/managed-app";
import {
  buildManagedTargetUrl,
  formatManagedTargetKind,
  formatManagedTargetLabel,
  isManagedPreviewTarget
} from "../lib/managed-targets";
import { formatExternalUrlLabel, normalizeExternalUrl } from "../lib/links";

type ProjectTab = "overview" | "settings" | "secrets" | "targets" | "history";

const tabs: Array<{ value: ProjectTab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "settings", label: "Settings" },
  { value: "secrets", label: "Secrets" },
  { value: "targets", label: "Targets" },
  { value: "history", label: "History" }
];

export function ProjectDetailPage() {
  const { token, refreshNonce, refreshApp } = useAppSession();
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [form, setForm] = useState({
    name: "",
    defaultBranch: "",
    configPath: "",
    secretName: "",
    secretValue: ""
  });
  const [activeTab, setActiveTab] = useState<ProjectTab>("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deployBranch, setDeployBranch] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
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
        setDeployBranch(response.project.defaultBranch);
        setDeleteConfirmation("");
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

  const primaryTarget = detail?.deploymentTargets.find((target) => !isManagedPreviewTarget(target))
    ?? detail?.deploymentTargets[0]
    ?? null;
  const previewTargets = detail?.deploymentTargets.filter((target) => isManagedPreviewTarget(target))
    ?? [];
  const nonPreviewTargets = detail?.deploymentTargets.filter((target) => !isManagedPreviewTarget(target))
    ?? [];
  const latestRun = detail?.recentRuns[0] ?? null;
  const previewTargetCount = previewTargets.length;
  const deleteConfirmationMatches = deleteConfirmation.trim() === (detail?.project.name ?? "");

  function formatTargetAddress(target: ProjectDetail["deploymentTargets"][number]) {
    const managedTargetUrl = buildManagedTargetUrl(target) ?? target.managedDomain;
    if (managedTargetUrl) {
      return formatExternalUrlLabel(managedTargetUrl) ?? managedTargetUrl;
    }

    return target.targetType === "managed_vps" ? target.service : target.composeFile;
  }

  function getManagedTargetHref(target: ProjectDetail["deploymentTargets"][number]) {
    if (target.targetType !== "managed_vps") {
      return null;
    }

    return buildManagedTargetUrl(target);
  }

  const headerMeta = useMemo(() => {
    if (!detail) {
      return null;
    }

    return (
      <div className="ao-inline-meta">
        <span className={`ao-chip${detail.project.mode === "managed_nextjs" ? " ao-chip--accent" : ""}`}>
          {detail.project.mode === "managed_nextjs"
            ? formatManagedModeLabel(detail.project.managedConfig?.framework)
            : "Custom pipeline"}
        </span>
        <span className="ao-chip ao-mono">{detail.project.repoOwner}/{detail.project.repoName}</span>
        <span className="ao-chip ao-mono">{detail.project.defaultBranch}</span>
        {detail.project.mode === "managed_nextjs" ? (
          <span className="ao-chip">{previewTargetCount} previews</span>
        ) : null}
        <StatusBadge status={detail.project.latestRunStatus ?? "idle"} tone="subtle" />
      </div>
    );
  }, [detail, previewTargetCount]);

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
          form.secretName && form.secretValue
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

  async function handleDeployNow(branch = detail?.project.defaultBranch ?? "") {
    if (!detail) {
      return;
    }

    setIsDeploying(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await deployManagedProject(token, projectId, { branch });
      refreshApp();
      const targetId = response.target?.id ?? primaryTarget?.id;

      if (targetId) {
        navigate(`/deployments?target=${targetId}&run=${response.run.id}&section=logs`);
        return;
      }

      navigate(`/runs?run=${response.run.id}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to queue deployment");
    } finally {
      setIsDeploying(false);
    }
  }

  async function handleDeleteProject() {
    if (!detail || !deleteConfirmationMatches) {
      return;
    }

    setIsDeleting(true);
    setError("");
    setSuccessMessage("");

    try {
      await deleteProject(token, projectId);
      refreshApp();
      navigate("/projects");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to delete project");
      setIsDeleting(false);
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
    <div className="ao-page ao-project-detail">
      <PageHeader
        eyebrow="Inventory / Project"
        title={detail.project.name}
        description="Inspect deployment posture, update project settings, and manage the current runtime state."
        meta={headerMeta}
        actions={
          <>
            {detail.project.primaryUrl ? (
              <a
                className="ao-link-button ao-link-button--secondary"
                href={normalizeExternalUrl(detail.project.primaryUrl) ?? detail.project.primaryUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink size={16} />
                <span>Open live site</span>
              </a>
            ) : null}
            {detail.repository ? (
              <a
                className="ao-link-button ao-link-button--secondary"
                href={detail.repository.htmlUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink size={16} />
                <span>Open repo</span>
              </a>
            ) : null}
            {detail.project.mode === "managed_nextjs" ? (
              <button
                className="ao-button ao-button--primary"
                disabled={isDeploying}
                onClick={() => void handleDeployNow(detail.project.defaultBranch)}
                type="button"
              >
                <Rocket size={16} />
                <span>{isDeploying ? "Queueing..." : "Deploy production"}</span>
              </button>
            ) : null}
          </>
        }
      />

      {error ? <InlineError message={error} /> : null}
      {successMessage ? <div className="ao-inline-message"><strong>Saved</strong><span>{successMessage}</span></div> : null}

      <section className="ao-project-detail__layout">
        <div className="ao-project-detail__main">
          <article className="ao-panel">
            <div className="ao-tabs" role="tablist" aria-label="Project tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  className={`ao-tab${activeTab === tab.value ? " is-active" : ""}`}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "overview" ? (
              <div className="ao-tab-panel">
                <div className="ao-summary-grid">
                  <div className="ao-summary-grid__main">
                    <article className="ao-panel ao-panel--inset">
                      <div className="ao-section-header">
                        <div className="ao-section-header__copy">
                          <p className="ao-section-header__eyebrow">Current deployment</p>
                          <h3>Runtime status</h3>
                        </div>
                      </div>
                      <MetaList
                        items={[
                          { label: "Latest run", value: <StatusBadge status={detail.project.latestRunStatus ?? "idle"} /> },
                          { label: "Targets", value: String(detail.project.targetCount), mono: true },
                          {
                            label: "Primary URL",
                            value: detail.project.primaryUrl
                              ? formatExternalUrlLabel(detail.project.primaryUrl)
                              : "Pending managed edge domain",
                            mono: true
                          },
                          {
                            label: "Last run",
                            value: latestRun ? `${latestRun.branch} • ${shortSha(latestRun.commitSha)}` : "No runs yet",
                            mono: Boolean(latestRun)
                          }
                        ]}
                      />
                    </article>

                    <article className="ao-panel ao-panel--inset">
                      <div className="ao-section-header">
                        <div className="ao-section-header__copy">
                          <p className="ao-section-header__eyebrow">Recent runs</p>
                          <h3>Execution pulse</h3>
                        </div>
                      </div>

                      {detail.recentRuns.length > 0 ? (
                        <div className="ao-ledger ao-project-runs">
                          {detail.recentRuns.map((run) => (
                            <Link className="ao-ledger__row ao-project-runs__row" key={run.id} to={`/runs?run=${run.id}`}>
                              <div className="ao-project-runs__identity">
                                <strong>{run.branch}</strong>
                                <div className="ao-ledger__meta">
                                  <span className="ao-mono">{shortSha(run.commitSha)}</span>
                                  <span>{run.triggeredBy}</span>
                                </div>
                              </div>
                              <div className="ao-stack ao-stack--sm ao-project-runs__status">
                                <StatusBadge status={run.status} tone="subtle" />
                                <span className="ao-table__secondary">{formatRelativeTime(run.queuedAt)}</span>
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

                    {previewTargets.length > 0 ? (
                      <article className="ao-panel ao-panel--inset">
                        <div className="ao-section-header">
                          <div className="ao-section-header__copy">
                            <p className="ao-section-header__eyebrow">Preview environments</p>
                            <h3>Branch deploys</h3>
                          </div>
                        </div>

                        <div className="ao-ledger ao-project-previews">
                          {previewTargets.map((target) => {
                            const targetHref = getManagedTargetHref(target);
                            return (
                              <div className="ao-ledger__row ao-project-previews__row" key={target.id}>
                                <div className="ao-project-targets__identity">
                                  <strong>{formatManagedTargetLabel(target)}</strong>
                                  <div className="ao-ledger__meta">
                                    <span>{formatManagedTargetKind(target)}</span>
                                    <span className="ao-mono">{formatTargetAddress(target)}</span>
                                  </div>
                                </div>
                                <div className="ao-project-previews__actions">
                                  <StatusBadge status={target.lastStatus} tone="subtle" />
                                  <div className="ao-inline-cluster">
                                    {targetHref ? (
                                      <a
                                        className="ao-link-button ao-link-button--secondary"
                                        href={targetHref}
                                        rel="noreferrer"
                                        target="_blank"
                                      >
                                        <ExternalLink size={16} />
                                        <span>Open preview</span>
                                      </a>
                                    ) : null}
                                    <Link
                                      className="ao-link-button ao-link-button--secondary"
                                      to={`/deployments?target=${target.id}`}
                                    >
                                      Open target
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    ) : null}
                  </div>

                  <div className="ao-summary-grid__side">
                    <article className="ao-panel ao-panel--inset">
                      <div className="ao-section-header">
                        <div className="ao-section-header__copy">
                          <p className="ao-section-header__eyebrow">Target summary</p>
                          <h3>Environments</h3>
                        </div>
                      </div>

                      {detail.deploymentTargets.length > 0 ? (
                        <div className="ao-ledger ao-project-targets">
                          {detail.deploymentTargets.map((target) => (
                            <Link className="ao-ledger__row ao-project-targets__row" key={target.id} to={`/deployments?target=${target.id}`}>
                              <div className="ao-project-targets__identity">
                                <strong>{formatManagedTargetLabel(target)}</strong>
                                <div className="ao-ledger__meta">
                                  <span>{target.targetType === "managed_vps" ? formatManagedTargetKind(target) : "SSH compose"}</span>
                                  <span className="ao-mono">{formatTargetAddress(target)}</span>
                                </div>
                              </div>
                              <div className="ao-stack ao-stack--sm ao-project-targets__status">
                                <StatusBadge status={target.lastStatus} tone="subtle" />
                                <span
                                  className="ao-table__secondary ao-project-targets__detail"
                                  title={target.lastDeployedImage ?? undefined}
                                >
                                  {target.lastDeployedImage ?? "No image yet"}
                                </span>
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
                </div>
              </div>
            ) : null}

            {activeTab === "settings" ? (
              <form className="ao-form-grid" onSubmit={handleSubmit}>
                <div className="ao-form-grid ao-form-grid--two">
                  <label>
                    <span>Name</span>
                    <input
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>

                  <label>
                    <span>Default branch</span>
                    <input
                      value={form.defaultBranch}
                      onChange={(event) => setForm((current) => ({ ...current, defaultBranch: event.target.value }))}
                    />
                  </label>
                </div>

                {detail.project.mode === "custom_pipeline" ? (
                  <label>
                    <span>Pipeline config path</span>
                    <input
                      value={form.configPath}
                      onChange={(event) => setForm((current) => ({ ...current, configPath: event.target.value }))}
                    />
                  </label>
                ) : (
                  <article className="ao-panel ao-panel--inset">
                    <div className="ao-section-header">
                      <div className="ao-section-header__copy">
                        <p className="ao-section-header__eyebrow">Managed runtime</p>
                        <h3>Deployment recipe is generated by AutoOps</h3>
                      </div>
                    </div>
                    <p className="ao-muted">
                      Imported {formatManagedFrameworkName(detail.project.managedConfig?.framework)} projects do not require pipeline files, registry credentials, or SSH target secrets. Application environment variables can still be added from the Secrets tab.
                    </p>
                  </article>
                )}

                <div className="ao-inline-cluster">
                  <button className="ao-button ao-button--primary" disabled={isSaving} type="submit">
                    <Save size={16} />
                    <span>{isSaving ? "Saving..." : "Save settings"}</span>
                  </button>
                </div>

                <article className="ao-panel ao-panel--inset ao-project-danger-zone">
                  <div className="ao-section-header">
                    <div className="ao-section-header__copy">
                      <p className="ao-section-header__eyebrow">Danger zone</p>
                      <h3>Delete project</h3>
                    </div>
                    <Trash2 size={18} />
                  </div>

                  <p className="ao-muted">
                    This removes the project from AutoOps, including stored secrets, run history,
                    and deployment target metadata. Managed runtime files and live containers are
                    not cleaned up yet.
                  </p>

                  <label>
                    <span>Type project name to confirm</span>
                    <input
                      value={deleteConfirmation}
                      onChange={(event) => setDeleteConfirmation(event.target.value)}
                      placeholder={detail.project.name}
                    />
                  </label>

                  <div className="ao-inline-cluster">
                    <button
                      className="ao-button ao-button--danger"
                      disabled={!deleteConfirmationMatches || isDeleting}
                      onClick={() => void handleDeleteProject()}
                      type="button"
                    >
                      <Trash2 size={16} />
                      <span>{isDeleting ? "Deleting..." : "Delete project"}</span>
                    </button>
                  </div>
                </article>
              </form>
            ) : null}

            {activeTab === "secrets" ? (
              <form className="ao-form-grid" onSubmit={handleSubmit}>
                <article className="ao-panel ao-panel--inset">
                  <div className="ao-section-header">
                    <div className="ao-section-header__copy">
                      <p className="ao-section-header__eyebrow">Write-only update</p>
                      <h3>Upsert a project secret</h3>
                    </div>
                    <KeyRound size={18} />
                  </div>

                  <p className="ao-muted">
                    {detail.project.mode === "managed_nextjs"
                      ? "Managed builds and runtime containers receive these values as environment variables."
                      : "Use these values for pipeline, registry, and SSH deployment access."}
                  </p>

                  <div className="ao-form-grid ao-form-grid--two">
                    <label>
                      <span>Secret name</span>
                      <input
                        value={form.secretName}
                        onChange={(event) => setForm((current) => ({ ...current, secretName: event.target.value }))}
                        placeholder={detail.project.mode === "managed_nextjs" ? "MONGODB_URI" : "prod_private_key"}
                      />
                    </label>

                    <label>
                      <span>Secret value</span>
                      <input
                        value={form.secretValue}
                        onChange={(event) => setForm((current) => ({ ...current, secretValue: event.target.value }))}
                        placeholder={
                          detail.project.mode === "managed_nextjs"
                            ? "mongodb://db.internal:27017/app"
                            : "New encrypted value source"
                        }
                      />
                    </label>
                  </div>

                  {detail.secretNames.length > 0 ? (
                    <div className="ao-secret-list">
                      {detail.secretNames.map((name) => (
                        <span className="ao-chip" key={name}>
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="ao-muted">No secret names have been stored yet.</p>
                  )}
                </article>

                <div className="ao-inline-cluster">
                  <button className="ao-button ao-button--primary" disabled={isSaving} type="submit">
                    <Save size={16} />
                    <span>{isSaving ? "Saving..." : "Save secret update"}</span>
                  </button>
                </div>
              </form>
            ) : null}

            {activeTab === "targets" ? (
              detail.deploymentTargets.length > 0 ? (
                <div className="ao-tab-panel">
                  {nonPreviewTargets.length > 0 ? (
                    <div className="ao-target-group">
                      <h3>Primary environments</h3>
                      <div className="ao-ledger">
                        {nonPreviewTargets.map((target) => (
                          <Link className="ao-ledger__row ao-project-targets__row" key={target.id} to={`/deployments?target=${target.id}`}>
                            <div className="ao-project-targets__identity">
                              <strong>{formatManagedTargetLabel(target)}</strong>
                              <div className="ao-ledger__meta">
                                <span>{target.targetType === "managed_vps" ? formatManagedTargetKind(target) : "SSH compose"}</span>
                                <span className="ao-mono">{formatTargetAddress(target)}</span>
                              </div>
                            </div>
                            <div className="ao-stack ao-stack--sm ao-project-targets__status">
                              <StatusBadge status={target.lastStatus} tone="subtle" />
                              <span
                                className="ao-table__secondary ao-project-targets__detail"
                                title={target.lastError ?? target.lastDeployedImage ?? undefined}
                              >
                                {target.lastError ?? target.lastDeployedImage ?? "No deployment yet"}
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {previewTargets.length > 0 ? (
                    <div className="ao-target-group">
                      <h3>Preview environments</h3>
                      <div className="ao-ledger">
                        {previewTargets.map((target) => (
                          <Link className="ao-ledger__row ao-project-targets__row" key={target.id} to={`/deployments?target=${target.id}`}>
                            <div className="ao-project-targets__identity">
                              <strong>{formatManagedTargetLabel(target)}</strong>
                              <div className="ao-ledger__meta">
                                <span>{formatManagedTargetKind(target)}</span>
                                <span className="ao-mono">{formatTargetAddress(target)}</span>
                              </div>
                            </div>
                            <div className="ao-stack ao-stack--sm ao-project-targets__status">
                              <StatusBadge status={target.lastStatus} tone="subtle" />
                              <span
                                className="ao-table__secondary ao-project-targets__detail"
                                title={target.lastError ?? target.lastDeployedImage ?? undefined}
                              >
                                {target.lastError ?? target.lastDeployedImage ?? "No deployment yet"}
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <EmptyState
                  title="No deployment targets"
                  description="Targets will appear once AutoOps syncs deploy configuration for this project."
                />
              )
            ) : null}

            {activeTab === "history" ? (
              detail.recentRuns.length > 0 ? (
                <div className="ao-ledger">
                  {detail.recentRuns.map((run) => (
                    <Link className="ao-ledger__row" key={run.id} to={`/runs?run=${run.id}`}>
                      <div>
                        <strong>{run.branch}</strong>
                        <div className="ao-ledger__meta">
                          <span className="ao-mono">{shortSha(run.commitSha)}</span>
                          <span>{run.source}</span>
                        </div>
                      </div>
                      <div className="ao-stack ao-stack--sm">
                        <StatusBadge status={run.status} tone="subtle" />
                        <span className="ao-table__secondary">{formatDateTime(run.queuedAt)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No runs recorded"
                  description="Execution history for this project will appear here."
                />
              )
            ) : null}
          </article>
        </div>

        <div className="ao-project-detail__side">
          <article className="ao-panel">
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Control center</p>
                <h2>Current posture</h2>
              </div>
            </div>

            <MetaList
              items={[
                { label: "Installation", value: detail.installation ? `${detail.installation.accountLogin} #${detail.installation.installationId}` : "Not linked", mono: true },
                { label: "Primary URL", value: detail.project.primaryUrl ? formatExternalUrlLabel(detail.project.primaryUrl) : "Pending", mono: true },
                { label: "Updated", value: formatDateTime(detail.project.updatedAt), mono: true },
                { label: "Latest run", value: <StatusBadge status={detail.project.latestRunStatus ?? "idle"} /> }
              ]}
            />

            {detail.project.mode === "managed_nextjs" ? (
              <div className="ao-form-grid">
                <label>
                  <span>Deploy branch</span>
                  <input
                    value={deployBranch}
                    onChange={(event) => setDeployBranch(event.target.value)}
                    placeholder={detail.project.defaultBranch}
                  />
                </label>
                <p className="ao-muted">
                  The default branch updates production. Any other branch creates or refreshes a managed preview environment.
                </p>
                <div className="ao-inline-cluster">
                  <span className={`ao-chip${deployBranch && deployBranch !== detail.project.defaultBranch ? " ao-chip--accent" : ""}`}>
                    {deployBranch && deployBranch !== detail.project.defaultBranch ? "Preview deploy" : "Production deploy"}
                  </span>
                  <button
                    className="ao-button ao-button--secondary"
                    disabled={isDeploying}
                    onClick={() => void handleDeployNow(deployBranch || detail.project.defaultBranch)}
                    type="button"
                  >
                    <Rocket size={16} />
                    <span>{isDeploying ? "Queueing..." : "Deploy branch"}</span>
                  </button>
                </div>
              </div>
            ) : null}

            {primaryTarget ? (
              <Link className="ao-link-button ao-link-button--secondary" to={`/deployments?target=${primaryTarget.id}`}>
                Open deployment target
              </Link>
            ) : null}
          </article>

          {detail.repository ? (
            <article className="ao-panel">
              <div className="ao-section-header">
                <div className="ao-section-header__copy">
                  <p className="ao-section-header__eyebrow">Repository context</p>
                  <h2>{detail.repository.fullName}</h2>
                </div>
                <StatusBadge status={detail.repository.deployabilityStatus} tone="subtle" />
              </div>

              <div className="ao-inline-meta">
                <span className="ao-chip ao-chip--accent">
                  {formatRepositoryFrameworkName(detail.repository.detectedFramework)}
                </span>
                <span className="ao-chip">{detail.repository.isPrivate ? "Private" : "Public"}</span>
                <span className="ao-chip ao-mono">{detail.repository.defaultBranch}</span>
              </div>

              <p className="ao-muted">{detail.repository.description ?? "No description provided on GitHub."}</p>
              <div className="ao-inline-cluster">
                <a
                  className="ao-link-button ao-link-button--secondary"
                  href={detail.repository.htmlUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink size={16} />
                  <span>Open repository</span>
                </a>
                <span className="ao-table__secondary">Last synced {formatRelativeTime(detail.repository.syncedAt)}</span>
              </div>
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
}
