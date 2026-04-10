import type { ReactNode } from "react";

export function PageHeader(props: {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ao-page-header">
      <div className="ao-page-header__copy">
        {props.eyebrow ? <p className="ao-page-header__eyebrow">{props.eyebrow}</p> : null}
        <div className="ao-page-header__title-row">
          <h1>{props.title}</h1>
          {props.actions ? (
            <div className="ao-page-header__actions ao-page-header__actions--mobile">
              {props.actions}
            </div>
          ) : null}
        </div>
        {props.description ? (
          <p className="ao-page-header__description">{props.description}</p>
        ) : null}
        {props.meta ? <div className="ao-page-header__meta">{props.meta}</div> : null}
      </div>
      {props.actions ? (
        <div className="ao-page-header__actions ao-page-header__actions--desktop">
          {props.actions}
        </div>
      ) : null}
    </header>
  );
}
