import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ListFilter, RotateCcw, Search, TerminalSquare } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type { PipelineRunSummary, ProjectSummary, RunSource, RunStatus } from "@autoops/core";

import { useAppSession } from "../app-context";
import { LogViewer } from "../components/LogViewer";
import { MetaList } from "../components/MetaList";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { Toolbar } from "../components/Toolbar";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import { useRunStream } from "../hooks/useRunStream";
import { listProjects, listRuns, rerunRun } from "../lib/api";
import {
  formatDateTime,
  formatDuration,
  formatRelativeTime,
  shortSha,
  titleCase
} from "../lib/format";
import { buildRunSearchParams, resolveSelectedRun } from "./runs-page-state";

const RUN_STATUSES: Array<RunStatus | "all"> = [
  "all",
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "superseded"
];

const RUN_SOURCES: Array<RunSource | "all"> = [
  "all",
  "push",
  "rerun",
  "manual_deploy",
  "manual_rollback"
];

type RunInspectorTab = "summary" | "timeline" | "logs" | "metadata";

const tabs: Array<{ value: RunInspectorTab; label: string }> = [
  { value: "summary", label: "Summary" },
  { value: "timeline", label: "Timeline" },
  { value: "logs", label: "Logs" },
  { value: "metadata", label: "Metadata" }
];

export function RunsPage() {
  const { token, refreshNonce, refreshApp } = useAppSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [runs, setRuns] = useState<PipelineRunSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isRerunning, setIsRerunning] = useState(false);

  const search = searchParams.get("search") ?? "";
  const projectFilter = searchParams.get("project") ?? "all";
  const statusFilter = (searchParams.get("status") as RunStatus | "all" | null) ?? "all";
  const sourceFilter = (searchParams.get("source") as RunSource | "all" | null) ?? "all";
  const selectedTab = (searchParams.get("tab") as RunInspectorTab | null) ?? "summary";
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const selectedRunId = searchParams.get("run");
  const searchParamsText = searchParams.toString();

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    void Promise.all([listRuns(token, { limit: 150 }), listProjects(token)])
      .then(([runsResponse, projectsResponse]) => {
        if (!active) {
          return;
        }

        setRuns(runsResponse.runs);
        setProjects(projectsResponse.projects);
      })
      .catch((caughtError) => {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : "Failed to load runs");
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

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      if (projectFilter !== "all" && run.projectId !== projectFilter) {
        return false;
      }
      if (statusFilter !== "all" && run.status !== statusFilter) {
        return false;
      }
      if (sourceFilter !== "all" && run.source !== sourceFilter) {
        return false;
      }
      if (!deferredSearch) {
        return true;
      }

      return [
        run.projectName,
        run.branch,
        run.commitSha,
        run.triggeredBy,
        run.source,
        run.errorMessage ?? ""
      ]
        .join(" ")
        .toLowerCase()
        .includes(deferredSearch);
    });
  }, [deferredSearch, projectFilter, runs, sourceFilter, statusFilter]);

  const selectedRun = resolveSelectedRun(runs, filteredRuns, selectedRunId);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const nextRunId = selectedRun?.id ?? null;
    const nextSearchParams = buildRunSearchParams(searchParamsText, nextRunId);

    if (nextSearchParams.toString() === searchParamsText) {
      return;
    }

    setSearchParams(nextSearchParams, { replace: true });
  }, [isLoading, searchParamsText, selectedRun?.id, setSearchParams]);

  const stream = useRunStream(token, selectedRun?.id ?? null, (updatedRun) => {
    setRuns((current) => current.map((run) => (run.id === updatedRun.id ? updatedRun : run)));
  });

  const detailRun = stream.detail?.run ?? selectedRun ?? null;

  async function handleRerun() {
    if (!selectedRun) {
      return;
    }

    setIsRerunning(true);
    try {
      await rerunRun(token, selectedRun.id);
      refreshApp();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to rerun run");
    } finally {
      setIsRerunning(false);
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
    return <LoadingBlock label="Loading runs..." />;
  }

  return (
    <div className="ao-page ao-runs">
      <PageHeader
        eyebrow="Operations / Run triage"
        title="Runs"
        description="Filter, inspect, and rerun execution history from a single master-detail workspace."
        meta={
          <div className="ao-inline-meta">
            <span className="ao-chip">{filteredRuns.length} visible runs</span>
            {selectedRun ? <span className="ao-chip ao-chip--accent">{selectedRun.projectName}</span> : null}
          </div>
        }
      />

      {error ? <InlineError message={error} /> : null}

      <section
        className={`ao-split ao-split--two${
          selectedTab === "logs" ? " ao-split--two-log-focus" : ""
        }`}
      >
        <div className="ao-split__pane">
          <article className="ao-panel">
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Run ledger</p>
                <h2>Execution history</h2>
              </div>
              <ListFilter size={18} />
            </div>

            <Toolbar sticky>
              <label className="ao-search-input">
                <Search size={14} />
                <input
                  value={search}
                  onChange={(event) => updateParams({ search: event.target.value })}
                  placeholder="Search by project, branch, sha, actor, or error"
                />
              </label>

              <select value={projectFilter} onChange={(event) => updateParams({ project: event.target.value })}>
                <option value="all">All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>

              <select value={statusFilter} onChange={(event) => updateParams({ status: event.target.value })}>
                {RUN_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </select>

              <select value={sourceFilter} onChange={(event) => updateParams({ source: event.target.value })}>
                {RUN_SOURCES.map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </select>
            </Toolbar>

            {filteredRuns.length > 0 ? (
              <div className="ao-ledger ao-run-list">
                {filteredRuns.map((run) => (
                  <button
                    className={`ao-ledger__row${selectedRun?.id === run.id ? " is-selected" : ""}`}
                    key={run.id}
                    type="button"
                    onClick={() => updateParams({ run: run.id })}
                  >
                    <div className="ao-stack ao-stack--sm">
                      <strong>{run.projectName}</strong>
                      <div className="ao-ledger__meta">
                        <span className="ao-mono">{run.branch}</span>
                        <span className="ao-mono">{shortSha(run.commitSha)}</span>
                        <span>{titleCase(run.source)}</span>
                      </div>
                      <span className="ao-table__secondary">
                        {run.triggeredBy}
                        {run.errorMessage ? ` • ${summarizeRunError(run.errorMessage)}` : ""}
                      </span>
                    </div>
                    <div className="ao-stack ao-stack--sm">
                      <StatusBadge status={run.status} tone="subtle" />
                      <span className="ao-table__secondary ao-mono">
                        {formatDuration(run.startedAt ?? run.queuedAt, run.finishedAt)}
                      </span>
                      <span className="ao-table__secondary ao-mono">
                        {formatRelativeTime(run.startedAt ?? run.queuedAt)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No runs match the current filters"
                description="Adjust the search or filter set to widen the result list."
              />
            )}
          </article>
        </div>

        <div className="ao-split__pane">
          <article
            className={`ao-panel ao-inspector${
              selectedTab === "logs" ? " ao-inspector--logs" : ""
            }`}
          >
            <div className="ao-section-header">
              <div className="ao-section-header__copy">
                <p className="ao-section-header__eyebrow">Inspector</p>
                <h2>{selectedRun ? selectedRun.projectName : "Select a run"}</h2>
                {selectedRun ? (
                  <p className="ao-mono">
                    {selectedRun.branch} • {shortSha(selectedRun.commitSha)}
                  </p>
                ) : null}
              </div>
              {selectedRun ? (
                <button className="ao-button ao-button--secondary" onClick={handleRerun} disabled={isRerunning}>
                  <RotateCcw size={16} />
                  <span>{isRerunning ? "Queueing..." : "Rerun"}</span>
                </button>
              ) : null}
            </div>

            {!selectedRun ? (
              <EmptyState
                title="Choose a run"
                description="Select any run from the left column to inspect stages, logs, and metadata."
              />
            ) : stream.isLoading && !stream.detail ? (
              <LoadingBlock label="Loading run detail..." />
            ) : stream.error && !stream.detail ? (
              <InlineError message={stream.error} />
            ) : detailRun && stream.detail ? (
              <>
                <div className="ao-tabs" role="tablist" aria-label="Run inspector tabs">
                  {tabs.map((tab) => (
                    <button
                      key={tab.value}
                      className={`ao-tab${selectedTab === tab.value ? " is-active" : ""}`}
                      type="button"
                      onClick={() => updateParams({ tab: tab.value })}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {selectedTab === "summary" ? (
                  <MetaList
                    items={[
                      { label: "Status", value: <StatusBadge status={detailRun.status} /> },
                      { label: "Source", value: titleCase(detailRun.source), mono: true },
                      { label: "Branch", value: detailRun.branch, mono: true },
                      { label: "Commit", value: detailRun.commitSha, mono: true },
                      { label: "Triggered by", value: detailRun.triggeredBy },
                      { label: "Queued", value: formatDateTime(detailRun.queuedAt), mono: true },
                      {
                        label: "Started",
                        value: formatDateTime(detailRun.startedAt ?? detailRun.queuedAt),
                        mono: true
                      },
                      {
                        label: "Duration",
                        value: formatDuration(detailRun.startedAt ?? detailRun.queuedAt, detailRun.finishedAt),
                        mono: true
                      }
                    ]}
                  />
                ) : null}

                {selectedTab === "timeline" ? (
                  <div className="ao-timeline">
                    {stream.detail.stages.map((stage) => (
                      <div className="ao-timeline__item" key={stage.id}>
                        <div className="ao-timeline__row">
                          <strong>{stage.stageName}</strong>
                          <StatusBadge status={stage.status} tone="subtle" />
                        </div>
                        <div className="ao-ledger__meta">
                          <span className="ao-mono">
                            {stage.startedAt ? formatDateTime(stage.startedAt) : "Not started"}
                          </span>
                          <span className="ao-mono">
                            {formatDuration(stage.startedAt, stage.finishedAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {selectedTab === "logs" ? (
                  <>
                    {stream.error ? <InlineError message={stream.error} /> : null}
                    <LogViewer
                      entries={stream.logs}
                      emptyMessage="Log output will appear here as the run progresses."
                      streamKey={detailRun.id}
                    />
                  </>
                ) : null}

                {selectedTab === "metadata" ? (
                  <article className="ao-panel ao-panel--inset">
                    <div className="ao-section-header">
                      <div className="ao-section-header__copy">
                        <p className="ao-section-header__eyebrow">Metadata</p>
                        <h3>Execution context</h3>
                      </div>
                      <TerminalSquare size={18} />
                    </div>
                    <dl className="ao-kv">
                      <div className="ao-kv__row">
                        <dt>Run ID</dt>
                        <dd className="ao-mono">{detailRun.id}</dd>
                      </div>
                      <div className="ao-kv__row">
                        <dt>Project ID</dt>
                        <dd className="ao-mono">{detailRun.projectId}</dd>
                      </div>
                      <div className="ao-kv__row">
                        <dt>Queued</dt>
                        <dd className="ao-mono">{formatDateTime(detailRun.queuedAt)}</dd>
                      </div>
                      <div className="ao-kv__row">
                        <dt>Started</dt>
                        <dd className="ao-mono">{formatDateTime(detailRun.startedAt)}</dd>
                      </div>
                      <div className="ao-kv__row">
                        <dt>Finished</dt>
                        <dd className="ao-mono">{formatDateTime(detailRun.finishedAt)}</dd>
                      </div>
                    </dl>
                  </article>
                ) : null}
              </>
            ) : (
              <EmptyState
                title="Run detail unavailable"
                description="AutoOps could not load the selected run detail."
              />
            )}
          </article>
        </div>
      </section>
    </div>
  );
}

function summarizeRunError(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 160) {
    return normalized;
  }

  return `${normalized.slice(0, 157)}...`;
}
