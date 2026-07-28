import { ChevronLeft, Compass, House, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { COPYRIGHT_HOLDER, COPYRIGHT_YEAR } from "../config/appMeta";
import { AppToolId, TOOL_NAV_SECTIONS } from "../config/toolNavigation";
import { GlassFrost } from "./GlassFrost";

type AppSidebarProps = {
  selectedTool: "home" | "settings" | AppToolId;
  collapsed: boolean;
  animating: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onNavigate: (tool: "home" | "settings" | AppToolId) => void;
  onCopyrightClick: () => void;
};

export function AppSidebar({
  selectedTool,
  collapsed,
  animating,
  onExpand,
  onCollapse,
  onNavigate,
  onCopyrightClick,
}: AppSidebarProps) {
  const { t } = useTranslation("navigation");

  return (
    <aside
      className={`tm-sidebar tm-glass-card${collapsed ? " tm-sidebar--collapsed" : ""}${
        animating ? " tm-sidebar--animating" : ""
      }`}
      aria-label={t("applicationAria")}
    >
      <GlassFrost />
      <div className="tm-sidebar-scroll">
        <button
          type="button"
          className={`tm-shell-panel-title tm-nav-btn tm-nav-btn-sky${
            collapsed && !animating ? " tm-sidebar-rail-btn" : ""
          }`}
          onClick={animating ? undefined : collapsed ? onExpand : onCollapse}
          aria-expanded={!collapsed}
          aria-label={
            collapsed ? t("expandPanelAria") : t("collapsePanelAria")
          }
          disabled={animating}
        >
          <span className="tm-nav-btn-icon" aria-hidden>
            <Compass size={16} strokeWidth={1.85} />
          </span>
          <span className="tm-nav-btn-copy">
            <span className="tm-shell-panel-title-eyebrow">{t("title")}</span>
            <span className="tm-shell-panel-title-name">{t("common:productName")}</span>
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
        >
          <span className="tm-nav-btn-icon" aria-hidden>
            <House size={17} strokeWidth={1.85} />
          </span>
          <span className="tm-nav-btn-copy">
            <span className="tm-nav-btn-label">{t("home")}</span>
            <span className="tm-nav-btn-hint">{t("homeHint")}</span>
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
                <span className="tm-sidebar-group-title">{t(section.title)}</span>
              </div>

              <div className="tm-sidebar-group-items" role="list">
                {section.tools.map((tool) => {
                  const ToolIcon = tool.icon;
                  const isActive = selectedTool === tool.id;
                  const isUpcoming = tool.upcoming === true;
                  const toolLabel = t(tool.shortLabel ?? tool.label);
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      className={`tm-nav-btn tm-nav-btn-${section.accent}${
                        isActive ? " active" : ""
                      }${tool.featured ? " tm-nav-btn-featured" : ""}${
                        isUpcoming ? " tm-nav-btn-upcoming" : ""
                      }`}
                      onClick={() => {
                        if (!isUpcoming) {
                          onNavigate(tool.id);
                        }
                      }}
                      disabled={isUpcoming}
                      aria-disabled={isUpcoming || undefined}
                      role="listitem"
                      aria-label={toolLabel}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span className="tm-nav-btn-icon" aria-hidden>
                        <ToolIcon size={16} strokeWidth={1.85} />
                      </span>
                      <span className="tm-nav-btn-label">
                        {toolLabel}
                      </span>
                      {isUpcoming ? (
                        <span className="tm-nav-btn-upcoming-badge" aria-hidden>
                          {t("comingSoonBadge")}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="tm-sidebar-footer">
        <button
          type="button"
          className={`tm-nav-btn tm-nav-btn-sky tm-sidebar-settings${
            selectedTool === "settings" ? " active" : ""
          }`}
          aria-label={t("settings")}
          aria-current={selectedTool === "settings" ? "page" : undefined}
          onClick={() => onNavigate("settings")}
        >
          <span className="tm-nav-btn-icon" aria-hidden>
            <Settings2 size={16} strokeWidth={1.85} />
          </span>
          <span className="tm-nav-btn-label">{t("settings")}</span>
        </button>

        <button
          type="button"
          className="tm-nav-btn tm-nav-btn-sky tm-sidebar-copyright"
          aria-label={t("copyrightAria")}
          aria-haspopup="dialog"
          onClick={onCopyrightClick}
        >
          <span className="tm-nav-btn-icon" aria-hidden>
            <span className="tm-sidebar-copyright-glyph">©</span>
          </span>
          <span className="tm-nav-btn-label">
            {COPYRIGHT_HOLDER} {COPYRIGHT_YEAR}
          </span>
        </button>
      </div>
    </aside>
  );
}
