// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { PipelineRunSummary } from "@autoops/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRunStream } from "./useRunStream";

const apiMocks = vi.hoisted(() => ({
  getRun: vi.fn()
}));

vi.mock("../lib/api", () => ({
  buildRunStreamUrl: (runId: string, token: string) => (
    `http://autoops.test/api/runs/${runId}/stream?token=${token}`
  ),
  getRun: apiMocks.getRun
}));

type Listener = (event: MessageEvent) => void;

class EventSourceMock {
  static instances: EventSourceMock[] = [];

  listeners = new Map<string, Listener[]>();
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    EventSourceMock.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, payload: unknown) {
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      listener({ data: JSON.stringify(payload) } as MessageEvent);
    }
  }

  close() {}
}

function Probe(props: { runId: string | null }) {
  const stream = useRunStream("test-token", props.runId, () => undefined);

  return (
    <div>
      <div data-testid="loading">{String(stream.isLoading)}</div>
      <div data-testid="run-name">{stream.detail?.run.projectName ?? "empty"}</div>
      <div data-testid="log-count">{String(stream.logs.length)}</div>
    </div>
  );
}

const run: PipelineRunSummary = {
  id: "run-1",
  projectId: "project-1",
  projectName: "Storefront",
  source: "push",
  branch: "main",
  commitSha: "1111111111111111111111111111111111111111",
  status: "running",
  queuedAt: "2026-03-31T08:00:00.000Z",
  startedAt: "2026-03-31T08:00:10.000Z",
  finishedAt: null,
  triggeredBy: "alice",
  errorMessage: null
};

describe("useRunStream", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    EventSourceMock.instances = [];
    vi.stubGlobal("EventSource", EventSourceMock);
    apiMocks.getRun.mockResolvedValue({
      run,
      stages: [],
      logs: [
        {
          id: 1,
          runId: run.id,
          stageName: "build",
          message: "Initial log",
          createdAt: run.startedAt ?? run.queuedAt
        }
      ]
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("does not refetch detail on every status event", async () => {
    render(<Probe runId={run.id} />);

    await waitFor(() => {
      expect(screen.getByTestId("run-name")).toHaveTextContent("Storefront");
    });

    expect(apiMocks.getRun).toHaveBeenCalledTimes(1);
    expect(EventSourceMock.instances).toHaveLength(1);

    EventSourceMock.instances[0].emit("status", {
      ...run,
      status: "running"
    });

    await waitFor(() => {
      expect(screen.getByTestId("run-name")).toHaveTextContent("Storefront");
    });

    expect(apiMocks.getRun).toHaveBeenCalledTimes(1);
    expect(EventSourceMock.instances).toHaveLength(1);
  });
});
