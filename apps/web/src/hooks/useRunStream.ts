import { useEffect, useRef, useState } from "react";
import type { PipelineRunSummary, RunLogEntry, RunStatus, StageRun } from "@autoops/core";

import { buildRunStreamUrl, getRun } from "../lib/api";

interface RunDetailState {
  run: PipelineRunSummary;
  stages: StageRun[];
}

function isLiveRunStatus(status: RunStatus) {
  return status === "queued" || status === "running";
}

export function useRunStream(
  token: string,
  runId: string | null,
  onRunUpdate: (run: PipelineRunSummary) => void
) {
  const [detail, setDetail] = useState<RunDetailState | null>(null);
  const [logs, setLogs] = useState<RunLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const onRunUpdateRef = useRef(onRunUpdate);

  useEffect(() => {
    onRunUpdateRef.current = onRunUpdate;
  }, [onRunUpdate]);

  useEffect(() => {
    if (!runId) {
      setDetail(null);
      setLogs([]);
      setError("");
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    let source: EventSource | null = null;
    let latestStatus: RunStatus | null = null;

    const closeSource = () => {
      if (source) {
        source.close();
        source = null;
      }
    };

    const handleRunUpdate = (run: PipelineRunSummary) => {
      latestStatus = run.status;
      onRunUpdateRef.current(run);
      setDetail((current) => (current ? { ...current, run } : current));

      if (!isLiveRunStatus(run.status)) {
        closeSource();
      }
    };

    const connectStream = () => {
      if (source || !latestStatus || !isLiveRunStatus(latestStatus)) {
        return;
      }

      source = new EventSource(buildRunStreamUrl(runId, token));

      source.addEventListener("log", (event) => {
        const parsed = JSON.parse((event as MessageEvent).data) as RunLogEntry;
        setLogs((current) => (
          current.some((entry) => entry.id === parsed.id) ? current : [...current, parsed]
        ));
      });

      source.addEventListener("status", (event) => {
        const parsed = JSON.parse((event as MessageEvent).data) as PipelineRunSummary;
        handleRunUpdate(parsed);
      });

      source.onerror = () => {
        if (!cancelled && isLiveRunStatus(latestStatus ?? "queued")) {
          setError("Live stream disconnected. Refresh to reconnect.");
        }
      };
    };

    setIsLoading(true);
    setDetail(null);
    setError("");
    setLogs([]);

    void getRun(token, runId)
      .then((nextDetail) => {
        if (cancelled) {
          return;
        }
        latestStatus = nextDetail.run.status;
        setDetail({
          run: nextDetail.run,
          stages: nextDetail.stages
        });
        setLogs(nextDetail.logs);
        connectStream();
      })
      .catch((caughtError: unknown) => {
        if (cancelled) {
          return;
        }
        setDetail(null);
        setError(caughtError instanceof Error ? caughtError.message : "Failed to load run");
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      closeSource();
    };
  }, [runId, token]);

  return {
    detail,
    logs,
    isLoading,
    error
  };
}
