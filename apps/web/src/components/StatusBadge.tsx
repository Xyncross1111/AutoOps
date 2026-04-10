import { titleCase } from "../lib/format";
import { getStatusTone, StatusDot } from "./StatusDot";

export function StatusBadge(props: {
  status: string | null;
  tone?: "default" | "subtle";
}) {
  const status = props.status ?? "unknown";
  const tone = props.tone ?? "default";
  const toneClass = getStatusTone(status);

  return (
    <span className={`ao-badge ao-badge--${tone} ao-badge--${toneClass}`}>
      <StatusDot status={status} />
      {titleCase(status)}
    </span>
  );
}
