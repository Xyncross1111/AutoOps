import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, GitBranch, LifeBuoy, ShieldAlert, TerminalSquare } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type {
  DeploymentRevisionSummary,
  DeploymentTargetDetail,
  DeploymentTargetSummary
} from "@autoops/core";

import { useAppSession } from "../app-context";
import { LogViewer } from "../components/LogViewer";
import { MetaList } from "../components/MetaList";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { Toolbar } from "../components/Toolbar";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import { useRunStream } from "../hooks/useRunStream";
import {
  createPromotion,
  getDeploymentTarget,
  listDeployments,
  rollbackToRevision
} from "../lib/api";
import {
  buildManagedTargetUrl,
  formatManagedTargetKind,
  formatManagedTargetLabel
} from "../lib/managed-targets";
import {
  formatDateTime,
  formatDuration,
  formatRelativeTime,
  shortSha,
  titleCase
} from "../lib/format";
import { formatExternalUrlLabel } from "../lib/links";

type DeploymentInspectorTab = "summary" | "logs";

const deploymentTabs: Array<{ value: DeploymentInspectorTab; label: string }> = [
  { value: "summary", label: "Summary" },
  { value: "logs", label: "Logs" }
];

export function DeploymentsPage() {
  const { token, refreshNonce, refreshApp } = useAppSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [targets, setTargets] = useState<DeploymentTargetSummary[]>([]);
  const [revisions, setRevisions] = useState<DeploymentRevisionSummary[]>([]);
  const [detail, setDetail] = useState<DeploymentTargetDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [rollbackError, setRollbackError] = useState("");
  const [promotionError, setPromotionError] = useState("");
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [promotingKey, setPromotingKey] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const inspectorRef = useRef<HTMLDivElement | null>(null);

  const selectedTargetId = searchParams.get("target");
  const requestedRunId = searchParams.get("run");
  const selectedSection = (searchParams.get("section") as DeploymentInspectorTab | null) ?? "summary";
  const environmentFilter = searchParams.get("environment") ?? "all";

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    void listDeployments(token)
      .then((response) => {
        if (!active) {
          return;
        }
        setTargets(response.targets);
        setRevisions(response.revisions);
      })
      .catch((caughtError) => {
        if (active) {
          setError(
            caughtError instanceof Error ? caughtError.message : "Failed to load deployments"
          );
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
  }, [refreshNonce, token]);

  useEffect(() => {
    if (!selectedTargetId && targets[0]) {
      startTransition(() => {
        setSearchParams({ target: targets[0].id }, { replace: true });
      });
    }
  }, [selectedTargetId, setSearchParams, targets]);

  useEffect(() => {
    if (!selectedTargetId) {
      setDetail(null);
      setSelectedRunId(null);
      return;
    }

    let active = true;
    setIsDetailLoading(true);
    setRollbackError("");

    void getDeploymentTarget(token, selectedTargetId)
      .then((response) => {
        if (active) {
          setDetail(response);
        }
      })
      .catch((caughtError) => {
        if (active) {
          setRollbackError(
            caughtError instanceof Error ? caughtError.message : "Failed to load target detail"
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsDetailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedTargetId, token]);

  useEffect(() => {
    if (!detail) {
      setSelectedRunId(null);
      return;
    }

    const validRunIds = new Set(detail.linkedRuns.map((run) => run.id));
    if (requestedRunId && validRunIds.has(requestedRunId)) {
      setSelectedRunId(requestedRunId);
      return;
    }

    const activeRun = detail.linkedRuns.find((run) => run.status === "running");
    const fallbackRun = activeRun ?? detail.linkedRuns[0];
    setSelectedRunId(fallbackRun?.id ?? null);
  }, [detail, requestedRunId]);

  const stream = useRunStream(token, selectedRunId, (updatedRun) => {
    setDetail((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        linkedRuns: current.linkedRuns.map((run) => (run.id === updatedRun.id ? updatedRun : run))
      };
    });
  });

  const selectedRunForStream = stream.detail?.run
    ?? detail?.linkedRuns.find((run) => run.id === selectedRunId)
    ?? null;

  function formatTargetAddress(target: DeploymentTargetSummary) {
    const managedTargetUrl = buildManagedTargetUrl(target) ?? target.managedDomain;
    if (managedTargetUrl) {
      return formatExternalUrlLabel(managedTargetUrl) ?? managedTargetUrl;
    }

    return target.targetType === "managed_vps" ? target.service : target.composeFile;
  }

  useEffect(() => {
    if (selectedSection !== "logs" || !inspectorRef.current) {
      return;
    }

    inspectorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedSection, selectedRunId]);

  const groupedTargets = useMemo(
    () =>
      targets
        .filter((target) => {
          if (environmentFilter === "production") {
            return target.environment === "production";
          }

          if (environmentFilter === "preview") {
            return target.environment === "preview";
          }

          return true;
        })
        .reduce<Record<string, DeploymentTargetSummary[]>>((groups, target) => {
        groups[target.projectName] ??= [];
        groups[target.projectName].push(target);
        return groups;
      }, {}),
    [environmentFilter, targets]
  );

  const promotionDestinations = useMemo(
    () => (detail ? getPromotionDestinations(detail.target, targets) : []),
    [detail, targets]
  );

  async function handleRollback(targetId: string, revisionId: string) {
    setRollingBackId(revisionId);
    setRollbackError("");

    try {
      await rollbackToRevision(token, { targetId, revisionId });
      refreshApp();
    } catch (caughtError) {
      setRollbackError(
        caughtError instanceof Error ? caughtError.message : "Failed to queue rollback"
      );
    } finally {
      setRollingBackId(null);
    }
  }

  async function handlePromotion(revisionId: string, destinationTargetId: string) {
    const key = `${revisionId}:${destinationTargetId}`;
    setPromotingKey(key);
    setPromotionError("");

    try {
      await createPromotion(token, {
        sourceRevisionId: revisionId,
        destinationTargetId
      });
      refreshApp();
    } catch (caughtError) {
      setPromotionError(
        caughtError instanceof Error ? caughtError.message : "Failed to request promotion"
      );
    } finally {
      setPromotingKey(null);
    }
  }

  function updateParams(nextValues: Record<string, string>) {
    const next = new URLSearchParams(searchParams);

    Object.entries(nextValues).forEach(([key, value]) => {
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });

    setSearchParams(next, { replace: true });
  }

  if (isLoading) {
    return <LoadingBlock label="Loading deployments..." />;
  }

  return (
    <div className="ao-page ao-deployments">
      <PageHeader
        eyebrow="Operations / Deployments"
        title="Deployments"
        description="Inspect target health, revision history, rollback readiness, and linked deployment logs."
        meta={
          <div className="ao-inline-meta">
            <span className="ao-chip">{targets.length} targets</span>
            <span className="ao-chip">{revisions.length} recent revisions</span>
          </div>
        }
      />

      {error ? <InlineError message={error} /> : null}
      {rollbackError ? <InlineError message={rollbackError} /> : null}
      {promotionError ? <InlineError message={promotionError} /> : null}

      <section
        className={`ao-split ao-split--three${
          selectedSection === "logs" ? " ao-split--three-log-focus" : ""
        }`}
      >
        <div className="ao-split__pane">
          <article className="ao-panel">
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Targets</p>
                <h2>Deployment surfaces</h2>
              </div>
              <ShieldAlert size={18} />
            </div>

            <Toolbar>
              <select
                value={environmentFilter}
                onChange={(event) => updateParams({ environment: event.target.value })}
              >
                <option value="all">All environments</option>
                <option value="production">Production</option>
                <option value="preview">Preview</option>
              </select>
            </Toolbar>

            {Object.keys(groupedTargets).length > 0 ? (
              <div className="ao-target-groups">
                {Object.entries(groupedTargets).map(([projectName, projectTargets]) => (
                  <div className="ao-target-group" key={projectName}>
                    <h3>{projectName}</h3>
                    {projectTargets.map((target) => (
                      <button
                        className={`ao-target-button${selectedTargetId === target.id ? " is-selected" : ""}`}
                        key={target.id}
                        type="button"
                        onClick={() => updateParams({ target: target.id })}
                      >
                        <div className="ao-inline-cluster">
                          <strong>{formatManagedTargetLabel(target)}</strong>
                          <StatusBadge status={target.lastStatus} tone="subtle" />
                        </div>
                        <p>{formatTargetAddress(target)}</p>
                        <small>{target.lastDeployedAt ? `Last deploy ${formatRelativeTime(target.lastDeployedAt)}` : "No deployment recorded yet"}</small>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No deployment targets yet"
                description="Targets appear here after projects define deploy steps and environments."
              />
            )}
          </article>
        </div>

        <div className="ao-split__pane">
          <article className="ao-panel">
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Revision ledger</p>
                <h2>{detail ? formatManagedTargetLabel(detail.target) : "Select a target"}</h2>
                {detail ? <p>{detail.target.projectName}</p> : null}
              </div>
              <GitBranch size={18} />
            </div>

            {isDetailLoading ? (
              <LoadingBlock label="Loading target detail..." />
            ) : !detail ? (
              <EmptyState
                title="Choose a target"
                description="Select a deployment target from the left to inspect its revision history."
              />
            ) : (
              <>
                <MetaList
                  items={[
                    { label: "Health", value: <StatusBadge status={detail.target.lastStatus} /> },
                    {
                      label: "Environment",
                      value:
                        detail.target.environment
                          ? titleCase(detail.target.environment)
                          : detail.target.targetType === "managed_vps"
                            ? formatManagedTargetKind(detail.target)
                            : "SSH compose"
                    },
                    {
                      label: "Promotion order",
                      value: detail.target.promotionOrder?.toString() ?? "Not promotable"
                    },
                    { label: "Service", value: detail.target.service, mono: true },
                    { label: "Healthcheck", value: detail.target.healthcheckUrl, mono: true },
                    {
                      label: "Last deployed",
                      value: formatDateTime(detail.target.lastDeployedAt),
                      mono: true
                    }
                  ]}
                />

                {buildManagedTargetUrl(detail.target) ? (
                  <div className="ao-inline-cluster">
                    <a
                      className="ao-link-button ao-link-button--secondary"
                      href={buildManagedTargetUrl(detail.target) ?? undefined}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink size={16} />
                      <span>
                        {detail.target.environment === "preview" ? "Open preview" : "Open deployment"}
                      </span>
                    </a>
                  </div>
                ) : null}

                {detail.target.lastError ? (
                  <InlineError title="Latest deployment error" message={detail.target.lastError} />
                ) : null}

                {detail.revisions.length > 0 ? (
                  <div className="ao-ledger">
                    {detail.revisions.map((revision) => {
                      const availablePromotionTargets = promotionDestinations.filter(
                        (target) =>
                          revision.status === "succeeded" &&
                          extractImageDigest(target.lastDeployedImage) !== revision.imageDigest
                      );

                      return (
                      <div className="ao-ledger__row ao-deployment-revision" key={revision.id}>
                        <div>
                          <strong>{revision.imageRef}</strong>
                          <div className="ao-ledger__meta">
                            <span className="ao-mono">{shortSha(revision.imageDigest)}</span>
                            <span className="ao-mono">{formatDateTime(revision.deployedAt)}</span>
                            {revision.runSource ? <span>{titleCase(revision.runSource)}</span> : null}
                          </div>
                          {revision.runSource === "manual_promotion" ? (
                            <div className="ao-ledger__meta">
                              <span>
                                Promoted from {revision.promotedFromTargetName ?? "another target"}
                              </span>
                              {revision.promotedFromRevisionId ? (
                                <span className="ao-mono">
                                  {shortSha(revision.promotedFromRevisionId)}
                                </span>
                              ) : null}
                              {revision.promotionApprovalStatus ? (
                                <span>{titleCase(revision.promotionApprovalStatus)} approval</span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <div className="ao-inline-cluster ao-deployment-revision__actions">
                          <StatusBadge status={revision.status} tone="subtle" />
                          {availablePromotionTargets.map((target) => {
                            const actionKey = `${revision.id}:${target.id}`;
                            return (
                              <button
                                className="ao-button ao-button--primary"
                                disabled={promotingKey === actionKey}
                                key={target.id}
                                onClick={() => void handlePromotion(revision.id, target.id)}
                                type="button"
                              >
                                {promotingKey === actionKey
                                  ? "Queueing..."
                                  : `Promote to ${formatPromotionTargetLabel(target)}`}
                              </button>
                            );
                          })}
                          <button
                            className="ao-button ao-button--secondary"
                            disabled={rollingBackId === revision.id}
                            onClick={() => void handleRollback(revision.targetId, revision.id)}
                            type="button"
                          >
                            {rollingBackId === revision.id ? "Queueing..." : "Rollback"}
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    title="No revisions recorded"
                    description="Revision history will appear once this target receives deployments."
                  />
                )}

                <div className="ao-divider" />

                <div className="ao-section-header">
                  <div className="ao-section-header__copy">
                    <p className="ao-section-header__eyebrow">Linked runs</p>
                    <h3>Execution context</h3>
                  </div>
                </div>

                {detail.linkedRuns.length > 0 ? (
                  <div className="ao-ledger">
                    {detail.linkedRuns.map((run) => (
                      <button
                        className={`ao-ledger__row${selectedRunId === run.id ? " is-selected" : ""}`}
                        key={run.id}
                        type="button"
                        onClick={() => {
                          setSelectedRunId(run.id);
                          updateParams({ target: selectedTargetId ?? detail.target.id, run: run.id });
                        }}
                      >
                        <div>
                          <strong>{run.projectName}</strong>
                          <div className="ao-ledger__meta">
                            <span className="ao-mono">{run.branch}</span>
                            <span className="ao-mono">{shortSha(run.commitSha)}</span>
                          </div>
                        </div>
                        <div className="ao-stack ao-stack--sm">
                          <StatusBadge status={run.status} tone="subtle" />
                          <span className="ao-table__secondary">
                            {formatRelativeTime(run.queuedAt)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No linked runs"
                    description="This target does not have revisions linked back to recorded run IDs."
                  />
                )}
              </>
            )}
          </article>
        </div>

        <div className="ao-split__pane">
          <article
            className={`ao-panel ao-inspector${
              selectedSection === "logs" ? " ao-inspector--logs" : ""
            }`}
            ref={inspectorRef}
          >
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Inspector</p>
                <h2>{selectedRunForStream?.projectName ?? (detail ? formatManagedTargetLabel(detail.target) : "No run selected")}</h2>
                {selectedRunForStream ? (
                  <p className="ao-mono">
                    {selectedRunForStream.branch} • {shortSha(selectedRunForStream.commitSha)}
                  </p>
                ) : null}
              </div>
              <LifeBuoy size={18} />
            </div>

            <div className="ao-tabs" role="tablist" aria-label="Deployment inspector tabs">
              {deploymentTabs.map((tab) => (
                <button
                  key={tab.value}
                  className={`ao-tab${selectedSection === tab.value ? " is-active" : ""}`}
                  type="button"
                  onClick={() => updateParams({ section: tab.value })}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {!detail ? (
              <EmptyState
                title="Select a deployment target"
                description="Choose a target to inspect rollout history and live execution."
              />
            ) : selectedSection === "summary" ? (
              <MetaList
                items={[
                  { label: "Target", value: formatManagedTargetLabel(detail.target) },
                  { label: "Project", value: detail.target.projectName },
                  { label: "Status", value: <StatusBadge status={detail.target.lastStatus} /> },
                  {
                    label: "Domain",
                    value: buildManagedTargetUrl(detail.target) ?? detail.target.managedDomain ?? detail.target.healthcheckUrl,
                    mono: true
                  },
                  {
                    label: "Run",
                    value: selectedRunForStream?.id ?? "No linked run selected",
                    mono: true
                  },
                  {
                    label: "Duration",
                    value: selectedRunForStream
                      ? formatDuration(
                          selectedRunForStream.startedAt ?? selectedRunForStream.queuedAt,
                          selectedRunForStream.finishedAt
                        )
                      : "Not available",
                    mono: true
                  }
                ]}
              />
            ) : selectedRunId ? (
              <>
                {stream.error ? <InlineError message={stream.error} /> : null}
                {!stream.detail && stream.isLoading ? (
                  <LoadingBlock label="Loading run detail..." />
                ) : stream.detail ? (
                  <LogViewer
                    entries={stream.logs}
                    emptyMessage="Log output will appear here while this deployment is running."
                    streamKey={selectedRunForStream?.id ?? null}
                  />
                ) : (
                  <EmptyState
                    title="No stream detail"
                    description="Run detail is not yet available for this deployment."
                  />
                )}
              </>
            ) : (
              <EmptyState
                title="No linked run selected"
                description="Choose a linked run from the revision ledger to inspect its live logs."
              />
            )}
          </article>
        </div>
      </section>
    </div>
  );
}

function getPromotionDestinations(
  sourceTarget: DeploymentTargetSummary,
  allTargets: DeploymentTargetSummary[]
) {
  const sourceOrder = sourceTarget.promotionOrder;
  if (sourceOrder === null) {
    return [];
  }

  const projectTargets = allTargets.filter((target) => target.projectId === sourceTarget.projectId);
  const nextOrder = projectTargets
    .flatMap((target) =>
      target.promotionOrder !== null && target.promotionOrder > sourceOrder
        ? [target.promotionOrder]
        : []
    )
    .sort((left, right) => left - right)[0];

  if (nextOrder === undefined) {
    return [];
  }

  return projectTargets.filter((target) => target.promotionOrder === nextOrder);
}

function formatPromotionTargetLabel(target: DeploymentTargetSummary) {
  if (target.environment) {
    return titleCase(target.environment);
  }

  return formatManagedTargetLabel(target);
}

function extractImageDigest(image: string | null) {
  if (!image) {
    return null;
  }

  const separatorIndex = image.lastIndexOf("@");
  return separatorIndex === -1 ? null : image.slice(separatorIndex + 1);
}
