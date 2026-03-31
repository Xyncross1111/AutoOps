import { useDeferredValue, useEffect, useState } from "react";
import { Search, Siren } from "lucide-react";
import { Link } from "react-router-dom";
import type { ActivityEvent } from "@autoops/core";

import { useAppSession } from "../app-context";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import { listActivity } from "../lib/api";
import { formatDateTime, titleCase } from "../lib/format";

export function ActivityPage() {
  const { token, refreshNonce } = useAppSession();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [kindFilter, setKindFilter] = useState<"all" | "audit" | "webhook">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    void listActivity(token, { limit: 100 })
      .then((response) => {
        if (active) {
          setEvents(response.events);
        }
      })
      .catch((caughtError) => {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : "Failed to load activity");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [refreshNonce, token]);

  const uniqueStatuses = [...new Set(events.map((event) => event.status))].sort();
  const filteredEvents = events.filter((event) => {
    if (kindFilter !== "all" && event.kind !== kindFilter) {
      return false;
    }
    if (statusFilter !== "all" && event.status !== statusFilter) {
      return false;
    }
    if (!deferredSearch) {
      return true;
    }

    return [
      event.title,
      event.description,
      event.status,
      event.actor ?? "",
      event.entityType ?? ""
    ]
      .join(" ")
      .toLowerCase()
      .includes(deferredSearch);
  });

  if (isLoading) {
    return <LoadingBlock label="Loading activity..." />;
  }

  return (
    <div className="page-stack">
      {error ? <InlineError message={error} /> : null}

      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Unified timeline</p>
            <h3>Audit + webhook feed</h3>
          </div>
          <Siren size={18} />
        </div>

        <div className="toolbar-grid">
          <label className="toolbar-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, description, actor, or entity"
            />
          </label>

          <select
            value={kindFilter}
            onChange={(event) => (
              setKindFilter(event.target.value as "all" | "audit" | "webhook")
            )}
          >
            <option value="all">All event kinds</option>
            <option value="audit">Audit</option>
            <option value="webhook">Webhook</option>
          </select>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {uniqueStatuses.map((status) => (
              <option key={status} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </select>
        </div>
      </section>

      {filteredEvents.length > 0 ? (
        <section className="activity-list">
          {filteredEvents.map((event) => (
            <Link className="activity-card" key={event.id} to={activityHref(event)}>
              <div className="row-spread">
                <div>
                  <p className="eyebrow">{titleCase(event.kind)}</p>
                  <h3>{event.title}</h3>
                </div>
                <StatusBadge status={event.status} tone="subtle" />
              </div>
              <p>{event.description}</p>
              <div className="activity-meta-row">
                <span>{formatDateTime(event.occurredAt)}</span>
                <span>{event.actor ?? "System event"}</span>
                <span>{event.entityType ?? "No entity"}</span>
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <EmptyState
          title="No activity matches these filters"
          description="Try widening the kind, status, or text filter to reveal more events."
        />
      )}
    </div>
  );
}

function activityHref(event: ActivityEvent) {
  if (event.runId) {
    return `/runs?run=${event.runId}`;
  }
  if (event.targetId) {
    return `/deployments?target=${event.targetId}`;
  }
  if (event.projectId) {
    return `/projects/${event.projectId}`;
  }
  return "/activity";
}
