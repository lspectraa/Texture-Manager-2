import { House, Settings2 } from "lucide-react";
import { useRef, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  AppToolId,
  TOOL_NAV_SECTIONS,
  getToolSection,
  isToolListedOnMobile,
  isToolUnavailableOnMobile,
  type ToolNavSection,
} from "../../config/toolNavigation";
import { GlassFrost } from "../GlassFrost";

export type MobileNavTarget = "home" | "settings" | AppToolId;

type MobileBottomDockProps = {
  selectedTool: MobileNavTarget;
  onNavigate: (tool: MobileNavTarget) => void;
  onExpandGrid: () => void;
};

function currentSection(
  selectedTool: MobileNavTarget,
): ToolNavSection | undefined {
  if (selectedTool === "home" || selectedTool === "settings") {
    return undefined;
  }
  return getToolSection(selectedTool);
}

export function MobileBottomDock({
  selectedTool,
  onNavigate,
  onExpandGrid,
}: MobileBottomDockProps) {
  const { t } = useTranslation("navigation");
  const section = currentSection(selectedTool);
  const swipeStartY = useRef<number | null>(null);

  const onHandlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    swipeStartY.current = event.clientY;
  };

  const onHandlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const startY = swipeStartY.current;
    swipeStartY.current = null;
    if (startY != null && startY - event.clientY > 36) {
      onExpandGrid();
    }
  };

  return (
    <nav className="tm-mobile-dock tm-glass-card" aria-label={t("applicationAria")}>
      <GlassFrost />
      <button
        type="button"
        className="tm-mobile-dock-handle"
        aria-label={t("mobile.expandAllToolsAria")}
        onClick={onExpandGrid}
        onPointerDown={onHandlePointerDown}
        onPointerUp={onHandlePointerUp}
      >
        <span className="tm-mobile-dock-handle-bar" aria-hidden />
      </button>
      <div className="tm-mobile-dock-row">
        <button
          type="button"
          className={`tm-mobile-dock-btn${selectedTool === "home" ? " is-active" : ""}`}
          aria-current={selectedTool === "home" ? "page" : undefined}
          aria-label={t("home")}
          onClick={() => onNavigate("home")}
        >
          <House size={20} strokeWidth={1.85} aria-hidden />
        </button>

        {section ? (
          section.tools
            .filter((tool) => isToolListedOnMobile(tool.id))
            .map((tool) => {
            const ToolIcon = tool.icon;
            const unavailable = isToolUnavailableOnMobile(tool.id);
            const isActive = selectedTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                className={`tm-mobile-dock-btn tm-mobile-dock-btn-${section.accent}${
                  isActive ? " is-active" : ""
                }`}
                disabled={unavailable}
                aria-current={isActive ? "page" : undefined}
                aria-label={t(tool.shortLabel ?? tool.label)}
                onClick={() => {
                  if (!unavailable) {
                    onNavigate(tool.id);
                  }
                }}
              >
                <ToolIcon size={20} strokeWidth={1.85} aria-hidden />
              </button>
            );
          })
        ) : (
          TOOL_NAV_SECTIONS.map((group) => {
            const GroupIcon = group.icon;
            return (
              <button
                key={group.id}
                type="button"
                className={`tm-mobile-dock-btn tm-mobile-dock-btn-${group.accent}`}
                aria-label={t(group.title)}
                onClick={() => {
                  const first = group.tools.find(
                    (tool) => !isToolUnavailableOnMobile(tool.id),
                  );
                  if (first) {
                    onNavigate(first.id);
                  }
                }}
              >
                <GroupIcon size={20} strokeWidth={1.85} aria-hidden />
              </button>
            );
          })
        )}

        <button
          type="button"
          className={`tm-mobile-dock-btn${selectedTool === "settings" ? " is-active" : ""}`}
          aria-current={selectedTool === "settings" ? "page" : undefined}
          aria-label={t("settings")}
          onClick={() => onNavigate("settings")}
        >
          <Settings2 size={20} strokeWidth={1.85} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
