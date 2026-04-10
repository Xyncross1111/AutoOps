import type {
  GitHubRepositorySummary,
  ManagedAppConfig,
  ManagedAppFramework,
  ManagedAppPackageManager
} from "@autoops/core";

interface RootPackageJson {
  packageManager?: string;
  workspaces?: unknown;
  scripts?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}

export interface RepositoryAnalysisInput {
  repository: Pick<GitHubRepositorySummary, "isArchived">;
  packageJson: string | null;
  hasRootIndexHtml: boolean;
  hasPnpmWorkspace: boolean;
  hasTurboJson: boolean;
  hasNxJson: boolean;
  hasPackageLock: boolean;
  hasPnpmLock: boolean;
  hasYarnLock: boolean;
}

export interface RepositoryAnalysisResult {
  analysisStatus: "analyzed" | "failed";
  deployabilityStatus: "deployable" | "unsupported" | "archived";
  deployabilityReason: string | null;
  detectedFramework: string | null;
  packageManager: ManagedAppPackageManager | null;
  managedConfig: ManagedAppConfig | null;
}

export function analyzeRepository(input: RepositoryAnalysisInput): RepositoryAnalysisResult {
  if (input.repository.isArchived) {
    return {
      analysisStatus: "analyzed",
      deployabilityStatus: "archived",
      deployabilityReason: "Archived repositories are not eligible for managed deployments.",
      detectedFramework: null,
      packageManager: null,
      managedConfig: null
    };
  }

  if (input.hasPnpmWorkspace || input.hasTurboJson || input.hasNxJson) {
    return unsupported("Monorepos and workspace-based repositories are not supported in v1.");
  }

  if (!input.packageJson) {
    if (input.hasRootIndexHtml) {
      return {
        analysisStatus: "analyzed",
        deployabilityStatus: "deployable",
        deployabilityReason: null,
        detectedFramework: "static_html",
        packageManager: null,
        managedConfig: buildManagedStaticHtmlConfig()
      };
    }

    return unsupported("Missing a root package.json file or root index.html.");
  }

  let parsed: RootPackageJson;
  try {
    parsed = JSON.parse(input.packageJson) as RootPackageJson;
  } catch {
    return {
      analysisStatus: "failed",
      deployabilityStatus: "unsupported",
      deployabilityReason: "Unable to parse the root package.json file.",
      detectedFramework: null,
      packageManager: null,
      managedConfig: null
    };
  }

  if (parsed.workspaces !== undefined) {
    return unsupported("Monorepos and workspace-based repositories are not supported in v1.");
  }

  const dependencies = {
    ...(parsed.dependencies ?? {}),
    ...(parsed.devDependencies ?? {})
  };
  const scripts = parsed.scripts ?? {};
  const hasBuildScript = typeof scripts.build === "string" && scripts.build.trim().length > 0;
  const hasStartScript = typeof scripts.start === "string" && scripts.start.trim().length > 0;

  if (!("next" in dependencies)) {
    if ("nuxt" in dependencies) {
      if (!hasBuildScript || !hasStartScript) {
        return unsupported("Standard build and start scripts are required for managed deployments.");
      }

      const packageManager = detectPackageManager({
        packageManagerField: parsed.packageManager,
        hasPackageLock: input.hasPackageLock,
        hasPnpmLock: input.hasPnpmLock,
        hasYarnLock: input.hasYarnLock
      });
      const packageManagerVersion = detectPackageManagerVersion(parsed.packageManager, packageManager);

      return {
        analysisStatus: "analyzed",
        deployabilityStatus: "deployable",
        deployabilityReason: null,
        detectedFramework: "nuxt",
        packageManager,
        managedConfig: buildManagedNodeServerConfig("nuxt", packageManager, input.hasPackageLock, {
          hasPnpmLock: input.hasPnpmLock,
          hasYarnLock: input.hasYarnLock,
          packageManagerVersion
        })
      };
    }

    if ("react" in dependencies) {
      if (!hasBuildScript) {
        return unsupported("React repositories need a standard root build script.");
      }

      const packageManager = detectPackageManager({
        packageManagerField: parsed.packageManager,
        hasPackageLock: input.hasPackageLock,
        hasPnpmLock: input.hasPnpmLock,
        hasYarnLock: input.hasYarnLock
      });
      const packageManagerVersion = detectPackageManagerVersion(parsed.packageManager, packageManager);
      const reactFlavor = detectReactFlavor({
        buildScript: scripts.build as string,
        dependencies
      });

      return {
        analysisStatus: "analyzed",
        deployabilityStatus: "deployable",
        deployabilityReason: null,
        detectedFramework: reactFlavor,
        packageManager,
        managedConfig: buildManagedReactConfig(
          packageManager,
          input.hasPackageLock,
          reactFlavor === "react_cra" ? "build" : "dist",
          {
            hasPnpmLock: input.hasPnpmLock,
            hasYarnLock: input.hasYarnLock,
            packageManagerVersion
          }
        )
      };
    }

    if ("vue" in dependencies) {
      if (!hasBuildScript) {
        return unsupported("Vue repositories need a standard root build script.");
      }

      const packageManager = detectPackageManager({
        packageManagerField: parsed.packageManager,
        hasPackageLock: input.hasPackageLock,
        hasPnpmLock: input.hasPnpmLock,
        hasYarnLock: input.hasYarnLock
      });
      const packageManagerVersion = detectPackageManagerVersion(parsed.packageManager, packageManager);

      return {
        analysisStatus: "analyzed",
        deployabilityStatus: "deployable",
        deployabilityReason: null,
        detectedFramework: "vue",
        packageManager,
        managedConfig: buildManagedStaticFrameworkConfig(
          "vue",
          packageManager,
          input.hasPackageLock,
          "dist",
          {
            hasPnpmLock: input.hasPnpmLock,
            hasYarnLock: input.hasYarnLock,
            packageManagerVersion
          }
        )
      };
    }

    if ("astro" in dependencies) {
      if (!hasBuildScript) {
        return unsupported("Astro repositories need a standard root build script.");
      }

      const packageManager = detectPackageManager({
        packageManagerField: parsed.packageManager,
        hasPackageLock: input.hasPackageLock,
        hasPnpmLock: input.hasPnpmLock,
        hasYarnLock: input.hasYarnLock
      });
      const packageManagerVersion = detectPackageManagerVersion(parsed.packageManager, packageManager);

      return {
        analysisStatus: "analyzed",
        deployabilityStatus: "deployable",
        deployabilityReason: null,
        detectedFramework: "astro",
        packageManager,
        managedConfig: buildManagedStaticFrameworkConfig(
          "astro",
          packageManager,
          input.hasPackageLock,
          "dist",
          {
            hasPnpmLock: input.hasPnpmLock,
            hasYarnLock: input.hasYarnLock,
            packageManagerVersion
          }
        )
      };
    }

    if ("express" in dependencies) {
      if (!hasBuildScript || !hasStartScript) {
        return unsupported("Standard build and start scripts are required for managed deployments.");
      }

      const packageManager = detectPackageManager({
        packageManagerField: parsed.packageManager,
        hasPackageLock: input.hasPackageLock,
        hasPnpmLock: input.hasPnpmLock,
        hasYarnLock: input.hasYarnLock
      });
      const packageManagerVersion = detectPackageManagerVersion(parsed.packageManager, packageManager);

      return {
        analysisStatus: "analyzed",
        deployabilityStatus: "deployable",
        deployabilityReason: null,
        detectedFramework: "express",
        packageManager,
        managedConfig: buildManagedNodeServerConfig("express", packageManager, input.hasPackageLock, {
          hasPnpmLock: input.hasPnpmLock,
          hasYarnLock: input.hasYarnLock,
          packageManagerVersion
        })
      };
    }

    if ("@nestjs/core" in dependencies) {
      if (!hasBuildScript || !hasStartScript) {
        return unsupported("Standard build and start scripts are required for managed deployments.");
      }

      const packageManager = detectPackageManager({
        packageManagerField: parsed.packageManager,
        hasPackageLock: input.hasPackageLock,
        hasPnpmLock: input.hasPnpmLock,
        hasYarnLock: input.hasYarnLock
      });
      const packageManagerVersion = detectPackageManagerVersion(parsed.packageManager, packageManager);

      return {
        analysisStatus: "analyzed",
        deployabilityStatus: "deployable",
        deployabilityReason: null,
        detectedFramework: "nestjs",
        packageManager,
        managedConfig: buildManagedNodeServerConfig("nestjs", packageManager, input.hasPackageLock, {
          hasPnpmLock: input.hasPnpmLock,
          hasYarnLock: input.hasYarnLock,
          packageManagerVersion
        })
      };
    }

    if (input.hasRootIndexHtml) {
      return {
        analysisStatus: "analyzed",
        deployabilityStatus: "deployable",
        deployabilityReason: null,
        detectedFramework: "static_html",
        packageManager: null,
        managedConfig: buildManagedStaticHtmlConfig()
      };
    }

    return unsupported("Only standalone Next.js, Nuxt, React, Vue, Astro, Express, NestJS, or root static HTML projects are supported in v1.");
  }

  if (!hasBuildScript || !hasStartScript) {
    return unsupported("Standard build and start scripts are required for managed deployments.");
  }

  const packageManager = detectPackageManager({
    packageManagerField: parsed.packageManager,
    hasPackageLock: input.hasPackageLock,
    hasPnpmLock: input.hasPnpmLock,
    hasYarnLock: input.hasYarnLock
  });
  const packageManagerVersion = detectPackageManagerVersion(parsed.packageManager, packageManager);

  return {
    analysisStatus: "analyzed",
    deployabilityStatus: "deployable",
    deployabilityReason: null,
    detectedFramework: "nextjs",
    packageManager,
    managedConfig: buildManagedNextjsConfig(packageManager, input.hasPackageLock, {
      hasPnpmLock: input.hasPnpmLock,
      hasYarnLock: input.hasYarnLock,
      packageManagerVersion
    })
  };
}

function unsupported(reason: string): RepositoryAnalysisResult {
  return {
    analysisStatus: "analyzed",
    deployabilityStatus: "unsupported",
    deployabilityReason: reason,
    detectedFramework: null,
    packageManager: null,
    managedConfig: null
  };
}

function detectPackageManager(input: {
  packageManagerField?: string;
  hasPackageLock: boolean;
  hasPnpmLock: boolean;
  hasYarnLock: boolean;
}): ManagedAppPackageManager {
  const declared = input.packageManagerField?.split("@")[0];
  if (declared === "pnpm" || declared === "npm" || declared === "yarn") {
    return declared;
  }
  if (input.hasPnpmLock) {
    return "pnpm";
  }
  if (input.hasYarnLock) {
    return "yarn";
  }
  return "npm";
}

function detectPackageManagerVersion(
  packageManagerField: string | undefined,
  packageManager: ManagedAppPackageManager
) {
  if (!packageManagerField) {
    return null;
  }

  const match = packageManagerField.match(/^(npm|pnpm|yarn)@(.+)$/);
  if (!match || match[1] !== packageManager) {
    return null;
  }

  return match[2] || null;
}

export function buildManagedNextjsConfig(
  packageManager: ManagedAppPackageManager,
  hasPackageLock: boolean,
  options: {
    hasPnpmLock?: boolean;
    hasYarnLock?: boolean;
    packageManagerVersion?: string | null;
  } = {}
): ManagedAppConfig {
  const installCommand =
    packageManager === "pnpm"
      ? options.hasPnpmLock
        ? "pnpm install --frozen-lockfile"
        : "pnpm install"
      : packageManager === "yarn"
        ? options.hasYarnLock
          ? "yarn install --frozen-lockfile"
          : "yarn install"
        : hasPackageLock
          ? "npm ci"
          : "npm install";
  const commandPrefix = packageManager === "npm" ? "npm run" : packageManager;

  return {
    framework: "nextjs",
    packageManager,
    packageManagerVersion: options.packageManagerVersion ?? null,
    installCommand,
    buildCommand: `${commandPrefix} build`,
    startCommand: `${commandPrefix} start`,
    nodeVersion: "20",
    outputPort: 3000,
    outputDirectory: ".next"
  };
}

export function buildManagedReactConfig(
  packageManager: ManagedAppPackageManager,
  hasPackageLock: boolean,
  outputDirectory: "build" | "dist",
  options: {
    hasPnpmLock?: boolean;
    hasYarnLock?: boolean;
    packageManagerVersion?: string | null;
  } = {}
): ManagedAppConfig {
  const installCommand =
    packageManager === "pnpm"
      ? options.hasPnpmLock
        ? "pnpm install --frozen-lockfile"
        : "pnpm install"
      : packageManager === "yarn"
        ? options.hasYarnLock
          ? "yarn install --frozen-lockfile"
          : "yarn install"
        : hasPackageLock
          ? "npm ci"
          : "npm install";
  const commandPrefix = packageManager === "npm" ? "npm run" : packageManager;

  return {
    framework: outputDirectory === "build" ? "react_cra" : "react",
    packageManager,
    packageManagerVersion: options.packageManagerVersion ?? null,
    installCommand,
    buildCommand: `${commandPrefix} build`,
    startCommand: null,
    nodeVersion: "20",
    outputPort: 80,
    outputDirectory
  };
}

export function buildManagedStaticFrameworkConfig(
  framework: Extract<ManagedAppFramework, "vue" | "astro">,
  packageManager: ManagedAppPackageManager,
  hasPackageLock: boolean,
  outputDirectory: "dist",
  options: {
    hasPnpmLock?: boolean;
    hasYarnLock?: boolean;
    packageManagerVersion?: string | null;
  } = {}
): ManagedAppConfig {
  const config = buildManagedReactConfig(packageManager, hasPackageLock, outputDirectory, options);

  return {
    ...config,
    framework
  };
}

export function buildManagedNodeServerConfig(
  framework: Extract<ManagedAppFramework, "nuxt" | "express" | "nestjs">,
  packageManager: ManagedAppPackageManager,
  hasPackageLock: boolean,
  options: {
    hasPnpmLock?: boolean;
    hasYarnLock?: boolean;
    packageManagerVersion?: string | null;
  } = {}
): ManagedAppConfig {
  const installCommand =
    packageManager === "pnpm"
      ? options.hasPnpmLock
        ? "pnpm install --frozen-lockfile"
        : "pnpm install"
      : packageManager === "yarn"
        ? options.hasYarnLock
          ? "yarn install --frozen-lockfile"
          : "yarn install"
        : hasPackageLock
          ? "npm ci"
          : "npm install";
  const commandPrefix = packageManager === "npm" ? "npm run" : packageManager;

  return {
    framework,
    packageManager,
    packageManagerVersion: options.packageManagerVersion ?? null,
    installCommand,
    buildCommand: `${commandPrefix} build`,
    startCommand: `${commandPrefix} start`,
    nodeVersion: "20",
    outputPort: 3000,
    outputDirectory: framework === "nuxt" ? ".output" : "dist"
  };
}

export function buildManagedStaticHtmlConfig(): ManagedAppConfig {
  return {
    framework: "static_html",
    packageManager: null,
    packageManagerVersion: null,
    installCommand: null,
    buildCommand: null,
    startCommand: null,
    nodeVersion: null,
    outputPort: 80,
    outputDirectory: "."
  };
}

function detectReactFlavor(input: {
  buildScript: string;
  dependencies: Record<string, unknown>;
}): Extract<ManagedAppFramework, "react" | "react_cra"> {
  if (
    "react-scripts" in input.dependencies ||
    /\breact-scripts\s+build\b/.test(input.buildScript)
  ) {
    return "react_cra";
  }

  return "react";
}
