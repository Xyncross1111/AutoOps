import { describe, expect, it } from "vitest";

import { analyzeRepository } from "./repo-analysis.js";

const baseRepository = {
  isArchived: false
};

describe("analyzeRepository", () => {
  it("marks a standalone Next.js repo as deployable", () => {
    const result = analyzeRepository({
      repository: baseRepository,
      packageJson: JSON.stringify({
        scripts: {
          build: "next build",
          start: "next start"
        },
        dependencies: {
          next: "15.0.0",
          react: "19.0.0"
        }
      }),
      hasPnpmWorkspace: false,
      hasTurboJson: false,
      hasNxJson: false,
      hasPackageLock: true,
      hasPnpmLock: false,
      hasYarnLock: false
    });

    expect(result.deployabilityStatus).toBe("deployable");
    expect(result.packageManager).toBe("npm");
    expect(result.managedConfig?.buildCommand).toBe("npm run build");
  });

  it("rejects workspace repositories", () => {
    const result = analyzeRepository({
      repository: baseRepository,
      packageJson: JSON.stringify({
        workspaces: ["apps/*"],
        scripts: {
          build: "next build",
          start: "next start"
        },
        dependencies: {
          next: "15.0.0"
        }
      }),
      hasPnpmWorkspace: false,
      hasTurboJson: false,
      hasNxJson: false,
      hasPackageLock: false,
      hasPnpmLock: true,
      hasYarnLock: false
    });

    expect(result.deployabilityStatus).toBe("unsupported");
    expect(result.deployabilityReason).toContain("Monorepos");
  });

  it("rejects repos without standard build and start scripts", () => {
    const result = analyzeRepository({
      repository: baseRepository,
      packageJson: JSON.stringify({
        scripts: {
          dev: "next dev"
        },
        dependencies: {
          next: "15.0.0"
        }
      }),
      hasPnpmWorkspace: false,
      hasTurboJson: false,
      hasNxJson: false,
      hasPackageLock: false,
      hasPnpmLock: false,
      hasYarnLock: true
    });

    expect(result.deployabilityStatus).toBe("unsupported");
    expect(result.deployabilityReason).toContain("build and start scripts");
  });
});
