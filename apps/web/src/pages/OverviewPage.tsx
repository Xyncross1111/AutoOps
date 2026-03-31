import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, FolderPlus, Rocket, Workflow } from "lucide-react";
import { Link } from "react-router-dom";
import type { DashboardOverview } from "@autoops/core";

import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import { useAppSession } from "../app-context";
import { getDashboardOverview, rerunRun } from "../lib/api";
import { formatDateTime, formatPercent, formatRelativeTime, shortSha } from "../lib/format";

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
    return <InlineError message={error} action={<button onClick={refreshApp}>Retry</button>} />;
  }

  if (!overview) {
    return (
      <EmptyState
        title="No overview available"
        description="AutoOps could not load the current platform summary."
        action={<button onClick={refreshApp}>Refresh</button>}
      />
    );
  }

  return (
    <div className="page-stack">
      {error ? <InlineError message={error} /> : null}

      <section className="hero-grid">
        <div className="hero-card spotlight-card">
          <div className="spotlight-copy">
            <p className="eyebrow">At a glance</p>
            <h3>Keep delivery healthy without losing the operational thread.</h3>
            <p>
              AutoOps now highlights active execution, failed delivery, unhealthy targets,
              and the most recent control-plane activity in a single executive view.
            </p>
          </div>
          <div className="hero-actions">
            <Link className="button-link" to="/projects/new">
              <FolderPlus size={16} />
              <span>Register Project</span>
            </Link>
            <Link className="button-link secondary" to="/runs">
              <Workflow size={16} />
              <span>Open Run Triage</span>
            </Link>
          </div>
        </div>

        <div className="metric-grid">
          <MetricCard label="Projects" value={String(overview.metrics.projectCount)} />
          <MetricCard label="Queued Runs" value={String(overview.metrics.queuedRunCount)} />
          <MetricCard label="Active Runs" value={String(overview.metrics.runningRunCount)} />
          <MetricCard label="7-Day Success" value={formatPercent(overview.metrics.successRate7d)} />
          <MetricCard
            label="Unhealthy Targets"
            value={String(overview.metrics.unhealthyTargetCount)}
            tone={overview.metrics.unhealthyTargetCount > 0 ? "danger" : "success"}
          />
        </div>
      </section>

      <section className="content-grid three-up">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Attention</p>
              <h3>Latest failed run</h3>
            </div>
            <AlertTriangle size={18} />
          </div>

          {overview.attention.latestFailedRun ? (
            <div className="stack-list">
              <div className="run-summary-card accent-danger">
                <div className="row-spread">
                  <strong>{overview.attention.latestFailedRun.projectName}</strong>
                  <StatusBadge status={overview.attention.latestFailedRun.status} />
                </div>
                <p>
                  {overview.attention.latestFailedRun.branch} ·{" "}
                  {shortSha(overview.attention.latestFailedRun.commitSha)}
                </p>
                <small>
                  Triggered {formatRelativeTime(overview.attention.latestFailedRun.queuedAt)}
                </small>
                {overview.attention.latestFailedRun.errorMessage ? (
                  <small>{overview.attention.latestFailedRun.errorMessage}</small>
                ) : null}
              </div>
              <div className="row-actions">
                <button onClick={handleRerunLatestFailed} disabled={isRerunning}>
                  {isRerunning ? "Queueing..." : "Rerun Latest Failure"}
                </button>
                <Link className="text-link" to={`/runs?run=${overview.attention.latestFailedRun.id}`}>
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

        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Live execution</p>
              <h3>Active runs</h3>
            </div>
            <Workflow size={18} />
          </div>

          {overview.attention.activeRuns.length > 0 ? (
            <div className="stack-list">
              {overview.attention.activeRuns.map((run) => (
                <Link className="list-row" key={run.id} to={`/runs?run=${run.id}`}>
                  <div>
                    <strong>{run.projectName}</strong>
                    <p>
                      {run.branch} · {shortSha(run.commitSha)}
                    </p>
                  </div>
                  <div className="row-end">
                    <StatusBadge status={run.status} />
                    <small>{formatRelativeTime(run.startedAt ?? run.queuedAt)}</small>
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

        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Deployment posture</p>
              <h3>Needs attention</h3>
            </div>
            <Rocket size={18} />
          </div>

          {overview.attention.unhealthyTargets.length > 0 ? (
            <div className="stack-list">
              {overview.attention.unhealthyTargets.map((target) => (
                <Link
                  className="list-row"
                  key={target.id}
                  to={`/deployments?target=${target.id}`}
                >
                  <div>
                    <strong>{target.projectName}</strong>
                    <p>{target.name}</p>
                  </div>
                  <div className="row-end">
                    <StatusBadge status={target.lastStatus} />
                    <small>{target.lastError ?? target.lastDeployedImage ?? "Review target"}</small>
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
      </section>

      <section className="content-grid three-up">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recent runs</p>
              <h3>Execution history</h3>
            </div>
            <Link className="text-link" to="/runs">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="stack-list">
            {overview.recentRuns.map((run) => (
              <Link className="list-row" key={run.id} to={`/runs?run=${run.id}`}>
                <div>
                  <strong>{run.projectName}</strong>
                  <p>
                    {run.source} · {run.branch} · {shortSha(run.commitSha)}
                  </p>
                </div>
                <div className="row-end">
                  <StatusBadge status={run.status} />
                  <small>{formatRelativeTime(run.queuedAt)}</small>
                </div>
              </Link>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recent deployments</p>
              <h3>Revision movement</h3>
            </div>
            <Link className="text-link" to="/deployments">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="stack-list">
            {overview.recentDeployments.map((revision) => (
              <Link
                className="list-row"
                key={revision.id}
                to={`/deployments?target=${revision.targetId}`}
              >
                <div>
                  <strong>{revision.projectName}</strong>
                  <p>{revision.targetName}</p>
                </div>
                <div className="row-end">
                  <StatusBadge status={revision.status} />
                  <small>{formatDateTime(revision.deployedAt)}</small>
                </div>
              </Link>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recent activity</p>
              <h3>Control-plane feed</h3>
            </div>
            <Link className="text-link" to="/activity">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="stack-list">
            {overview.recentActivity.map((event) => (
              <Link className="list-row" key={event.id} to={activityLink(event)}>
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.description}</p>
                </div>
                <div className="row-end">
                  <StatusBadge status={event.status} tone="subtle" />
                  <small>{formatRelativeTime(event.occurredAt)}</small>
                </div>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function MetricCard(props: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div className={`metric-card tone-${props.tone ?? "default"}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
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
