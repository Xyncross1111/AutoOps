import {
  type ReactNode,
  startTransition,
  useDeferredValue,
  useEffect,
  useState
} from "react";
import { ListFilter, RotateCcw, Search, TerminalSquare } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type { PipelineRunSummary, ProjectSummary, RunSource, RunStatus } from "@autoops/core";

import { useAppSession } from "../app-context";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import { useRunStream } from "../hooks/useRunStream";
import { listProjects, listRuns, rerunRun } from "../lib/api";
import { formatDateTime, formatRelativeTime, shortSha, titleCase } from "../lib/format";

const RUN_STATUSES: Array<RunStatus | "all"> = [
  "all",
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "superseded"
];

const RUN_SOURCES: Array<RunSource | "all"> = ["all", "push", "rerun", "manual_rollback"];

export function RunsPage() {
  const { token, refreshNonce, refreshApp } = useAppSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [runs, setRuns] = useState<PipelineRunSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isRerunning, setIsRerunning] = useState(false);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<RunStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<RunSource | "all">("all");

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const selectedRunId = searchParams.get("run");

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    void Promise.all([
      listRuns(token, { limit: 150 }),
      listProjects(token)
    ])
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

  const filteredRuns = runs.filter((run) => {
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

    const haystack = [
      run.projectName,
      run.branch,
      run.commitSha,
      run.triggeredBy,
      run.source,
      run.errorMessage ?? ""
    ].join(" ").toLowerCase();

    return haystack.includes(deferredSearch);
  });

  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? filteredRuns[0] ?? null;

  useEffect(() => {
    if (!selectedRunId && filteredRuns[0]) {
      startTransition(() => {
        setSearchParams({ run: filteredRuns[0].id }, { replace: true });
      });
    }
  }, [filteredRuns, selectedRunId, setSearchParams]);

  const stream = useRunStream(token, selectedRun?.id ?? null, (updatedRun) => {
    setRuns((current) => current.map((run) => (run.id === updatedRun.id ? updatedRun : run)));
  });

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

  if (isLoading) {
    return <LoadingBlock label="Loading runs..." />;
  }

  return (
    <div className="page-stack">
      {error ? <InlineError message={error} /> : null}

      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Run triage</p>
            <h3>Filter and investigate pipeline history</h3>
          </div>
          <ListFilter size={18} />
        </div>

        <div className="toolbar-grid">
          <label className="toolbar-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by project, branch, sha, actor, or error"
            />
          </label>

          <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="all">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as RunStatus | "all")}
          >
            {RUN_STATUSES.map((value) => (
              <option key={value} value={value}>
                {titleCase(value)}
              </option>
            ))}
          </select>

          <select
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value as RunSource | "all")}
          >
            {RUN_SOURCES.map((value) => (
              <option key={value} value={value}>
                {titleCase(value)}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="content-grid runs-layout">
        <article className="panel-card run-list-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Results</p>
              <h3>{filteredRuns.length} runs</h3>
            </div>
          </div>

          {filteredRuns.length > 0 ? (
            <div className="stack-list">
              {filteredRuns.map((run) => (
                <button
                  type="button"
                  className={`run-list-item${selectedRun?.id === run.id ? " selected" : ""}`}
                  key={run.id}
                  onClick={() => {
                    startTransition(() => {
                      setSearchParams({ run: run.id });
                    });
                  }}
                >
                  <div className="row-spread">
                    <strong>{run.projectName}</strong>
                    <StatusBadge status={run.status} />
                  </div>
                  <p>
                    {run.branch} · {titleCase(run.source)}
                  </p>
                  <div className="row-spread">
                    <small>{shortSha(run.commitSha)}</small>
                    <small>{formatRelativeTime(run.queuedAt)}</small>
                  </div>
                  <small>{run.triggeredBy}</small>
                  {run.errorMessage ? <small>{run.errorMessage}</small> : null}
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

        <article className="panel-card run-detail-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Run detail</p>
              <h3>{selectedRun ? selectedRun.projectName : "Select a run"}</h3>
            </div>
            {selectedRun ? (
              <button onClick={handleRerun} disabled={isRerunning}>
                <RotateCcw size={16} />
                <span>{isRerunning ? "Queueing..." : "Rerun"}</span>
              </button>
            ) : null}
          </div>

          {!selectedRun ? (
            <EmptyState
              title="Choose a run"
              description="Select any run from the left column to inspect stages and live logs."
            />
          ) : stream.isLoading && !stream.detail ? (
            <LoadingBlock label="Loading run detail..." />
          ) : stream.error && !stream.detail ? (
            <InlineError message={stream.error} />
          ) : stream.detail ? (
            <div className="detail-stack">
              <div className="meta-grid">
                <MetaItem label="Status" value={<StatusBadge status={stream.detail.run.status} />} />
                <MetaItem label="Source" value={titleCase(stream.detail.run.source)} />
                <MetaItem label="Branch" value={stream.detail.run.branch} />
                <MetaItem label="Commit" value={<code>{stream.detail.run.commitSha}</code>} />
                <MetaItem label="Triggered By" value={stream.detail.run.triggeredBy} />
                <MetaItem
                  label="Started"
                  value={formatDateTime(stream.detail.run.startedAt ?? stream.detail.run.queuedAt)}
                />
                <MetaItem
                  label="Finished"
                  value={formatDateTime(stream.detail.run.finishedAt)}
                />
              </div>

              <div className="timeline-grid">
                {stream.detail.stages.map((stage) => (
                  <div className="timeline-stage" key={stage.id}>
                    <div className="row-spread">
                      <strong>{stage.stageName}</strong>
                      <StatusBadge status={stage.status} tone="subtle" />
                    </div>
                    <small>
                      {stage.startedAt ? formatRelativeTime(stage.startedAt) : "Not started"}
                    </small>
                  </div>
                ))}
              </div>

              <div className="terminal-card">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Live output</p>
                    <h3>Execution log</h3>
                  </div>
                  <TerminalSquare size={18} />
                </div>

                {stream.error ? <InlineError message={stream.error} /> : null}

                <div className="log-panel">
                  {stream.logs.length > 0 ? (
                    stream.logs.map((entry) => (
                      <div className="log-line" key={entry.id}>
                        <span>{entry.stageName}</span>
                        <span>{entry.message}</span>
                      </div>
                    ))
                  ) : (
                    <div className="log-empty">Log output will appear here as the run progresses.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Run detail unavailable"
              description="AutoOps could not load the selected run detail."
            />
          )}
        </article>
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
