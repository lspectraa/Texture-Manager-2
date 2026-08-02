import { useEffect, useRef } from "react";
import {
  FolderOpen,
  Scissors,
  Shuffle,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { InstalledPack } from "../../domain/packInstaller";

export type PackLibraryContextAction =
  | "openFolder"
  | "convert"
  | "port"
  | "split"
  | "delete";

type PackLibraryContextMenuProps = {
  pack: InstalledPack;
  x: number;
  y: number;
  disabled?: boolean;
  onAction: (action: PackLibraryContextAction) => void;
  onClose: () => void;
};

const MENU_ITEMS: {
  action: PackLibraryContextAction;
  icon: typeof FolderOpen;
  labelKey: string;
  danger?: boolean;
}[] = [
  {
    action: "openFolder",
    icon: FolderOpen,
    labelKey: "packInstaller.libraryActionOpenFolder",
  },
  {
    action: "convert",
    icon: WandSparkles,
    labelKey: "packInstaller.libraryActionConvert",
  },
  {
    action: "port",
    icon: Shuffle,
    labelKey: "packInstaller.libraryActionPort",
  },
  {
    action: "split",
    icon: Scissors,
    labelKey: "packInstaller.libraryActionSplit",
  },
  {
    action: "delete",
    icon: Trash2,
    labelKey: "packInstaller.libraryActionDelete",
    danger: true,
  },
];

export function PackLibraryContextMenu({
  pack,
  x,
  y,
  disabled = false,
  onAction,
  onClose,
}: PackLibraryContextMenuProps) {
  const { t } = useTranslation("tools");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const onPointerDown = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [onClose]);

  useEffect(() => {
    const el = menuRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let nextX = x;
    let nextY = y;
    if (nextX + rect.width > window.innerWidth - pad) {
      nextX = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (nextY + rect.height > window.innerHeight - pad) {
      nextY = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    el.style.left = `${nextX}px`;
    el.style.top = `${nextY}px`;
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="tm-pack-library-context-menu"
      role="menu"
      aria-label={t("packInstaller.libraryContextMenu")}
      style={{ left: x, top: y }}
      data-pack-id={pack.id}
    >
      {MENU_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.action}
            type="button"
            role="menuitem"
            className={`tm-pack-library-context-item${
              item.danger ? " tm-pack-library-context-item-danger" : ""
            }`}
            disabled={disabled}
            onClick={() => {
              onAction(item.action);
              onClose();
            }}
          >
            <Icon size={14} />
            <span>{t(item.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
