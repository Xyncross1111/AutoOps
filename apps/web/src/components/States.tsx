import type { ReactNode } from "react";

export function LoadingBlock(props: { label?: string }) {
  return (
    <div className="state-block loading-block">
      <div className="loading-pulse" />
      <p>{props.label ?? "Loading..."}</p>
    </div>
  );
}

export function EmptyState(props: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-block empty-state">
      <h3>{props.title}</h3>
      <p>{props.description}</p>
      {props.action ? <div className="state-action">{props.action}</div> : null}
    </div>
  );
}

export function InlineError(props: {
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="error-banner">
      <strong>{props.title ?? "Something went wrong"}</strong>
      <span>{props.message}</span>
      {props.action ? <div className="state-action">{props.action}</div> : null}
    </div>
  );
}
