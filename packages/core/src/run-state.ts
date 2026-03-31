import type { RunStatus, StageStatus } from "./types.js";

const allowedRunTransitions: Record<RunStatus, RunStatus[]> = {
  queued: ["running", "cancelled", "superseded"],
  running: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
  superseded: []
};

export function canTransitionRunStatus(
  current: RunStatus,
  next: RunStatus
): boolean {
  return allowedRunTransitions[current].includes(next);
}

export function finalStageStatusFromRun(status: RunStatus): StageStatus {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
    case "superseded":
      return "skipped";
    default:
      return "pending";
  }
}

