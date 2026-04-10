import type { PipelineRunSummary } from "@autoops/core";

export function resolveSelectedRun(
  runs: PipelineRunSummary[],
  filteredRuns: PipelineRunSummary[],
  requestedRunId: string | null
) {
  const selectableRuns = filteredRuns.length > 0 ? filteredRuns : runs;

  if (!requestedRunId) {
    return selectableRuns[0] ?? null;
  }

  return selectableRuns.find((run) => run.id === requestedRunId) ?? selectableRuns[0] ?? null;
}

export function buildRunSearchParams(
  currentSearchParamsText: string,
  selectedRunId: string | null
) {
  const nextSearchParams = new URLSearchParams(currentSearchParamsText);

  if (selectedRunId) {
    nextSearchParams.set("run", selectedRunId);
  } else {
    nextSearchParams.delete("run");
  }

  return nextSearchParams;
}
