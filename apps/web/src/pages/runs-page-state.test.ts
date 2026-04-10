import { describe, expect, it } from "vitest";
import type { PipelineRunSummary } from "@autoops/core";

import { buildRunSearchParams, resolveSelectedRun } from "./runs-page-state";

const runs: PipelineRunSummary[] = [
  {
    id: "run-1",
    projectId: "project-1",
    projectName: "Storefront",
    source: "push",
    branch: "main",
    commitSha: "1111111111111111111111111111111111111111",
    status: "failed",
    queuedAt: "2026-03-31T08:00:00.000Z",
    startedAt: "2026-03-31T08:00:10.000Z",
    finishedAt: "2026-03-31T08:01:00.000Z",
    triggeredBy: "alice",
    errorMessage: "Build failed"
  },
  {
    id: "run-2",
    projectId: "project-2",
    projectName: "Marketing Site",
    source: "push",
    branch: "release",
    commitSha: "2222222222222222222222222222222222222222",
    status: "running",
    queuedAt: "2026-03-31T09:00:00.000Z",
    startedAt: "2026-03-31T09:00:05.000Z",
    finishedAt: null,
    triggeredBy: "bob",
    errorMessage: null
  }
];

describe("runs page state", () => {
  it("falls back to the first selectable run when the requested run is stale", () => {
    expect(resolveSelectedRun(runs, runs, "missing-run")?.id).toBe("run-1");
  });

  it("keeps the requested run when it is still selectable", () => {
    expect(resolveSelectedRun(runs, runs, "run-2")?.id).toBe("run-2");
  });

  it("clears the run query when there is no selection", () => {
    expect(buildRunSearchParams("run=run-1&status=failed", null).toString()).toBe("status=failed");
  });

  it("replaces a stale run query with the repaired selection", () => {
    expect(buildRunSearchParams("run=missing-run", "run-2").toString()).toBe("run=run-2");
  });
});
