import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type ToolSectionProps = {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  columns?: 1 | 2;
  className?: string;
  children: ReactNode;
};

export function ToolSection({
  title,
  subtitle,
  icon: SectionIcon,
  columns = 1,
  className,
  children,
}: ToolSectionProps) {
  return (
    <section className={`tm-tool-section${className ? ` ${className}` : ""}`}>
      <header className="tm-tool-section-head">
        {SectionIcon ? (
          <span className="tm-tool-section-icon" aria-hidden>
            <SectionIcon size={16} strokeWidth={1.85} />
          </span>
        ) : null}
        <div>
          <h3 className="tm-tool-section-title">{title}</h3>
          {subtitle ? <p className="tm-tool-section-subtitle">{subtitle}</p> : null}
        </div>
      </header>
      <div className={`tm-tool-section-body tm-tool-section-cols-${columns}`}>{children}</div>
    </section>
  );
}
