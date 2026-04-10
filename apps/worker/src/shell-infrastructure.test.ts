import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ShellExecutionInfrastructure } from "./shell-infrastructure.js";

describe("ShellExecutionInfrastructure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries transient git clone failures", async () => {
    const baseTempDir = mkdtempSync(join(tmpdir(), "autoops-shell-clone-"));
    const infra = new ShellExecutionInfrastructure();
    const output: string[] = [];
    let cloneAttempts = 0;

    try {
      vi.spyOn(infra as any, "exec").mockImplementation(
        async (...callArgs: any[]) => {
          const [command, args] = callArgs as [string, string[]];
          if (command === "git" && args[0] === "clone") {
            cloneAttempts += 1;
            if (cloneAttempts === 1) {
              throw new Error(
                "fatal: unable to access 'https://github.com/acme/demo.git/': Could not resolve host: github.com"
              );
            }
          }
          return "";
        }
      );

      const workdir = await infra.cloneRepository({
        owner: "acme",
        repo: "demo",
        commitSha: "abcdef1234567890",
        token: "installation-token",
        baseTempDir,
        onOutput: (line) => {
          output.push(line);
        }
      });

      expect(workdir).toContain(baseTempDir);
      expect(cloneAttempts).toBe(2);
      expect(output).toContain(
        "git clone acme/demo hit a transient git/network error. Retrying (2/3)..."
      );
    } finally {
      rmSync(baseTempDir, { recursive: true, force: true });
    }
  }, 10000);

  it("retries transient git fetch failures without recloning", async () => {
    const baseTempDir = mkdtempSync(join(tmpdir(), "autoops-shell-fetch-"));
    const infra = new ShellExecutionInfrastructure();
    const output: string[] = [];
    let cloneAttempts = 0;
    let fetchAttempts = 0;

    try {
      vi.spyOn(infra as any, "exec").mockImplementation(
        async (...callArgs: any[]) => {
          const [command, args] = callArgs as [string, string[]];
          if (command !== "git") {
            return "";
          }

          if (args[0] === "clone") {
            cloneAttempts += 1;
            return "";
          }

          if (args.includes("fetch")) {
            fetchAttempts += 1;
            if (fetchAttempts === 1) {
              throw new Error("fatal: unable to access 'https://github.com/acme/demo.git/': failed to connect to github.com");
            }
          }

          return "";
        }
      );

      await infra.cloneRepository({
        owner: "acme",
        repo: "demo",
        commitSha: "abcdef1234567890",
        token: "installation-token",
        baseTempDir,
        onOutput: (line) => {
          output.push(line);
        }
      });

      expect(cloneAttempts).toBe(1);
      expect(fetchAttempts).toBe(2);
      expect(output).toContain(
        "git fetch acme/demo@abcdef123456 hit a transient git/network error. Retrying (2/3)..."
      );
    } finally {
      rmSync(baseTempDir, { recursive: true, force: true });
    }
  }, 10000);
});
