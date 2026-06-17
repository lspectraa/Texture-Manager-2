import { ChevronLeft, Compass, House } from "lucide-react";
import { AppToolId, TOOL_NAV_SECTIONS } from "../config/toolNavigation";

type AppSidebarProps = {
  selectedTool: "home" | AppToolId;
  collapsed: boolean;
  animating: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onNavigate: (tool: "home" | AppToolId) => void;
};

export function AppSidebar({
  selectedTool,
  collapsed,
  animating,
  onExpand,
  onCollapse,
  onNavigate,
}: AppSidebarProps) {
  return (
    <aside
      className={`tm-sidebar tm-glass-card${collapsed ? " tm-sidebar--collapsed" : ""}${
        animating ? " tm-sidebar--animating" : ""
      }`}
      aria-label="Application navigation"
    >
      <button
        type="button"
        className={`tm-shell-panel-title tm-nav-btn tm-nav-btn-sky${
          collapsed && !animating ? " tm-sidebar-rail-btn" : ""
        }`}
        onClick={animating ? undefined : collapsed ? onExpand : onCollapse}
        aria-expanded={!collapsed}
        aria-label={
          collapsed ? "Expand navigation panel" : "Collapse navigation panel"
        }
        title={collapsed ? "Show navigation" : "Hide navigation"}
        disabled={animating}
      >
        <span className="tm-nav-btn-icon" aria-hidden>
          <Compass size={16} strokeWidth={1.85} />
        </span>
        <span className="tm-nav-btn-copy">
          <span className="tm-shell-panel-title-eyebrow">Navigation</span>
          <span className="tm-shell-panel-title-name">Texture Manager 2</span>
        </span>
        <span className="tm-shell-panel-title-chevron" aria-hidden>
          <ChevronLeft size={15} />
        </span>
      </button>

      <button
        type="button"
        className={`tm-nav-btn tm-nav-btn-home${selectedTool === "home" ? " active" : ""}`}
        onClick={() => onNavigate("home")}
        aria-current={selectedTool === "home" ? "page" : undefined}
        title="Home"
      >
        <span className="tm-nav-btn-icon" aria-hidden>
          <House size={17} strokeWidth={1.85} />
        </span>
        <span className="tm-nav-btn-copy">
          <span className="tm-nav-btn-label">Home</span>
          <span className="tm-nav-btn-hint">Launcher</span>
        </span>
      </button>

      {TOOL_NAV_SECTIONS.map((section) => {
        const SectionIcon = section.icon;
        return (
          <section
            key={section.id}
            className={`tm-sidebar-group tm-sidebar-group-${section.accent}`}
            aria-labelledby={`sidebar-section-${section.id}`}
          >
            <div className="tm-sidebar-group-head" id={`sidebar-section-${section.id}`}>
              <span className="tm-sidebar-group-icon" aria-hidden>
                <SectionIcon size={14} strokeWidth={2} />
              </span>
              <span className="tm-sidebar-group-title">{section.title}</span>
            </div>

            <div className="tm-sidebar-group-items" role="list">
              {section.tools.map((tool) => {
                const ToolIcon = tool.icon;
                const isActive = selectedTool === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    className={`tm-nav-btn tm-nav-btn-${tool.accent}${
                      isActive ? " active" : ""
                    }${tool.featured ? " tm-nav-btn-featured" : ""}`}
                    onClick={() => onNavigate(tool.id)}
                    role="listitem"
                    aria-current={isActive ? "page" : undefined}
                    title={tool.label}
                  >
                    <span className="tm-nav-btn-icon" aria-hidden>
                      <ToolIcon size={16} strokeWidth={1.85} />
                    </span>
                    <span className="tm-nav-btn-label">
                      {tool.shortLabel ?? tool.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <button
        type="button"
        className="tm-nav-btn tm-nav-btn-sky tm-sidebar-copyright"
        title="© Spectra 2026"
        aria-label="Copyright Spectra 2026"
      >
        <span className="tm-nav-btn-icon" aria-hidden>
          <span className="tm-sidebar-copyright-glyph">©</span>
        </span>
        <span className="tm-nav-btn-label">Spectra 2026</span>
      </button>
    </aside>
  );
}
