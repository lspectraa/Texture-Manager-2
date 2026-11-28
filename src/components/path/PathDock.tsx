import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { PATH_DOCK_TOOLS } from "../../config/pathHome";
import { getToolAccent, isUpcomingTool, type AppToolId } from "../../config/toolNavigation";
import { DOCK_HOME_ICON_MARKUP, DOCK_SETTINGS_ICON_MARKUP, PATH_TOOL_ICON_MARKUP } from "./pathArt";

export type PathDockTarget = "home" | "settings" | AppToolId;

type PathDockProps = {
  /** Current page. */
  current: "home" | "settings" | "about" | AppToolId;
  /** Highlighted tool: the home preview on Home, else the open tool. */
  activeTool: AppToolId | null;
  onNavigate: (target: PathDockTarget) => void;
  /** Hover / focus preview — only wired on Home. */
  onPreview?: (toolId: AppToolId) => void;
  entering?: boolean;
};

/** Pointer travel (px) before a press on the strip becomes a drag-scroll instead of a click. */
const DRAG_THRESHOLD_PX = 4;
/** Arrow buttons page the strip by this many chips. */
const ARROW_PAGE_ITEMS = 3;
/** Scroll-edge tolerance (px) before an arrow / fade is considered active. */
const EDGE_EPSILON_PX = 2;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * PC bottom dock (SPEC §5.2): Home pinned left, scrolling tool chips (arrows, drag, wheel),
 * Settings pinned right. No wash above it — a hairline rim only. Not rendered on Android.
 */
export function PathDock({ current, activeTool, onNavigate, onPreview, entering }: PathDockProps) {
  const { t } = useTranslation("navigation");
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startLeft: number; moved: boolean } | null>(
    null,
  );
  const suppressClickRef = useRef(false);
  const firstScrollRef = useRef(true);

  const updateEdges = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const left = scroller.scrollLeft;
    setEdges((previous) => {
      const next = { left: left > EDGE_EPSILON_PX, right: left < max - EDGE_EPSILON_PX };
      return previous.left === next.left && previous.right === next.right ? previous : next;
    });
  }, []);

  useLayoutEffect(() => {
    updateEdges();
    const scroller = scrollerRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateEdges);
      return () => window.removeEventListener("resize", updateEdges);
    }
    const observer = new ResizeObserver(updateEdges);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [updateEdges]);

  // Keep the active chip in view (centered) when the page or preview changes.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !activeTool) {
      return;
    }
    const chip = scroller.querySelector<HTMLElement>(`[data-tool-id="${activeTool}"]`);
    if (!chip) {
      return;
    }
    const target = chip.offsetLeft - (scroller.clientWidth - chip.offsetWidth) / 2;
    const instant = firstScrollRef.current || prefersReducedMotion();
    firstScrollRef.current = false;
    scroller.scrollTo({ left: Math.max(0, target), behavior: instant ? "auto" : "smooth" });
  }, [activeTool, current]);

  // Vertical wheel scrolls the strip sideways (non-passive so the page does not scroll).
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) >= Math.abs(event.deltaX) && scroller.scrollWidth > scroller.clientWidth) {
        event.preventDefault();
        scroller.scrollLeft += event.deltaY;
      }
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, []);

  const pageBy = (direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const chip = scroller.querySelector<HTMLElement>(".tm-dock-item");
    const step = (chip ? chip.getBoundingClientRect().width : 104) + 4;
    scroller.scrollBy({
      left: direction * step * ARROW_PAGE_ITEMS,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startLeft: scroller.scrollLeft,
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const scroller = scrollerRef.current;
    if (!drag || !scroller || drag.pointerId !== event.pointerId) {
      return;
    }
    const delta = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(delta) < DRAG_THRESHOLD_PX) {
      return;
    }
    if (!drag.moved) {
      drag.moved = true;
      setDragging(true);
      scroller.setPointerCapture(event.pointerId);
    }
    scroller.scrollLeft = drag.startLeft - delta;
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (drag.moved) {
      suppressClickRef.current = true;
      scrollerRef.current?.releasePointerCapture?.(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  const onHome = current === "home";
  const onSettings = current === "settings";

  return (
    <nav
      className={`tm-dock${entering ? " is-entering" : ""}`}
      aria-label={t("dock.aria")}
      data-tool-acc={activeTool ? getToolAccent(activeTool) : undefined}
    >
      <button
        type="button"
        className={`tm-dock-item tm-dock-home${onHome ? " is-here" : ""}`}
        aria-current={onHome ? "page" : undefined}
        onClick={() => onNavigate("home")}
      >
        <span className="tm-dock-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: DOCK_HOME_ICON_MARKUP }} />
        </span>
        <span className="tm-dock-lab">{t("home")}</span>
      </button>
      <button
        type="button"
        className="tm-dock-arrow"
        aria-label={t("dock.scrollPrevAria")}
        disabled={!edges.left}
        onClick={() => pageBy(-1)}
      >
        {"‹"}
      </button>
      <div
        className={`tm-dock-viewport${edges.left ? " show-left" : ""}${edges.right ? " show-right" : ""}`}
      >
        <div className="tm-dock-fade left" aria-hidden="true" />
        <div
          ref={scrollerRef}
          className={`tm-dock-scroller${dragging ? " is-dragging" : ""}`}
          onScroll={updateEdges}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClickCapture={(event) => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          {PATH_DOCK_TOOLS.map(({ tool, accent }) => {
            const isOn = tool.id === activeTool;
            const upcoming = isUpcomingTool(tool.id);
            return (
              <button
                key={tool.id}
                type="button"
                data-tool-id={tool.id}
                className={`tm-dock-item tm-acc-${accent}${isOn ? " is-on" : ""}`}
                aria-current={isOn && current === tool.id ? "page" : undefined}
                disabled={upcoming}
                title={t(tool.label)}
                onPointerEnter={onPreview ? () => onPreview(tool.id) : undefined}
                onFocus={onPreview ? () => onPreview(tool.id) : undefined}
                onClick={() => onNavigate(tool.id)}
              >
                <span className="tm-dock-ico" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    dangerouslySetInnerHTML={{ __html: PATH_TOOL_ICON_MARKUP[tool.id] }}
                  />
                </span>
                <span className="tm-dock-lab">{t(tool.dockLabel ?? tool.label)}</span>
              </button>
            );
          })}
        </div>
        <div className="tm-dock-fade right" aria-hidden="true" />
      </div>
      <button
        type="button"
        className="tm-dock-arrow"
        aria-label={t("dock.scrollNextAria")}
        disabled={!edges.right}
        onClick={() => pageBy(1)}
      >
        {"›"}
      </button>
      <button
        type="button"
        className={`tm-dock-item tm-dock-settings${onSettings ? " is-here" : ""}`}
        aria-current={onSettings ? "page" : undefined}
        onClick={() => onNavigate("settings")}
      >
        <span className="tm-dock-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: DOCK_SETTINGS_ICON_MARKUP }} />
        </span>
        <span className="tm-dock-lab">{t("settings")}</span>
      </button>
    </nav>
  );
}
