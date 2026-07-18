import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type AppSelectOption<T extends string = string> = {
  value: T;
  label: string;
  /** Optional secondary line under the label. */
  description?: string;
  /** Leading visual (flag, icon, swatch). */
  leading?: ReactNode;
  disabled?: boolean;
};

type AppSelectProps<T extends string = string> = {
  value: T;
  options: readonly AppSelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name when no visible label is associated. */
  "aria-label"?: string;
  /** Id of an external label element. */
  "aria-labelledby"?: string;
  disabled?: boolean;
  className?: string;
  /** Larger trigger + option rows (language picker). */
  size?: "sm" | "md";
  /**
   * Render the menu at the document root for controls inside clipped panels.
   * Inline menus are more reliable in Tauri/WebView2 and should be preferred.
   */
  portal?: boolean;
};

type MenuPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "below" | "above";
};

export function AppSelect<T extends string = string>({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  disabled = false,
  className,
  size = "sm",
  portal = false,
}: AppSelectProps<T>) {
  const listboxId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const selected =
    options.find((option) => option.value === value) ?? options[0];
  const enabledIndexes = useMemo(
    () =>
      options
        .map((option, index) => (option.disabled ? -1 : index))
        .filter((index) => index >= 0),
    [options],
  );

  const updateMenuPosition = () => {
    const trigger = wrapRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const gap = 8;
    const viewportPadding = 8;
    const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
    const spaceAbove = rect.top - gap - viewportPadding;
    const preferredMax = size === "md" ? 320 : 260;
    const placeBelow = spaceBelow >= 140 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(
      120,
      Math.min(preferredMax, placeBelow ? spaceBelow : spaceAbove),
    );
    setMenuPosition(
      placeBelow
        ? {
            top: rect.bottom + gap,
            left: rect.left,
            width: rect.width,
            maxHeight,
            placement: "below",
          }
        : {
            bottom: window.innerHeight - rect.top + gap,
            left: rect.left,
            width: rect.width,
            maxHeight,
            placement: "above",
          },
    );
  };

  useLayoutEffect(() => {
    if (!isOpen || !portal) {
      setMenuPosition(null);
      return;
    }
    updateMenuPosition();
    const onReposition = () => updateMenuPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [isOpen, options.length, portal, size]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const selectedIndex = options.findIndex((option) => option.value === value);
    setHighlightIndex(
      selectedIndex >= 0 && !options[selectedIndex]?.disabled
        ? selectedIndex
        : (enabledIndexes[0] ?? -1),
    );
  }, [enabledIndexes, isOpen, options, value]);

  const moveHighlight = (direction: 1 | -1) => {
    if (enabledIndexes.length === 0) {
      return;
    }
    const currentPos = enabledIndexes.indexOf(highlightIndex);
    const nextPos =
      currentPos < 0
        ? direction === 1
          ? 0
          : enabledIndexes.length - 1
        : (currentPos + direction + enabledIndexes.length) %
          enabledIndexes.length;
    setHighlightIndex(enabledIndexes[nextPos] ?? -1);
  };

  const commitIndex = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) {
      return;
    }
    onChange(option.value);
    setIsOpen(false);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
      case "Enter":
      case " ":
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          if (highlightIndex >= 0) {
            commitIndex(highlightIndex);
          }
          return;
        }
        moveHighlight(event.key === "ArrowDown" ? 1 : -1);
        break;
      case "Home":
        event.preventDefault();
        if (enabledIndexes[0] !== undefined) {
          setHighlightIndex(enabledIndexes[0]);
        }
        break;
      case "End":
        event.preventDefault();
        {
          const last = enabledIndexes[enabledIndexes.length - 1];
          if (last !== undefined) {
            setHighlightIndex(last);
          }
        }
        break;
      case "Escape":
        if (isOpen) {
          event.preventDefault();
          setIsOpen(false);
        }
        break;
      default:
        break;
    }
  };

  const menuStyle: CSSProperties | undefined = menuPosition
    ? {
        position: "fixed",
        top: menuPosition.top,
        bottom: menuPosition.bottom,
        left: menuPosition.left,
        width: menuPosition.width,
        maxHeight: menuPosition.maxHeight,
      }
    : undefined;

  const menuContent = isOpen ? (
    <div
      id={listboxId}
      ref={menuRef}
      className={`tm-app-select-menu${
        portal && menuPosition
          ? ` tm-app-select-menu--portal tm-app-select-menu--${menuPosition.placement}`
          : ""
      }`}
      role="listbox"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      style={portal ? menuStyle : undefined}
    >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isHighlighted = index === highlightIndex;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                className={`tm-app-select-option${
                  isSelected ? " is-selected" : ""
                }${isHighlighted ? " is-highlighted" : ""}`}
                onMouseEnter={() => {
                  if (!option.disabled) {
                    setHighlightIndex(index);
                  }
                }}
                onClick={() => commitIndex(index)}
              >
                {option.leading ? (
                  <span className="tm-app-select-leading" aria-hidden>
                    {option.leading}
                  </span>
                ) : null}
                <span className="tm-app-select-copy">
                  <span className="tm-app-select-label">{option.label}</span>
                  {option.description ? (
                    <span className="tm-app-select-description">
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {isSelected ? (
                  <Check
                    className="tm-app-select-check"
                    size={16}
                    strokeWidth={2.4}
                    aria-hidden
                  />
                ) : (
                  <span className="tm-app-select-check-spacer" aria-hidden />
                )}
              </button>
            );
          })}
    </div>
  ) : null;

  const menu =
    portal && menuPosition && menuContent
      ? createPortal(menuContent, document.body)
      : portal
        ? null
        : menuContent;

  return (
    <div
      className={`tm-app-select tm-app-select--${size}${
        isOpen ? " is-open" : ""
      }${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}
      ref={wrapRef}
    >
      <button
        type="button"
        className="tm-app-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onClick={() => {
          if (!disabled) {
            setIsOpen((prev) => !prev);
          }
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="tm-app-select-value">
          {selected?.leading ? (
            <span className="tm-app-select-leading" aria-hidden>
              {selected.leading}
            </span>
          ) : null}
          <span className="tm-app-select-copy">
            <span className="tm-app-select-label">{selected?.label ?? value}</span>
            {selected?.description ? (
              <span className="tm-app-select-description">
                {selected.description}
              </span>
            ) : null}
          </span>
        </span>
        <ChevronDown
          className="tm-app-select-caret"
          size={size === "md" ? 18 : 16}
          strokeWidth={2.1}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}
