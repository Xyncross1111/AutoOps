import { describe, expect, it } from "vitest";

import {
  decryptSecret,
  encryptSecret,
  verifyGitHubSignature
} from "./security.js";

describe("security helpers", () => {
  it("round-trips encrypted secrets", () => {
    const encrypted = encryptSecret("super-secret", "master-key-123");
    expect(decryptSecret(encrypted, "master-key-123")).toBe("super-secret");
  });

  it("validates GitHub webhook signatures", async () => {
    const body = JSON.stringify({ hello: "world" });
    const { createHmac } = await import("node:crypto");
    const digest = createHmac("sha256", "webhook-secret").update(body).digest("hex");
    expect(
      verifyGitHubSignature(body, `sha256=${digest}`, "webhook-secret")
    ).toBe(true);
    expect(
      verifyGitHubSignature(body, `sha256=${digest}`, "wrong-secret")
    ).toBe(false);
  });
});

