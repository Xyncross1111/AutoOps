import type { ReactNode } from "react";

export interface MetaListItem {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

export function MetaList(props: {
  items: MetaListItem[];
  dense?: boolean;
}) {
  return (
    <dl className={`ao-meta-list${props.dense ? " ao-meta-list--dense" : ""}`}>
      {props.items.map((item) => (
        <div className="ao-meta-list__item" key={item.label}>
          <dt>{item.label}</dt>
          <dd className={item.mono ? "ao-mono" : undefined}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
