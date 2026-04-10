import type { ReactNode } from "react";

export function LoadingBlock(props: { label?: string }) {
  return (
    <div className="ao-state ao-state--loading" role="status" aria-live="polite">
      <div className="ao-skeleton ao-skeleton--line ao-state__skeleton" />
      <div className="ao-skeleton ao-skeleton--line ao-state__skeleton ao-state__skeleton--short" />
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
    <div className="ao-state ao-state--empty">
      <h3>{props.title}</h3>
      <p>{props.description}</p>
      {props.action ? <div className="ao-state__action">{props.action}</div> : null}
    </div>
  );
}

export function InlineError(props: {
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="ao-inline-message ao-inline-message--error" role="alert">
      <strong>{props.title ?? "Something went wrong"}</strong>
      <span>{props.message}</span>
      {props.action ? <div className="ao-state__action">{props.action}</div> : null}
    </div>
  );
}
