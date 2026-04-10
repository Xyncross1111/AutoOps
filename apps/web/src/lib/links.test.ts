import { describe, expect, it } from "vitest";

import { formatExternalUrlLabel, normalizeExternalUrl } from "./links";

describe("links", () => {
  it("keeps fully qualified URLs intact", () => {
    expect(normalizeExternalUrl("http://213.199.63.29:6100")).toBe("http://213.199.63.29:6100");
  });

  it("uses http for local addresses without a scheme", () => {
    expect(normalizeExternalUrl("127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  });

  it("uses https for non-local hosts without a scheme", () => {
    expect(normalizeExternalUrl("autoops.example.com")).toBe("https://autoops.example.com");
  });

  it("formats a clean display label", () => {
    expect(formatExternalUrlLabel("https://autoops.example.com/dashboard")).toBe(
      "autoops.example.com/dashboard"
    );
  });
});
