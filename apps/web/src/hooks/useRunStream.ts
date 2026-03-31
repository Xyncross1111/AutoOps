import { useEffect, useEffectEvent, useState } from "react";
import type { PipelineRunSummary, RunLogEntry, StageRun } from "@autoops/core";

import { buildRunStreamUrl, getRun } from "../lib/api";

interface RunDetailState {
  run: PipelineRunSummary;
  stages: StageRun[];
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

  const handleRunUpdate = useEffectEvent((run: PipelineRunSummary) => {
    onRunUpdate(run);
    setDetail((current) => (current ? { ...current, run } : current));
  });

  useEffect(() => {
    if (!runId) {
      setDetail(null);
      setLogs([]);
      setError("");
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const source = new EventSource(buildRunStreamUrl(runId, token));

    setIsLoading(true);
    setError("");
    setLogs([]);

    void getRun(token, runId)
      .then((nextDetail) => {
        if (cancelled) {
          return;
        }
        setDetail({
          run: nextDetail.run,
          stages: nextDetail.stages
        });
        setLogs(nextDetail.logs);
      })
      .catch((caughtError: unknown) => {
        if (cancelled) {
          return;
        }
        setError(caughtError instanceof Error ? caughtError.message : "Failed to load run");
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

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
      if (!cancelled) {
        setError("Live stream disconnected. Refresh to reconnect.");
      }
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, [handleRunUpdate, runId, token]);

  return {
    detail,
    logs,
    isLoading,
    error
  };
}
