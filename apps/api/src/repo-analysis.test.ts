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
      hasRootIndexHtml: false,
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

  it("uses pnpm build for pnpm-managed Next.js repos", () => {
    const result = analyzeRepository({
      repository: baseRepository,
      packageJson: JSON.stringify({
        packageManager: "pnpm@9.0.0",
        scripts: {
          build: "next build",
          start: "next start"
        },
        dependencies: {
          next: "15.0.0",
          react: "19.0.0"
        }
      }),
      hasRootIndexHtml: false,
      hasPnpmWorkspace: false,
      hasTurboJson: false,
      hasNxJson: false,
      hasPackageLock: false,
      hasPnpmLock: true,
      hasYarnLock: false
    });

    expect(result.packageManager).toBe("pnpm");
    expect(result.managedConfig?.buildCommand).toBe("pnpm build");
    expect(result.managedConfig?.packageManagerVersion).toBe("9.0.0");
    expect(result.managedConfig?.installCommand).toBe("pnpm install --frozen-lockfile");
  });

  it("does not force a frozen pnpm install when the lockfile is absent", () => {
    const result = analyzeRepository({
      repository: baseRepository,
      packageJson: JSON.stringify({
        packageManager: "pnpm@9.0.0",
        scripts: {
          build: "next build",
          start: "next start"
        },
        dependencies: {
          next: "15.0.0",
          react: "19.0.0"
        }
      }),
      hasRootIndexHtml: false,
      hasPnpmWorkspace: false,
      hasTurboJson: false,
      hasNxJson: false,
      hasPackageLock: false,
      hasPnpmLock: false,
      hasYarnLock: false
    });

    expect(result.packageManager).toBe("pnpm");
    expect(result.managedConfig?.installCommand).toBe("pnpm install");
  });

  it("marks a standalone React repo as deployable", () => {
    const result = analyzeRepository({
      repository: baseRepository,
      packageJson: JSON.stringify({
        scripts: {
          build: "vite build"
        },
        dependencies: {
          react: "19.0.0",
          "react-dom": "19.0.0"
        },
        devDependencies: {
          vite: "6.0.0"
        }
      }),
      hasRootIndexHtml: true,
      hasPnpmWorkspace: false,
      hasTurboJson: false,
      hasNxJson: false,
      hasPackageLock: false,
      hasPnpmLock: true,
      hasYarnLock: false
    });

    expect(result.deployabilityStatus).toBe("deployable");
    expect(result.detectedFramework).toBe("react");
    expect(result.managedConfig?.outputDirectory).toBe("dist");
    expect(result.managedConfig?.outputPort).toBe(80);
  });

  it("marks a standalone Vue repo as deployable", () => {
    const result = analyzeRepository({
      repository: baseRepository,
      packageJson: JSON.stringify({
        scripts: {
          build: "vite build"
        },
        dependencies: {
          vue: "3.5.0"
        },
        devDependencies: {
          vite: "6.0.0"
        }
      }),
      hasRootIndexHtml: true,
      hasPnpmWorkspace: false,
      hasTurboJson: false,
      hasNxJson: false,
      hasPackageLock: false,
      hasPnpmLock: false,
      hasYarnLock: true
    });

    expect(result.deployabilityStatus).toBe("deployable");
    expect(result.detectedFramework).toBe("vue");
    expect(result.managedConfig?.outputDirectory).toBe("dist");
    expect(result.managedConfig?.outputPort).toBe(80);
  });

  it("marks a standalone Astro repo as deployable", () => {
    const result = analyzeRepository({
      repository: baseRepository,
      packageJson: JSON.stringify({
        scripts: {
          build: "astro build"
        },
        dependencies: {
          astro: "5.0.0"
        }
      }),
      hasRootIndexHtml: true,
      hasPnpmWorkspace: false,
      hasTurboJson: false,
      hasNxJson: false,
      hasPackageLock: true,
      hasPnpmLock: false,
      hasYarnLock: false
    });

    expect(result.deployabilityStatus).toBe("deployable");
    expect(result.detectedFramework).toBe("astro");
    expect(result.managedConfig?.buildCommand).toBe("npm run build");
    expect(result.managedConfig?.outputDirectory).toBe("dist");
  });

  it("marks a standalone Nuxt repo as deployable", () => {
    const result = analyzeRepository({
      repository: baseRepository,
      packageJson: JSON.stringify({
        scripts: {
          build: "nuxt build",
          start: "node .output/server/index.mjs"
        },
        dependencies: {
          nuxt: "3.15.0"
        }
      }),
      hasRootIndexHtml: false,
      hasPnpmWorkspace: false,
      hasTurboJson: false,
      hasNxJson: false,
      hasPackageLock: true,
      hasPnpmLock: false,
      hasYarnLock: false
    });

    expect(result.deployabilityStatus).toBe("deployable");
    expect(result.detectedFramework).toBe("nuxt");
    expect(result.managedConfig?.startCommand).toBe("npm run start");
    expect(result.managedConfig?.outputDirectory).toBe(".output");
  });

  it("marks an Express repo as deployable", () => {
    const result = analyzeRepository({
      repository: baseRepository,
      packageJson: JSON.stringify({
        scripts: {
          build: "tsc -p tsconfig.json",
          start: "node dist/index.js"
        },
        dependencies: {
          express: "5.0.0"
        }
      }),
      hasRootIndexHtml: false,
      hasPnpmWorkspace: false,
      hasTurboJson: false,
      hasNxJson: false,
      hasPackageLock: false,
      hasPnpmLock: true,
      hasYarnLock: false
    });

    expect(result.deployabilityStatus).toBe("deployable");
    expect(result.detectedFramework).toBe("express");
    expect(result.managedConfig?.buildCommand).toBe("pnpm build");
    expect(result.managedConfig?.startCommand).toBe("pnpm start");
    expect(result.managedConfig?.outputPort).toBe(3000);
  });

  it("marks a NestJS repo as deployable", () => {
    const result = analyzeRepository({
      repository: baseRepository,
      packageJson: JSON.stringify({
        scripts: {
          build: "nest build",
          start: "node dist/main.js"
        },
        dependencies: {
          "@nestjs/core": "11.0.0"
        }
      }),
      hasRootIndexHtml: false,
      hasPnpmWorkspace: false,
      hasTurboJson: false,
      hasNxJson: false,
      hasPackageLock: false,
      hasPnpmLock: false,
      hasYarnLock: true
    });

    expect(result.deployabilityStatus).toBe("deployable");
    expect(result.detectedFramework).toBe("nestjs");
    expect(result.packageManager).toBe("yarn");
    expect(result.managedConfig?.startCommand).toBe("yarn start");
  });

  it("supports standard root HTML projects without package.json", () => {
    const result = analyzeRepository({
      repository: baseRepository,
      packageJson: null,
      hasRootIndexHtml: true,
      hasPnpmWorkspace: false,
      hasTurboJson: false,
      hasNxJson: false,
      hasPackageLock: false,
      hasPnpmLock: false,
      hasYarnLock: false
    });

    expect(result.deployabilityStatus).toBe("deployable");
    expect(result.detectedFramework).toBe("static_html");
    expect(result.packageManager).toBeNull();
    expect(result.managedConfig?.buildCommand).toBeNull();
    expect(result.managedConfig?.outputPort).toBe(80);
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
      hasRootIndexHtml: false,
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
      hasRootIndexHtml: false,
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

  it("rejects repos without supported managed frameworks", () => {
    const result = analyzeRepository({
      repository: baseRepository,
      packageJson: JSON.stringify({
        scripts: {
          build: "tsup",
          start: "node dist/index.js"
        },
        dependencies: {
          hono: "4.0.0"
        }
      }),
      hasRootIndexHtml: false,
      hasPnpmWorkspace: false,
      hasTurboJson: false,
      hasNxJson: false,
      hasPackageLock: false,
      hasPnpmLock: false,
      hasYarnLock: false
    });

    expect(result.deployabilityStatus).toBe("unsupported");
    expect(result.deployabilityReason).toContain("Next.js, Nuxt, React, Vue, Astro, Express, NestJS");
  });
});
