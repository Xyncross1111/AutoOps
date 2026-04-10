import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Search, Siren } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import type { ActivityEvent } from "@autoops/core";

import { useAppSession } from "../app-context";
import { Drawer } from "../components/Drawer";
import { MetaList } from "../components/MetaList";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { Toolbar } from "../components/Toolbar";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import { listActivity } from "../lib/api";
import { formatDateTime, titleCase } from "../lib/format";

export function ActivityPage() {
  const { token, refreshNonce } = useAppSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const search = searchParams.get("search") ?? "";
  const kindFilter = (searchParams.get("kind") as "all" | "audit" | "webhook" | null) ?? "all";
  const statusFilter = searchParams.get("status") ?? "all";
  const actorFilter = searchParams.get("actor") ?? "all";
  const entityFilter = searchParams.get("entity") ?? "all";
  const selectedEventId = searchParams.get("event");
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

  const uniqueStatuses = useMemo(() => [...new Set(events.map((event) => event.status))].sort(), [events]);
  const uniqueActors = useMemo(
    () => [...new Set(events.map((event) => event.actor).filter(Boolean))].sort() as string[],
    [events]
  );
  const uniqueEntities = useMemo(
    () => [...new Set(events.map((event) => event.entityType).filter(Boolean))].sort() as string[],
    [events]
  );

  const filteredEvents = events.filter((event) => {
    if (kindFilter !== "all" && event.kind !== kindFilter) {
      return false;
    }
    if (statusFilter !== "all" && event.status !== statusFilter) {
      return false;
    }
    if (actorFilter !== "all" && event.actor !== actorFilter) {
      return false;
    }
    if (entityFilter !== "all" && event.entityType !== entityFilter) {
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
      event.entityType ?? "",
      event.entityId ?? ""
    ]
      .join(" ")
      .toLowerCase()
      .includes(deferredSearch);
  });

  const selectedEvent = filteredEvents.find((event) => event.id === selectedEventId)
    ?? events.find((event) => event.id === selectedEventId)
    ?? null;

  function updateParams(nextValues: Record<string, string>) {
    const next = new URLSearchParams(searchParams);

    Object.entries(nextValues).forEach(([key, value]) => {
      if (!value || value === "all") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });

    setSearchParams(next, { replace: true });
  }

  if (isLoading) {
    return <LoadingBlock label="Loading activity..." />;
  }

  return (
    <div className="ao-page ao-activity">
      <PageHeader
        eyebrow="Audit / Timeline"
        title="Activity"
        description="Review audit entries and webhook traffic in a dense operational timeline."
        meta={
          <div className="ao-inline-meta">
            <span className="ao-chip">{events.length} total events</span>
            <span className="ao-chip">{filteredEvents.length} visible</span>
          </div>
        }
      />

      {error ? <InlineError message={error} /> : null}

      <section className="ao-panel">
        <Toolbar sticky>
          <label className="ao-search-input">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => updateParams({ search: event.target.value })}
              placeholder="Search title, description, actor, or resource"
            />
          </label>

          <select value={kindFilter} onChange={(event) => updateParams({ kind: event.target.value })}>
            <option value="all">All kinds</option>
            <option value="audit">Audit</option>
            <option value="webhook">Webhook</option>
          </select>

          <select value={statusFilter} onChange={(event) => updateParams({ status: event.target.value })}>
            <option value="all">All statuses</option>
            {uniqueStatuses.map((status) => (
              <option key={status} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </select>

          <select value={actorFilter} onChange={(event) => updateParams({ actor: event.target.value })}>
            <option value="all">All actors</option>
            {uniqueActors.map((actor) => (
              <option key={actor} value={actor}>
                {actor}
              </option>
            ))}
          </select>

          <select value={entityFilter} onChange={(event) => updateParams({ entity: event.target.value })}>
            <option value="all">All resources</option>
            {uniqueEntities.map((entity) => (
              <option key={entity} value={entity}>
                {entity}
              </option>
            ))}
          </select>
        </Toolbar>
      </section>

      {filteredEvents.length > 0 ? (
        <section className="ao-activity-list">
          {filteredEvents.map((event) => (
            <button
              className="ao-activity-row"
              key={event.id}
              type="button"
              onClick={() => updateParams({ event: event.id })}
            >
              <div className="ao-activity-row__sentence">
                <strong>{renderEventSentence(event)}</strong>
                <p>{event.description}</p>
              </div>
              <div className="ao-activity-row__meta">
                <div>{event.actor ?? "System event"}</div>
                <div className="ao-mono">{event.entityType ?? "No resource"}</div>
              </div>
              <div className="ao-inline-cluster">
                <StatusBadge status={event.status} tone="subtle" />
                <span className="ao-table__secondary ao-mono">{formatDateTime(event.occurredAt)}</span>
              </div>
            </button>
          ))}
        </section>
      ) : (
        <EmptyState
          title="No activity matches these filters"
          description="Try widening the kind, status, actor, or search filters."
          action={
            <button
              className="ao-button ao-button--secondary"
              type="button"
              onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
            >
              Clear filters
            </button>
          }
        />
      )}

      <Drawer
        open={Boolean(selectedEvent)}
        onClose={() => updateParams({ event: "" })}
        subtitle={selectedEvent ? formatDateTime(selectedEvent.occurredAt) : undefined}
        title={selectedEvent?.title ?? "Activity detail"}
      >
        {selectedEvent ? (
          <div className="ao-stack">
            <MetaList
              items={[
                { label: "Kind", value: selectedEvent.kind, mono: true },
                { label: "Status", value: <StatusBadge status={selectedEvent.status} tone="subtle" /> },
                { label: "Actor", value: selectedEvent.actor ?? "System" },
                { label: "Entity", value: selectedEvent.entityType ?? "No entity", mono: true },
                { label: "Entity ID", value: selectedEvent.entityId ?? "Not available", mono: true }
              ]}
            />

            <article className="ao-panel ao-panel--inset">
              <div className="ao-section-header">
                <div className="ao-section-header__copy">
                  <p className="ao-section-header__eyebrow">Description</p>
                  <h3>Event summary</h3>
                </div>
              </div>
              <p className="ao-muted">{selectedEvent.description}</p>
            </article>

            <article className="ao-panel ao-panel--inset">
              <div className="ao-section-header">
                <div className="ao-section-header__copy">
                  <p className="ao-section-header__eyebrow">Related links</p>
                  <h3>Navigate from this event</h3>
                </div>
              </div>
              <div className="ao-inline-cluster">
                {selectedEvent.runId ? (
                  <Link className="ao-link-button ao-link-button--secondary" to={`/runs?run=${selectedEvent.runId}`}>
                    Open run
                  </Link>
                ) : null}
                {selectedEvent.targetId ? (
                  <Link className="ao-link-button ao-link-button--secondary" to={`/deployments?target=${selectedEvent.targetId}`}>
                    Open target
                  </Link>
                ) : null}
                {selectedEvent.projectId ? (
                  <Link className="ao-link-button ao-link-button--secondary" to={`/projects/${selectedEvent.projectId}`}>
                    Open project
                  </Link>
                ) : null}
              </div>
            </article>

            <article className="ao-panel ao-panel--inset">
              <div className="ao-section-header">
                <div className="ao-section-header__copy">
                  <p className="ao-section-header__eyebrow">Metadata</p>
                  <h3>Raw event context</h3>
                </div>
              </div>
              <pre className="ao-pre ao-mono">{JSON.stringify(selectedEvent.metadata, null, 2)}</pre>
            </article>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

function renderEventSentence(event: ActivityEvent) {
  const target = event.entityType && event.entityId
    ? `${event.entityType}/${event.entityId}`
    : event.entityType ?? "event";
  return `${event.title} • ${target}`;
}
