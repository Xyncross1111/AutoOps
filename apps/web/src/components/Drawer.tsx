import type { ReactNode } from "react";

export function Drawer(props: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!props.open) {
    return null;
  }

  return (
    <>
      <button
        aria-label="Close drawer"
        className="ao-drawer__backdrop"
        type="button"
        onClick={props.onClose}
      />
      <aside className="ao-drawer" aria-modal="true" role="dialog" aria-label={props.title}>
        <div className="ao-drawer__header">
          <div>
            <p className="ao-page-header__eyebrow">Detail</p>
            <h2>{props.title}</h2>
            {props.subtitle ? <p className="ao-drawer__subtitle">{props.subtitle}</p> : null}
          </div>
          <button className="ao-button ao-button--secondary" type="button" onClick={props.onClose}>
            Close
          </button>
        </div>
        <div className="ao-drawer__body">{props.children}</div>
      </aside>
    </>
  );
}
