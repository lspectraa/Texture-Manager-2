import { House, Settings2 } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

function currentSection(
  selectedTool: MobileNavTarget,
): ToolNavSection | undefined {
  if (selectedTool === "home" || selectedTool === "settings") {
    return undefined;
  }
  return getToolSection(selectedTool);
}

/** When a section lists more than 4 mobile tools, show the first 3 in the dock; use the grid for the rest. */
const MOBILE_DOCK_SECTION_TOOL_OVERFLOW = 4;
const MOBILE_DOCK_SECTION_TOOL_CAP = 3;
const HANDLE_DRAG_OPEN_PX = 28;
const HANDLE_DRAG_CLOSE_PX = 72;

function sectionDockTools(section: ToolNavSection) {
  const listed = section.tools.filter((tool) => isToolListedOnMobile(tool.id));
  return listed.length > MOBILE_DOCK_SECTION_TOOL_OVERFLOW
    ? listed.slice(0, MOBILE_DOCK_SECTION_TOOL_CAP)
    : listed;
}

/** Prefer even rows: 4→2×2, 3→3, 2→2, odd leftovers use 2. */
function columnsForCount(count: number): 2 | 3 {
  if (count <= 1) {
    return 2;
  }
  if (count === 3) {
    return 3;
  }
  if (count % 3 === 0) {
    return 3;
  }
  return 2;
}

export function MobileBottomDock({
  selectedTool,
  onNavigate,
  expanded,
  onExpandedChange,
}: MobileBottomDockProps) {
  const { t } = useTranslation("navigation");
  const section = currentSection(selectedTool);
  const panelRef = useRef<HTMLElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const dragMode = useRef<"open" | "close" | null>(null);
  const openedByDragRef = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [entered, setEntered] = useState(expanded);

  useEffect(() => {
    if (expanded) {
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setEntered(true));
      });
      return () => window.cancelAnimationFrame(frame);
    }
    setEntered(false);
    setDragOffset(0);
  }, [expanded]);

  const finishOpen = (): void => {
    onExpandedChange(true);
  };

  const finishClose = (): void => {
    onExpandedChange(false);
  };

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }
    dragStartY.current = event.clientY;
    dragMode.current = expanded ? "close" : "open";
    openedByDragRef.current = false;
    setDragging(true);
    setDragOffset(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const startY = dragStartY.current;
    const mode = dragMode.current;
    if (startY == null || mode == null) {
      return;
    }
    const delta = event.clientY - startY;
    if (mode === "open") {
      const pull = Math.max(0, -delta);
      setDragOffset(-Math.min(pull, 120));
      if (!openedByDragRef.current && pull >= HANDLE_DRAG_OPEN_PX) {
        openedByDragRef.current = true;
        setDragging(false);
        setDragOffset(0);
        dragStartY.current = null;
        dragMode.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        finishOpen();
      }
      return;
    }
    // Close: only allow downward drag.
    const push = Math.max(0, delta);
    setDragOffset(Math.min(push, 280));
  };

  const onHandlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const mode = dragMode.current;
    const offset = dragOffset;
    dragStartY.current = null;
    dragMode.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (mode === "close") {
      if (offset >= HANDLE_DRAG_CLOSE_PX) {
        setDragOffset(0);
        finishClose();
        return;
      }
      setDragOffset(0);
      return;
    }
    setDragOffset(0);
  };

  const onHandlePointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    dragStartY.current = null;
    dragMode.current = null;
    openedByDragRef.current = false;
    setDragging(false);
    setDragOffset(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const panelStyle: CSSProperties | undefined =
    dragging && dragOffset !== 0
      ? {
          transform: `translateY(${Math.max(0, dragOffset)}px)`,
          transition: "none",
        }
      : undefined;

  const handleAria = expanded
    ? t("mobile.closeGridAria")
    : t("mobile.expandAllToolsAria");

  return (
    <div
      className={`tm-mobile-nav-chrome${expanded ? " is-expanded" : ""}${
        entered ? " is-entered" : ""
      }${dragging ? " is-dragging" : ""}`}
    >
      <button
        type="button"
        className={`tm-mobile-nav-backdrop${entered ? " is-open" : ""}`}
        aria-label={t("mobile.closeGridAria")}
        tabIndex={entered ? 0 : -1}
        aria-hidden={!entered}
        onClick={() => {
          if (expanded) {
            finishClose();
          }
        }}
      />

      <nav
        ref={panelRef}
        className="tm-mobile-dock tm-glass-card"
        aria-label={expanded ? t("mobile.allToolsTitle") : t("applicationAria")}
        style={panelStyle}
      >
        <GlassFrost />

        <button
          type="button"
          className="tm-mobile-dock-handle"
          aria-label={handleAria}
          aria-expanded={expanded}
          onClick={() => {
            if (openedByDragRef.current) {
              openedByDragRef.current = false;
              return;
            }
            if (expanded) {
              finishClose();
            } else {
              finishOpen();
            }
          }}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerCancel}
        >
          <span className="tm-mobile-dock-handle-bar" aria-hidden />
        </button>

        <div
          className="tm-mobile-nav-expanded"
          aria-hidden={!expanded}
        >
          <div className="tm-mobile-nav-expanded-inner">
          <header className="tm-mobile-grid-head">
            <div>
              <p className="tm-mobile-grid-eyebrow">{t("title")}</p>
              <h2 className="tm-mobile-grid-title">{t("mobile.allToolsTitle")}</h2>
            </div>
          </header>

          <div className="tm-mobile-grid-scroll">
            <div
              className="tm-mobile-grid-section"
              data-columns={columnsForCount(2)}
            >
              <div className="tm-mobile-grid-tiles">
                <button
                  type="button"
                  className={`tm-mobile-grid-tile${
                    selectedTool === "home" ? " is-active" : ""
                  }`}
                  onClick={() => onNavigate("home")}
                >
                  <span className="tm-mobile-grid-tile-icon" aria-hidden>
                    <House size={20} strokeWidth={1.85} />
                  </span>
                  <span className="tm-mobile-grid-tile-label">{t("home")}</span>
                </button>
                <button
                  type="button"
                  className={`tm-mobile-grid-tile${
                    selectedTool === "settings" ? " is-active" : ""
                  }`}
                  onClick={() => onNavigate("settings")}
                >
                  <span className="tm-mobile-grid-tile-icon" aria-hidden>
                    <Settings2 size={20} strokeWidth={1.85} />
                  </span>
                  <span className="tm-mobile-grid-tile-label">
                    {t("settings")}
                  </span>
                </button>
              </div>
            </div>

            {TOOL_NAV_SECTIONS.map((group) => {
              const SectionIcon = group.icon;
              const tools = group.tools.filter((tool) =>
                isToolListedOnMobile(tool.id),
              );
              if (tools.length === 0) {
                return null;
              }
              const columns = columnsForCount(tools.length);
              return (
                <section
                  key={group.id}
                  className={`tm-mobile-grid-section tm-mobile-grid-section-${group.accent}`}
                  data-columns={columns}
                >
                  <h3 className="tm-mobile-grid-section-title">
                    <SectionIcon size={14} strokeWidth={1.85} aria-hidden />
                    {t(group.title)}
                  </h3>
                  <div className="tm-mobile-grid-tiles">
                    {tools.map((tool) => {
                      const ToolIcon = tool.icon;
                      const unavailable = isToolUnavailableOnMobile(tool.id);
                      const isActive = selectedTool === tool.id;
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          className={`tm-mobile-grid-tile${
                            isActive ? " is-active" : ""
                          }${unavailable ? " is-disabled" : ""}`}
                          disabled={unavailable}
                          onClick={() => {
                            if (!unavailable) {
                              onNavigate(tool.id);
                            }
                          }}
                        >
                          <span className="tm-mobile-grid-tile-icon" aria-hidden>
                            <ToolIcon size={20} strokeWidth={1.85} />
                          </span>
                          <span className="tm-mobile-grid-tile-label">
                            {t(tool.shortLabel ?? tool.label)}
                          </span>
                          {unavailable ? (
                            <em className="tm-mobile-grid-soon">
                              {t("comingSoonBadge")}
                            </em>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          </div>
        </div>

        <div
          className={`tm-mobile-dock-row${entered ? " is-faded" : ""}`}
          aria-hidden={entered}
        >
          <button
            type="button"
            className={`tm-mobile-dock-btn${
              selectedTool === "home" ? " is-active" : ""
            }`}
            aria-current={selectedTool === "home" ? "page" : undefined}
            aria-label={t("home")}
            tabIndex={entered ? -1 : 0}
            onClick={() => onNavigate("home")}
          >
            <House size={20} strokeWidth={1.85} aria-hidden />
          </button>

          {section
            ? sectionDockTools(section).map((tool) => {
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
                    tabIndex={entered ? -1 : 0}
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
            : TOOL_NAV_SECTIONS.map((group) => {
                const GroupIcon = group.icon;
                const sectionLabel = t(group.title);
                const shortcutLabel = t("mobile.sectionShortcutAria", {
                  section: sectionLabel,
                });
                return (
                  <button
                    key={group.id}
                    type="button"
                    className={`tm-mobile-dock-btn tm-mobile-dock-btn-${group.accent}`}
                    aria-label={shortcutLabel}
                    title={shortcutLabel}
                    tabIndex={entered ? -1 : 0}
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
              })}

          <button
            type="button"
            className={`tm-mobile-dock-btn${
              selectedTool === "settings" ? " is-active" : ""
            }`}
            aria-current={selectedTool === "settings" ? "page" : undefined}
            aria-label={t("settings")}
            tabIndex={entered ? -1 : 0}
            onClick={() => onNavigate("settings")}
          >
            <Settings2 size={20} strokeWidth={1.85} aria-hidden />
          </button>
        </div>
      </nav>
    </div>
  );
}
