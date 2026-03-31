import type { DeploymentRevisionSummary } from "./types.js";

export function selectRollbackRevision(
  revisions: DeploymentRevisionSummary[],
  currentRevisionId?: string
): DeploymentRevisionSummary | null {
  const candidates = revisions
    .filter((revision) => revision.status === "succeeded")
    .filter((revision) => revision.id !== currentRevisionId)
    .sort((left, right) => right.deployedAt.localeCompare(left.deployedAt));
  return candidates[0] ?? null;
}

