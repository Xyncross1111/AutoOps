import type { GitHubRepositorySummary, ManagedAppPackageManager, ManagedNextjsConfig } from "@autoops/core";

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
  managedConfig: ManagedNextjsConfig | null;
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

  if (!input.packageJson) {
    return unsupported("Missing a root package.json file.");
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

  if (
    parsed.workspaces !== undefined ||
    input.hasPnpmWorkspace ||
    input.hasTurboJson ||
    input.hasNxJson
  ) {
    return unsupported("Monorepos and workspace-based repositories are not supported in v1.");
  }

  const dependencies = {
    ...(parsed.dependencies ?? {}),
    ...(parsed.devDependencies ?? {})
  };

  if (!("next" in dependencies)) {
    return unsupported("Next.js was not detected in the root package.json.");
  }

  const scripts = parsed.scripts ?? {};
  const hasBuildScript = typeof scripts.build === "string" && scripts.build.trim().length > 0;
  const hasStartScript = typeof scripts.start === "string" && scripts.start.trim().length > 0;

  if (!hasBuildScript || !hasStartScript) {
    return unsupported("Standard build and start scripts are required for managed deployments.");
  }

  const packageManager = detectPackageManager({
    packageManagerField: parsed.packageManager,
    hasPackageLock: input.hasPackageLock,
    hasPnpmLock: input.hasPnpmLock,
    hasYarnLock: input.hasYarnLock
  });

  return {
    analysisStatus: "analyzed",
    deployabilityStatus: "deployable",
    deployabilityReason: null,
    detectedFramework: "nextjs",
    packageManager,
    managedConfig: buildManagedNextjsConfig(packageManager, input.hasPackageLock)
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

export function buildManagedNextjsConfig(
  packageManager: ManagedAppPackageManager,
  hasPackageLock: boolean
): ManagedNextjsConfig {
  const installCommand =
    packageManager === "pnpm"
      ? "pnpm install --frozen-lockfile"
      : packageManager === "yarn"
        ? "yarn install --frozen-lockfile"
        : hasPackageLock
          ? "npm ci"
          : "npm install";
  const commandPrefix = packageManager === "npm" ? "npm run" : packageManager;

  return {
    framework: "nextjs",
    packageManager,
    installCommand,
    buildCommand: `${commandPrefix} build`,
    startCommand: `${commandPrefix} start`,
    nodeVersion: "20",
    outputPort: 3000
  };
}
