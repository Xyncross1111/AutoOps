import { startTransition, type ReactNode, useEffect, useState } from "react";
import { GitBranch, LifeBuoy, ShieldAlert } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type {
  DeploymentRevisionSummary,
  DeploymentTargetDetail,
  DeploymentTargetSummary
} from "@autoops/core";

import { useAppSession } from "../app-context";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import { getDeploymentTarget, listDeployments, rollbackToRevision } from "../lib/api";
import { formatDateTime, formatRelativeTime, shortSha } from "../lib/format";

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
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  const selectedTargetId = searchParams.get("target");

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
    if (!selectedTargetId) {
      setDetail(null);
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
    if (!selectedTargetId && targets[0]) {
      startTransition(() => {
        setSearchParams({ target: targets[0].id }, { replace: true });
      });
    }
  }, [selectedTargetId, setSearchParams, targets]);

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

  const groupedTargets = targets.reduce<Record<string, DeploymentTargetSummary[]>>(
    (groups, target) => {
      groups[target.projectName] ??= [];
      groups[target.projectName].push(target);
      return groups;
    },
    {}
  );

  if (isLoading) {
    return <LoadingBlock label="Loading deployments..." />;
  }

  return (
    <div className="page-stack">
      {error ? <InlineError message={error} /> : null}
      {rollbackError ? <InlineError message={rollbackError} /> : null}

      <section className="content-grid deployments-layout">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Targets</p>
              <h3>Deployment surfaces</h3>
            </div>
            <ShieldAlert size={18} />
          </div>

          {targets.length > 0 ? (
            <div className="stack-list">
              {Object.entries(groupedTargets).map(([projectName, projectTargets]) => (
                <div className="group-stack" key={projectName}>
                  <h4>{projectName}</h4>
                  {projectTargets.map((target) => (
                    <button
                      type="button"
                      className={`deployment-target-card${
                        selectedTargetId === target.id ? " selected" : ""
                      }`}
                      key={target.id}
                      onClick={() => {
                        startTransition(() => {
                          setSearchParams({ target: target.id });
                        });
                      }}
                    >
                      <div className="row-spread">
                        <strong>{target.name}</strong>
                        <StatusBadge status={target.lastStatus} />
                      </div>
                      <p>{target.service}</p>
                      <small>{target.lastDeployedImage ?? target.composeFile}</small>
                      <small>
                        {target.lastDeployedAt
                          ? `Last deploy ${formatRelativeTime(target.lastDeployedAt)}`
                          : "No deployment recorded yet"}
                      </small>
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

        <article className="panel-card deployment-detail-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Target detail</p>
              <h3>{detail?.target.name ?? "Select a target"}</h3>
            </div>
            <LifeBuoy size={18} />
          </div>

          {isDetailLoading ? (
            <LoadingBlock label="Loading target detail..." />
          ) : !detail ? (
            <EmptyState
              title="Choose a target"
              description="Select a deployment target from the left to inspect its revision history."
            />
          ) : (
            <div className="detail-stack">
              <div className="meta-grid">
                <MetaItem label="Project" value={detail.target.projectName} />
                <MetaItem label="Health" value={<StatusBadge status={detail.target.lastStatus} />} />
                <MetaItem label="Service" value={detail.target.service} />
                <MetaItem label="Healthcheck" value={detail.target.healthcheckUrl} />
                <MetaItem label="Compose File" value={detail.target.composeFile} />
                <MetaItem
                  label="Last Deployed"
                  value={formatDateTime(detail.target.lastDeployedAt)}
                />
              </div>

              {detail.target.lastError ? (
                <InlineError title="Latest deployment error" message={detail.target.lastError} />
              ) : null}

              <div className="panel-card inset-card">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Revision history</p>
                    <h3>Rollback-ready releases</h3>
                  </div>
                  <GitBranch size={18} />
                </div>

                <div className="stack-list">
                  {detail.revisions.map((revision) => (
                    <div className="list-row revision-row" key={revision.id}>
                      <div>
                        <strong>{revision.imageRef}</strong>
                        <p>{revision.imageDigest}</p>
                        <small>{formatDateTime(revision.deployedAt)}</small>
                      </div>
                      <div className="row-end">
                        <StatusBadge status={revision.status} tone="subtle" />
                        <button
                          onClick={() => void handleRollback(revision.targetId, revision.id)}
                          disabled={rollingBackId === revision.id}
                        >
                          {rollingBackId === revision.id ? "Queueing..." : "Roll Back"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel-card inset-card">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Linked runs</p>
                    <h3>Execution context</h3>
                  </div>
                </div>

                {detail.linkedRuns.length > 0 ? (
                  <div className="stack-list">
                    {detail.linkedRuns.map((run) => (
                      <div className="list-row" key={run.id}>
                        <div>
                          <strong>{run.projectName}</strong>
                          <p>
                            {run.branch} · {shortSha(run.commitSha)}
                          </p>
                        </div>
                        <div className="row-end">
                          <StatusBadge status={run.status} tone="subtle" />
                          <small>{formatRelativeTime(run.queuedAt)}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No linked runs"
                    description="This target does not have revisions linked back to recorded run IDs."
                  />
                )}
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Cross-target history</p>
            <h3>Latest deployment revisions</h3>
          </div>
        </div>

        <div className="stack-list">
          {revisions.map((revision) => (
            <button
              type="button"
              className="list-row"
              key={revision.id}
              onClick={() => {
                startTransition(() => {
                  setSearchParams({ target: revision.targetId });
                });
              }}
            >
              <div>
                <strong>{revision.projectName}</strong>
                <p>{revision.targetName}</p>
              </div>
              <div className="row-end">
                <StatusBadge status={revision.status} tone="subtle" />
                <small>{formatDateTime(revision.deployedAt)}</small>
              </div>
            </button>
          ))}
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
