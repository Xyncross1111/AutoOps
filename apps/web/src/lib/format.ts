export function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatRelativeTime(value: string | null) {
  if (!value) {
    return "Just now";
  }

  const deltaSeconds = Math.round((Date.now() - Date.parse(value)) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (Math.abs(deltaSeconds) < 60) {
    return formatter.format(-deltaSeconds, "second");
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (Math.abs(deltaMinutes) < 60) {
    return formatter.format(-deltaMinutes, "minute");
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return formatter.format(-deltaHours, "hour");
  }

  const deltaDays = Math.round(deltaHours / 24);
  return formatter.format(-deltaDays, "day");
}

export function formatPercent(value: number) {
  return `${value}%`;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function extractFailureDetail(value: string) {
  const envMatch = value.match(/Please define ([A-Z0-9_]+) environment variable/i);
  if (envMatch) {
    return `Missing environment variable: ${envMatch[1]}`;
  }

  const hostMatch = value.match(/Could not resolve host:\s*([^\s'"]+)/i);
  if (hostMatch) {
    return `Could not resolve host: ${hostMatch[1]}`;
  }

  if (/network is unreachable/i.test(value)) {
    return "Network is unreachable";
  }

  if (/permission denied/i.test(value)) {
    return "Permission denied";
  }

  if (/authentication failed/i.test(value)) {
    return "Authentication failed";
  }

  if (/no space left on device/i.test(value)) {
    return "No space left on device";
  }

  const repoNotFoundMatch = value.match(/repository .+? not found/i);
  if (repoNotFoundMatch) {
    return repoNotFoundMatch[0];
  }

  const moduleNotFoundMatch = value.match(/(?:Cannot find module|Module not found:?)\s+.+/i);
  if (moduleNotFoundMatch) {
    return truncateText(moduleNotFoundMatch[0], 96);
  }

  return null;
}

export function formatFailureSummary(value: string | null, fallback = "Review target") {
  if (!value) {
    return fallback;
  }

  const normalized = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return fallback;
  }

  const lower = normalized.toLowerCase();
  const prefix = lower.startsWith("git ")
    ? "Git sync failed"
    : lower.startsWith("docker build")
      ? "Docker build failed"
      : lower.startsWith("docker pull")
        ? "Docker pull failed"
        : lower.startsWith("pnpm ") || lower.startsWith("npm ") || lower.startsWith("yarn ")
          ? "Install failed"
          : "";

  const detail = extractFailureDetail(normalized);
  if (detail) {
    return prefix ? `${prefix}: ${detail}` : detail;
  }

  const stripped = normalized
    .replace(/^.+?failed with exit code \d+:\s*/i, "")
    .replace(/^fatal:\s*/i, "")
    .replace(/^error:\s*/i, "")
    .trim();

  if (prefix && (/#\d+\s/.test(stripped) || stripped.length > 180)) {
    return `${prefix}. Open deployments for full logs.`;
  }

  const summary = truncateText(stripped || normalized, prefix ? 104 : 128);
  return prefix ? `${prefix}: ${summary}` : summary;
}

export function formatDuration(start: string | null, end: string | null) {
  if (!start) {
    return "Pending";
  }

  const endValue = end ? Date.parse(end) : Date.now();
  const deltaSeconds = Math.max(0, Math.round((endValue - Date.parse(start)) / 1000));

  if (deltaSeconds < 60) {
    return `${deltaSeconds}s`;
  }

  const minutes = Math.floor(deltaSeconds / 60);
  const seconds = deltaSeconds % 60;

  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function shortSha(value: string) {
  return value.slice(0, 8);
}

export function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
