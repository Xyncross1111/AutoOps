import type { DeploymentTargetSummary } from "@autoops/core";

export function parseManagedPreviewBranch(targetName: string) {
  return targetName.startsWith("preview:") ? targetName.slice("preview:".length) : null;
}

export function isManagedPreviewTarget(target: DeploymentTargetSummary) {
  return target.targetType === "managed_vps" && parseManagedPreviewBranch(target.name) !== null;
}

export function formatManagedTargetLabel(target: DeploymentTargetSummary) {
  const previewBranch = parseManagedPreviewBranch(target.name);
  if (previewBranch) {
    return `Preview / ${previewBranch}`;
  }

  if (target.targetType === "managed_vps") {
    return "Production";
  }

  return target.name;
}

export function formatManagedTargetKind(target: DeploymentTargetSummary) {
  const previewBranch = parseManagedPreviewBranch(target.name);
  if (previewBranch) {
    return "Preview";
  }

  if (target.targetType === "managed_vps") {
    return "Production";
  }

  return "Target";
}

export function buildManagedTargetUrl(target: DeploymentTargetSummary) {
  if (target.targetType !== "managed_vps") {
    return null;
  }

  if (target.managedDomain) {
    return `https://${target.managedDomain}`;
  }

  if (typeof window === "undefined" || !target.managedPort) {
    return null;
  }

  return `${window.location.protocol}//${window.location.hostname}:${target.managedPort}/`;
}
