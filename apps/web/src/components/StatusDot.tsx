function normalizeStatus(status: string | null | undefined) {
  return (status ?? "unknown").toLowerCase().replace(/\s+/g, "-");
}

export function getStatusTone(status: string | null | undefined) {
  const normalized = normalizeStatus(status);

  if (normalized === "running" || normalized === "connected" || normalized === "processed") {
    return "running";
  }

  if (normalized === "succeeded" || normalized === "completed" || normalized === "idle") {
    return "succeeded";
  }

  if (normalized === "failed" || normalized === "unsupported" || normalized === "archived") {
    return "failed";
  }

  if (normalized === "superseded") {
    return "superseded";
  }

  if (normalized === "cancelled") {
    return "cancelled";
  }

  return normalized === "queued" || normalized === "pending" || normalized === "deployable"
    ? "queued"
    : "neutral";
}

export function StatusDot(props: {
  status: string | null | undefined;
}) {
  return (
    <span
      aria-hidden="true"
      className={`ao-status-dot ao-status-dot--${getStatusTone(props.status)}`}
    />
  );
}
