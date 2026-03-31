import { titleCase } from "../lib/format";

export function StatusBadge(props: {
  status: string | null;
  tone?: "default" | "subtle";
}) {
  const status = props.status ?? "unknown";
  const tone = props.tone ?? "default";

  return (
    <span className={`status-badge status-${status.replace(/\s+/g, "-")} tone-${tone}`}>
      {titleCase(status)}
    </span>
  );
}
