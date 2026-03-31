import { describe, expect, it } from "vitest";

import { canTransitionRunStatus, finalStageStatusFromRun } from "./run-state.js";

describe("run state helpers", () => {
  it("allows only valid transitions", () => {
    expect(canTransitionRunStatus("queued", "running")).toBe(true);
    expect(canTransitionRunStatus("running", "queued")).toBe(false);
  });

  it("maps final run status to a stage status", () => {
    expect(finalStageStatusFromRun("succeeded")).toBe("succeeded");
    expect(finalStageStatusFromRun("failed")).toBe("failed");
    expect(finalStageStatusFromRun("superseded")).toBe("skipped");
  });
});
