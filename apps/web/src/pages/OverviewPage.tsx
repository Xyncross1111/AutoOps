import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  FolderPlus,
  Rocket,
  ShieldAlert,
  Workflow
} from "lucide-react";
import { Link } from "react-router-dom";
import type { DashboardOverview } from "@autoops/core";

import { MetaList } from "../components/MetaList";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import { useAppSession } from "../app-context";
import { getDashboardOverview, rerunRun } from "../lib/api";
import { formatDateTime, formatFailureSummary, formatPercent, formatRelativeTime, shortSha } from "../lib/format";

export function OverviewPage() {
  const { token, refreshNonce, refreshApp } = useAppSession();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRerunning, setIsRerunning] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    void getDashboardOverview(token)
      .then((response) => {
        if (active) {
          setOverview(response.overview);
        }
      })
      .catch((caughtError) => {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : "Failed to load overview");
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

  async function handleRerunLatestFailed() {
    if (!overview?.attention.latestFailedRun) {
      return;
    }

    setIsRerunning(true);
    try {
      await rerunRun(token, overview.attention.latestFailedRun.id);
      refreshApp();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to rerun run");
    } finally {
      setIsRerunning(false);
    }
  }

  if (isLoading) {
    return <LoadingBlock label="Loading overview..." />;
  }

  if (error && !overview) {
    return (
      <InlineError
        message={error}
        action={
          <button className="ao-button ao-button--secondary" onClick={refreshApp}>
            Retry
          </button>
        }
      />
    );
  }

  if (!overview) {
    return (
      <EmptyState
        title="No overview available"
        description="AutoOps could not load the current platform summary."
        action={
          <button className="ao-button ao-button--secondary" onClick={refreshApp}>
            Refresh
          </button>
        }
      />
    );
  }

  const pendingApprovals = overview.attention.pendingApprovals ?? [];
  const pendingApprovalCount = overview.metrics.pendingApprovalCount ?? pendingApprovals.length;

  return (
    <div className="ao-page">
      <PageHeader
        eyebrow="Platform / Summary"
        title="Operational overview"
        description="Track delivery health, active work, and the operational items that need attention first."
        meta={
          <div className="ao-inline-meta">
            <span className="ao-chip">{overview.metrics.projectCount} projects</span>
            <span className="ao-chip">{overview.metrics.runningRunCount} running</span>
            <span className="ao-chip">{formatPercent(overview.metrics.successRate7d)} success</span>
          </div>
        }
        actions={
          <>
            <Link className="ao-link-button ao-link-button--primary" to="/repositories">
              <FolderPlus size={16} />
              <span>Connect GitHub</span>
            </Link>
            <Link className="ao-link-button ao-link-button--secondary" to="/runs">
              <Workflow size={16} />
              <span>Open runs</span>
            </Link>
          </>
        }
      />

      {error ? <InlineError message={error} /> : null}

      <section className="ao-stat-strip">
        <StatCard
          label="Latest failed run"
          value={overview.attention.latestFailedRun ? overview.attention.latestFailedRun.projectName : "None"}
          meta={
            overview.attention.latestFailedRun
              ? `${overview.attention.latestFailedRun.branch} • ${formatRelativeTime(overview.attention.latestFailedRun.queuedAt)}`
              : "No current failures"
          }
        />
        <StatCard
          label="Active runs"
          value={String(overview.metrics.runningRunCount)}
          meta={`${overview.metrics.queuedRunCount} queued`}
        />
        <StatCard
          label="Unhealthy targets"
          value={String(overview.metrics.unhealthyTargetCount)}
          meta={overview.metrics.unhealthyTargetCount > 0 ? "Needs review" : "Healthy"}
        />
        <StatCard
          label="7-day success"
          value={formatPercent(overview.metrics.successRate7d)}
          meta={`${overview.metrics.projectCount} tracked projects`}
        />
        <StatCard
          label="Pending approvals"
          value={String(pendingApprovalCount)}
          meta={pendingApprovalCount > 0 ? "Needs review" : "Nothing waiting"}
        />
      </section>

      <section className="ao-overview-grid">
        <div className="ao-overview-main">
          <article className="ao-panel">
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Needs attention</p>
                <h2>Latest failed run</h2>
                <p>Start here when delivery has regressed.</p>
              </div>
              <AlertTriangle size={18} />
            </div>

            {overview.attention.latestFailedRun ? (
              <div className="ao-attention-card">
                <div className="ao-attention-card__head">
                  <div className="ao-attention-card__body">
                    <h3>{overview.attention.latestFailedRun.projectName}</h3>
                    <p className="ao-mono">
                      {overview.attention.latestFailedRun.branch} • {shortSha(overview.attention.latestFailedRun.commitSha)}
                    </p>
                    {overview.attention.latestFailedRun.errorMessage ? (
                      <p className="ao-muted">{overview.attention.latestFailedRun.errorMessage}</p>
                    ) : null}
                  </div>
                  <StatusBadge status={overview.attention.latestFailedRun.status} />
                </div>

                <MetaList
                  items={[
                    {
                      label: "Queued",
                      value: formatDateTime(overview.attention.latestFailedRun.queuedAt)
                    },
                    {
                      label: "Triggered by",
                      value: overview.attention.latestFailedRun.triggeredBy
                    },
                    {
                      label: "Source",
                      value: overview.attention.latestFailedRun.source,
                      mono: true
                    }
                  ]}
                />

                <div className="ao-inline-cluster">
                  <button
                    className="ao-button ao-button--primary"
                    onClick={handleRerunLatestFailed}
                    disabled={isRerunning}
                  >
                    {isRerunning ? "Queueing..." : "Rerun latest failure"}
                  </button>
                  <Link
                    className="ao-link-button ao-link-button--secondary"
                    to={`/runs?run=${overview.attention.latestFailedRun.id}`}
                  >
                    Inspect run
                  </Link>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No failed runs"
                description="Recent pipeline activity is not showing a failure right now."
              />
            )}
          </article>

          <article className="ao-panel">
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Recent runs</p>
                <h2>Execution history</h2>
              </div>
              <Link className="ao-link" to="/runs">
                View all <ArrowRight size={14} />
              </Link>
            </div>

            {overview.recentRuns.length > 0 ? (
              <div className="ao-table-wrap ao-overview-table">
                <table className="ao-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Branch</th>
                      <th>Status</th>
                      <th>Queued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.recentRuns.map((run) => (
                      <tr key={run.id}>
                        <td>
                          <Link className="ao-link" to={`/runs?run=${run.id}`}>
                            {run.projectName}
                          </Link>
                        </td>
                        <td className="ao-mono">
                          {run.branch} • {shortSha(run.commitSha)}
                        </td>
                        <td>
                          <StatusBadge status={run.status} tone="subtle" />
                        </td>
                        <td className="ao-mono">{formatRelativeTime(run.queuedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No recent runs"
                description="Execution history will show here as AutoOps processes work."
              />
            )}
          </article>

          <article className="ao-panel">
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Recent deployments</p>
                <h2>Revision activity</h2>
              </div>
              <Link className="ao-link" to="/deployments">
                View all <ArrowRight size={14} />
              </Link>
            </div>

            {overview.recentDeployments.length > 0 ? (
              <div className="ao-table-wrap ao-overview-table">
                <table className="ao-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Target</th>
                      <th>Status</th>
                      <th>Deployed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.recentDeployments.map((revision) => (
                      <tr key={revision.id}>
                        <td>
                          <Link className="ao-link" to={`/deployments?target=${revision.targetId}`}>
                            {revision.projectName}
                          </Link>
                        </td>
                        <td className="ao-mono">
                          {revision.targetName} • {shortSha(revision.imageDigest)}
                        </td>
                        <td>
                          <StatusBadge status={revision.status} tone="subtle" />
                        </td>
                        <td className="ao-mono">{formatRelativeTime(revision.deployedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No deployment revisions yet"
                description="Recent deployment activity will appear once targets begin receiving revisions."
              />
            )}
          </article>
        </div>

        <aside className="ao-overview-side">
          <article className="ao-panel">
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Release approvals</p>
                <h2>Dashboard queue</h2>
              </div>
              <Link className="ao-link" to="/approvals">
                Open queue <ArrowRight size={14} />
              </Link>
            </div>

            {pendingApprovals.length > 0 ? (
              <div className="ao-ledger">
                {pendingApprovals.map((approval) => (
                  <Link className="ao-ledger__row" key={approval.id} to="/approvals">
                    <div>
                      <strong>
                        {approval.sourceTargetName} to {approval.destinationTargetName}
                      </strong>
                      <div className="ao-ledger__meta">
                        <span>{approval.projectName}</span>
                        <span className="ao-mono">{shortSha(approval.sourceImageDigest)}</span>
                      </div>
                    </div>
                    <div className="ao-stack ao-stack--sm">
                      <StatusBadge status={approval.status} tone="subtle" />
                      <span className="ao-table__secondary">
                        {formatRelativeTime(approval.createdAt)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No pending approvals"
                description="Protected release promotions waiting for review will surface here."
              />
            )}
          </article>

          <article className="ao-panel">
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Live execution</p>
                <h2>Active runs</h2>
              </div>
              <Workflow size={18} />
            </div>

            {overview.attention.activeRuns.length > 0 ? (
              <div className="ao-ledger">
                {overview.attention.activeRuns.map((run) => (
                  <Link className="ao-ledger__row" key={run.id} to={`/runs?run=${run.id}`}>
                    <div>
                      <strong>{run.projectName}</strong>
                      <div className="ao-ledger__meta">
                        <span className="ao-mono">{run.branch}</span>
                        <span className="ao-mono">{shortSha(run.commitSha)}</span>
                      </div>
                    </div>
                    <div className="ao-stack ao-stack--sm">
                      <StatusBadge status={run.status} />
                      <span className="ao-table__secondary">
                        {formatRelativeTime(run.startedAt ?? run.queuedAt)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nothing is running"
                description="The worker is idle at the moment. New runs will appear here."
              />
            )}
          </article>

          <article className="ao-panel">
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Deployment posture</p>
                <h2>Health summary</h2>
              </div>
              <ShieldAlert size={18} />
            </div>

            {overview.attention.unhealthyTargets.length > 0 ? (
              <div className="ao-ledger ao-overview-health">
                {overview.attention.unhealthyTargets.map((target) => (
                  <Link className="ao-ledger__row ao-overview-health__row" key={target.id} to={`/deployments?target=${target.id}`}>
                    <div className="ao-overview-health__identity">
                      <strong>{target.projectName}</strong>
                      <div className="ao-ledger__meta">
                        <span>{target.name}</span>
                        <span className="ao-mono">{target.managedDomain ?? target.service}</span>
                      </div>
                    </div>
                    <div className="ao-stack ao-stack--sm ao-overview-health__status">
                      <StatusBadge status={target.lastStatus} />
                      <span
                        className="ao-table__secondary ao-overview-health__error"
                        title={target.lastError ?? undefined}
                      >
                        {formatFailureSummary(target.lastError)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Deployment health looks strong"
                description="No known unhealthy deployment targets are being reported."
              />
            )}
          </article>

          <article className="ao-panel">
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Recent activity</p>
                <h2>Control-plane feed</h2>
              </div>
              <Rocket size={18} />
            </div>

            {overview.recentActivity.length > 0 ? (
              <div className="ao-ledger">
                {overview.recentActivity.map((event) => (
                  <Link className="ao-ledger__row" key={event.id} to={activityLink(event)}>
                    <div>
                      <strong>{event.title}</strong>
                      <div className="ao-ledger__meta">
                        <span>{event.description}</span>
                      </div>
                    </div>
                    <div className="ao-stack ao-stack--sm">
                      <StatusBadge status={event.status} tone="subtle" />
                      <span className="ao-table__secondary">{formatRelativeTime(event.occurredAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No recent activity"
                description="Audit and webhook events will appear here."
              />
            )}
          </article>
        </aside>
      </section>
    </div>
  );
}

function StatCard(props: {
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <div className="ao-stat">
      <span className="ao-stat__label">{props.label}</span>
      <strong className="ao-stat__value">{props.value}</strong>
      <span className="ao-stat__meta">{props.meta}</span>
    </div>
  );
}

function activityLink(event: DashboardOverview["recentActivity"][number]) {
  if (event.runId) {
    return `/runs?run=${event.runId}`;
  }

  if (event.targetId) {
    return `/deployments?target=${event.targetId}`;
  }

  if (event.projectId) {
    return `/projects/${event.projectId}`;
  }

  return "/activity";
}
