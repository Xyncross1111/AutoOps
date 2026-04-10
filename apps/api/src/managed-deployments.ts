import { createHash } from "node:crypto";

import type { DeploymentTargetSummary, ProjectSummary } from "@autoops/core";
import type { AutoOpsDb } from "@autoops/db";

import type { ApiConfig } from "./config.js";

export type ManagedDeploymentEnvironment = "production" | "preview";

export interface EnsuredManagedTarget {
  target: DeploymentTargetSummary;
  environment: ManagedDeploymentEnvironment;
  appSlug: string;
  url: string | null;
}

const PREVIEW_TARGET_PREFIX = "preview:";
const DEFAULT_PRODUCTION_TARGET_NAME = "managed-vps";

export function createManagedAppSlug(fullName: string, repoId: number): string {
  const base = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "app"}-${repoId}`;
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function buildManagedPrimaryUrl(args: {
  baseDomain: string;
  webBaseUrl: string;
  appSlug: string;
  port: number;
}): string | null {
  if (args.baseDomain) {
    return `https://${args.appSlug}.${args.baseDomain}`;
  }

  try {
    const webUrl = new URL(args.webBaseUrl);
    return `http://${webUrl.hostname}:${args.port}`;
  } catch {
    return null;
  }
}

export function isProductionManagedTargetName(name: string) {
  return name === DEFAULT_PRODUCTION_TARGET_NAME || name === "production";
}

export function parseManagedPreviewBranch(name: string) {
  return name.startsWith(PREVIEW_TARGET_PREFIX)
    ? name.slice(PREVIEW_TARGET_PREFIX.length)
    : null;
}

export function getManagedDeploymentEnvironment(
  defaultBranch: string,
  branch: string
): ManagedDeploymentEnvironment {
  return branch === defaultBranch ? "production" : "preview";
}

export function buildManagedTargetName(
  defaultBranch: string,
  branch: string,
  productionTargetName = DEFAULT_PRODUCTION_TARGET_NAME
) {
  if (branch === defaultBranch) {
    return productionTargetName;
  }

  return `${PREVIEW_TARGET_PREFIX}${branch}`;
}

export function buildManagedTargetAppSlug(args: {
  baseAppSlug: string;
  defaultBranch: string;
  branch: string;
}) {
  if (args.branch === args.defaultBranch) {
    return args.baseAppSlug;
  }

  const branchToken = args.branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "preview";
  const hash = createHash("sha1").update(args.branch).digest("hex").slice(0, 8);
  const suffix = `${branchToken}-${hash}`;
  const maxBaseLength = Math.max(12, 63 - suffix.length - 1);
  const base = args.baseAppSlug.slice(0, maxBaseLength).replace(/-+$/, "");

  return `${base}-${suffix}`.slice(0, 63);
}

export function buildManagedTargetDefinition(args: {
  config: Pick<ApiConfig, "MANAGED_APPS_DIR" | "MANAGED_BASE_DOMAIN" | "WEB_BASE_URL">;
  baseAppSlug: string;
  defaultBranch: string;
  branch: string;
  outputPort: number;
  managedPort: number;
  productionTargetName?: string;
}) {
  const appSlug = buildManagedTargetAppSlug({
    baseAppSlug: args.baseAppSlug,
    defaultBranch: args.defaultBranch,
    branch: args.branch
  });
  const targetName = buildManagedTargetName(
    args.defaultBranch,
    args.branch,
    args.productionTargetName
  );
  const managedDomain = args.config.MANAGED_BASE_DOMAIN
    ? `${appSlug}.${args.config.MANAGED_BASE_DOMAIN}`
    : null;
  const runtimeDir = `${trimTrailingSlash(args.config.MANAGED_APPS_DIR)}/apps/${appSlug}`;

  return {
    environment: getManagedDeploymentEnvironment(args.defaultBranch, args.branch),
    appSlug,
    url: buildManagedPrimaryUrl({
      baseDomain: args.config.MANAGED_BASE_DOMAIN,
      webBaseUrl: args.config.WEB_BASE_URL,
      appSlug,
      port: args.managedPort
    }),
    target: {
      name: targetName,
      targetType: "managed_vps" as const,
      environment: args.branch === args.defaultBranch ? "production" as const : "preview" as const,
      promotionOrder: args.branch === args.defaultBranch ? 2 : 1,
      protected: args.branch === args.defaultBranch,
      hostRef: "managed",
      composeFile: `${runtimeDir}/docker-compose.yml`,
      service: "app",
      healthcheckUrl: `http://${appSlug}:${args.outputPort}/`,
      managedPort: args.managedPort,
      managedRuntimeDir: runtimeDir,
      managedDomain
    }
  };
}

export async function ensureManagedDeploymentTarget(args: {
  db: AutoOpsDb;
  config: Pick<ApiConfig, "MANAGED_APPS_DIR" | "MANAGED_BASE_DOMAIN" | "WEB_BASE_URL">;
  project: Pick<ProjectSummary, "id" | "defaultBranch" | "appSlug" | "managedConfig">;
  branch: string;
  ownerEmail?: string;
}): Promise<EnsuredManagedTarget> {
  if (!args.project.appSlug || !args.project.managedConfig) {
    throw new Error("Managed project metadata is incomplete.");
  }

  const currentTargets = await args.db.listDeploymentTargets(args.project.id, args.ownerEmail);
  const environment = getManagedDeploymentEnvironment(args.project.defaultBranch, args.branch);
  const existingProductionTarget = currentTargets.find(
    (target) =>
      target.targetType === "managed_vps" && isProductionManagedTargetName(target.name)
  );
  const targetName =
    environment === "production"
      ? existingProductionTarget?.name ?? DEFAULT_PRODUCTION_TARGET_NAME
      : buildManagedTargetName(args.project.defaultBranch, args.branch);
  const existingTarget =
    environment === "production"
      ? existingProductionTarget ?? null
      : currentTargets.find(
          (target) => target.targetType === "managed_vps" && target.name === targetName
        ) ?? null;
  const managedPort = existingTarget?.managedPort ?? await args.db.reserveNextManagedPort();
  const desired = buildManagedTargetDefinition({
    config: args.config,
    baseAppSlug: args.project.appSlug,
    defaultBranch: args.project.defaultBranch,
    branch: args.branch,
    outputPort: args.project.managedConfig.outputPort,
    managedPort,
    productionTargetName: targetName
  });

  const syncedTargets = await args.db.syncDeploymentTargets(args.project.id, [desired.target]);
  const resolvedTarget = syncedTargets.find((target) => target.name === desired.target.name);

  if (!resolvedTarget) {
    throw new Error("Managed deployment target could not be resolved.");
  }

  return {
    target: resolvedTarget,
    environment,
    appSlug: desired.appSlug,
    url: desired.url
  };
}
