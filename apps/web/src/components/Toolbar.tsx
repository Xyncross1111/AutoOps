import type { ReactNode } from "react";

export function Toolbar(props: {
  children: ReactNode;
  sticky?: boolean;
  dense?: boolean;
}) {
  return (
    <div
      className={`ao-toolbar${props.sticky ? " ao-toolbar--sticky" : ""}${
        props.dense ? " ao-toolbar--dense" : ""
      }`}
    >
      {props.children}
    </div>
  );
}
