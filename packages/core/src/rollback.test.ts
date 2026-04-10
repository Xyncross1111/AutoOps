import { describe, expect, it } from "vitest";

import { selectRollbackRevision } from "./rollback.js";

describe("rollback selection", () => {
  it("picks the newest successful revision", () => {
    const revision = selectRollbackRevision([
      {
        id: "r1",
        targetId: "t1",
        targetName: "prod",
        projectId: "p1",
        projectName: "demo",
        runId: "run1",
        runSource: "push",
        imageRef: "ghcr.io/demo/app",
        imageDigest: "sha256:111",
        status: "succeeded",
        deployedAt: "2026-03-31T10:00:00.000Z",
        rollbackOfRevisionId: null,
        promotedFromRevisionId: null,
        promotedFromTargetId: null,
        promotedFromTargetName: null,
        promotionApprovalId: null,
        promotionApprovalStatus: null
      },
      {
        id: "r2",
        targetId: "t1",
        targetName: "prod",
        projectId: "p1",
        projectName: "demo",
        runId: "run2",
        runSource: "push",
        imageRef: "ghcr.io/demo/app",
        imageDigest: "sha256:222",
        status: "failed",
        deployedAt: "2026-03-31T11:00:00.000Z",
        rollbackOfRevisionId: null,
        promotedFromRevisionId: null,
        promotedFromTargetId: null,
        promotedFromTargetName: null,
        promotionApprovalId: null,
        promotionApprovalStatus: null
      },
      {
        id: "r3",
        targetId: "t1",
        targetName: "prod",
        projectId: "p1",
        projectName: "demo",
        runId: "run3",
        runSource: "push",
        imageRef: "ghcr.io/demo/app",
        imageDigest: "sha256:333",
        status: "succeeded",
        deployedAt: "2026-03-31T12:00:00.000Z",
        rollbackOfRevisionId: null,
        promotedFromRevisionId: null,
        promotedFromTargetId: null,
        promotedFromTargetName: null,
        promotionApprovalId: null,
        promotionApprovalStatus: null
      }
    ]);

    expect(revision?.id).toBe("r3");
  });
});
