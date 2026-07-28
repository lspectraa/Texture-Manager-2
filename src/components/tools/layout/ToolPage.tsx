import type { ReactNode } from "react";
import type { ToolAccent } from "../../../config/toolNavigation";

type ToolPageProps = {
  accent: ToolAccent;
  wide?: boolean;
  children: ReactNode;
};

export function ToolPage({ accent, wide = false, children }: ToolPageProps) {
  return (
    <div
      className={`tm-tool-page tm-tool-page-accent-${accent}${wide ? " tm-tool-page-wide" : ""}`}
    >
      {children}
    </div>
  );
}
