import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { GripVertical } from "lucide-react";
import type { InstalledPack } from "../domain/packInstaller";
import {
  beginPackLibraryDrag,
  consumePackLibraryDrag,
  endPackLibraryDrag,
} from "../utils/packLibraryDrag";

export const PACK_LIBRARY_DROP_EVENT = "tm-pack-library-drop";
const DRAG_THRESHOLD_PX = 8;

function clearPackDropHighlight(): void {
  document
    .querySelectorAll(".tm-pack-applied-list.is-drop-active")
    .forEach((element) => element.classList.remove("is-drop-active"));
}

function updatePackDropHighlight(clientX: number, clientY: number): void {
  clearPackDropHighlight();
  const dropTarget = document
    .elementFromPoint(clientX, clientY)
    ?.closest("[data-pack-applied-drop]");
  dropTarget
    ?.querySelector(".tm-pack-applied-list")
    ?.classList.add("is-drop-active");
}

type DragSourceOptions = {
  pack: InstalledPack;
  disabled?: boolean;
  onTap?: () => void;
};

export function usePackLibraryDragSource({
  pack,
  disabled = false,
  onTap,
}: DragSourceOptions): {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
} {
  const packRef = useRef(pack);
  packRef.current = pack;

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const interactive = target?.closest("button, a, input, textarea, select, label");
      // Allow drag when the interactive element is the handle itself (dedicated drag buttons).
      if (interactive && interactive !== event.currentTarget) {
        return;
      }

      event.preventDefault();

      const captureEl = event.currentTarget;
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let dragging = false;

      const cleanup = (): void => {
        captureEl.removeEventListener("pointermove", onPointerMove);
        captureEl.removeEventListener("pointerup", onPointerUp);
        captureEl.removeEventListener("pointercancel", onPointerCancel);
        document.body.classList.remove("tm-pack-library-dragging");
        clearPackDropHighlight();
        try {
          captureEl.releasePointerCapture(pointerId);
        } catch {
          // Pointer may already be released.
        }
      };

      const onPointerMove = (moveEvent: PointerEvent): void => {
        if (moveEvent.pointerId !== pointerId) {
          return;
        }
        if (!dragging) {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
            return;
          }
          dragging = true;
          try {
            captureEl.setPointerCapture(pointerId);
          } catch {
            // setPointerCapture may fail in some environments.
          }
          beginPackLibraryDrag(packRef.current);
          document.body.classList.add("tm-pack-library-dragging");
        }
        updatePackDropHighlight(moveEvent.clientX, moveEvent.clientY);
      };

      const onPointerUp = (upEvent: PointerEvent): void => {
        if (upEvent.pointerId !== pointerId) {
          return;
        }
        cleanup();

        if (dragging) {
          const dropTarget = document
            .elementFromPoint(upEvent.clientX, upEvent.clientY)
            ?.closest("[data-pack-applied-drop]");
          const draggedPack = consumePackLibraryDrag();
          if (dropTarget && draggedPack) {
            window.dispatchEvent(
              new CustomEvent<InstalledPack>(PACK_LIBRARY_DROP_EVENT, {
                detail: draggedPack,
              }),
            );
          } else {
            endPackLibraryDrag();
          }
          return;
        }

        onTap?.();
      };

      const onPointerCancel = (upEvent: PointerEvent): void => {
        if (upEvent.pointerId !== pointerId) {
          return;
        }
        cleanup();
        if (dragging) {
          endPackLibraryDrag();
        }
      };

      captureEl.addEventListener("pointermove", onPointerMove);
      captureEl.addEventListener("pointerup", onPointerUp);
      captureEl.addEventListener("pointercancel", onPointerCancel);
    },
    [disabled, onTap],
  );

  return { onPointerDown };
}

export function usePackLibraryDropListener(
  onDrop: (pack: InstalledPack) => void,
): void {
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    const handler = (event: Event): void => {
      const custom = event as CustomEvent<InstalledPack>;
      if (custom.detail) {
        onDropRef.current(custom.detail);
      }
    };
    window.addEventListener(PACK_LIBRARY_DROP_EVENT, handler);
    return () => {
      window.removeEventListener(PACK_LIBRARY_DROP_EVENT, handler);
    };
  }, []);
}

export function packAppliedDropZoneProps(): Record<string, string> {
  return { "data-pack-applied-drop": "true" };
}

type PackLibraryDragSurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "li";
  pack: InstalledPack;
  disabled?: boolean;
  onTap?: () => void;
  children: ReactNode;
};

export function PackLibraryDragSurface({
  as: Component = "div",
  pack,
  disabled = false,
  onTap,
  className,
  children,
  ...rest
}: PackLibraryDragSurfaceProps): React.ReactElement {
  const { onPointerDown } = usePackLibraryDragSource({ pack, disabled, onTap });
  return createElement(Component, { className, onPointerDown, ...rest }, children);
}

type PackLibraryDragHandleProps = {
  pack: InstalledPack;
  disabled?: boolean;
  className?: string;
  ariaLabel: string;
  iconSize?: number;
};

/** Dedicated touch-friendly drag handle — does not steal taps from sibling controls. */
export function PackLibraryDragHandle({
  pack,
  disabled = false,
  className,
  ariaLabel,
  iconSize = 14,
}: PackLibraryDragHandleProps): React.ReactElement {
  const { onPointerDown } = usePackLibraryDragSource({ pack, disabled });
  return createElement(
    "button",
    {
      type: "button",
      className,
      "aria-label": ariaLabel,
      disabled,
      onPointerDown,
    },
    createElement(GripVertical, {
      size: iconSize,
      strokeWidth: 2,
      "aria-hidden": true,
    }),
  );
}
