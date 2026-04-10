import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Search } from "lucide-react";
import type { RunLogEntry } from "@autoops/core";

export function LogViewer(props: {
  entries: RunLogEntry[];
  streamKey: string | null;
  emptyMessage: string;
}) {
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuery("");
    setFollow(true);
  }, [props.streamKey]);

  const filteredEntries = useMemo(() => {
    const nextQuery = query.trim().toLowerCase();
    if (!nextQuery) {
      return props.entries;
    }

    return props.entries.filter((entry) =>
      [entry.stageName, entry.message].join(" ").toLowerCase().includes(nextQuery)
    );
  }, [props.entries, query]);

  useEffect(() => {
    if (!follow || !bodyRef.current) {
      return;
    }

    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [filteredEntries, follow]);

  async function handleCopy() {
    if (!navigator.clipboard) {
      return;
    }

    const payload = filteredEntries
      .map((entry) => `[${entry.stageName}] ${entry.message}`)
      .join("\n");

    await navigator.clipboard.writeText(payload);
  }

  return (
    <div className="ao-log-viewer">
      <div className="ao-log-viewer__toolbar">
        <label className="ao-search-input ao-search-input--compact">
          <Search size={14} />
          <input
            aria-label="Search logs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search logs"
          />
        </label>
        <div className="ao-log-viewer__actions">
          <button
            className={`ao-button ao-button--secondary${follow ? " is-active" : ""}`}
            type="button"
            onClick={() => setFollow((current) => !current)}
          >
            {follow ? "Following live" : "Jump to live"}
          </button>
          <button className="ao-button ao-button--secondary" type="button" onClick={() => void handleCopy()}>
            <Copy size={14} />
            <span>Copy</span>
          </button>
        </div>
      </div>

      <div className="ao-log-viewer__body" ref={bodyRef}>
        {filteredEntries.length > 0 ? (
          filteredEntries.map((entry) => (
            <div className="ao-log-line" key={entry.id}>
              <span className="ao-log-line__stage">{entry.stageName}</span>
              <span className="ao-log-line__message">{entry.message}</span>
            </div>
          ))
        ) : (
          <div className="ao-log-viewer__empty">{props.emptyMessage}</div>
        )}
      </div>
    </div>
  );
}
