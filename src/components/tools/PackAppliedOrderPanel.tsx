import {
  GripVertical,
  ImageOff,
  PackageOpen,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AppliedPackEntry,
  InstalledPack,
  PackInstallerBridge,
} from "../../domain/packInstaller";
import {
  PackLibraryDragHandle,
  packAppliedDropZoneProps,
} from "../../hooks/usePackLibraryPointerDrag";
import { isMobileShell } from "../../utils/platform";

type PackAppliedOrderPanelProps = {
  bridge: PackInstallerBridge;
  libraryPacks: InstalledPack[];
  libraryPreviews: Record<string, string | null>;
  onAppliedEntriesChange: (entries: AppliedPackEntry[]) => void;
  onAddPack: (pack: InstalledPack) => void;
};

function libraryPackTitle(pack: InstalledPack): string {
  const name = pack.metadata?.name?.trim();
  return name || pack.folderName;
}

function moveEntry(
  entries: AppliedPackEntry[],
  from: number,
  to: number,
): AppliedPackEntry[] {
  if (from === to || from < 0 || to < 0 || from >= entries.length || to >= entries.length) {
    return entries;
  }
  const next = [...entries];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function PackAppliedOrderPanel({
  bridge,
  libraryPacks,
  libraryPreviews,
  onAppliedEntriesChange,
  onAddPack,
}: PackAppliedOrderPanelProps) {
  const { t } = useTranslation("tools");
  const mobileShell = isMobileShell();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dropIndexRef = useRef<number | null>(null);

  const appliedFolderNames = new Set(bridge.appliedEntries.map((entry) => entry.folderName));
  const availablePacks = libraryPacks.filter((pack) => !appliedFolderNames.has(pack.folderName));

  const updateEntries = useCallback(
    (entries: AppliedPackEntry[]) => {
      onAppliedEntriesChange(entries);
    },
    [onAppliedEntriesChange],
  );

  const removeEntry = (index: number): void => {
    updateEntries(bridge.appliedEntries.filter((_, i) => i !== index));
  };

  const finishDrag = useCallback(
    (from: number | null, to: number | null) => {
      dragPointerIdRef.current = null;
      dropIndexRef.current = null;
      setDragIndex(null);
      setDropIndex(null);
      if (from === null || to === null) {
        return;
      }
      updateEntries(moveEntry(bridge.appliedEntries, from, to));
    },
    [bridge.appliedEntries, updateEntries],
  );

  const setDropIndexBoth = (index: number | null): void => {
    dropIndexRef.current = index;
    setDropIndex(index);
  };

  if (!bridge.appliedSupported) {
    return (
      <div className="tm-pack-meta tm-pack-meta-empty">
        <p className="tm-pack-meta-empty-title">{t("packInstaller.appliedUnsupportedTitle")}</p>
        <p className="tm-pack-meta-empty-hint">{t("packInstaller.appliedUnsupportedHint")}</p>
      </div>
    );
  }

  return (
    <div className="tm-pack-applied" {...packAppliedDropZoneProps()}>
      <header className="tm-pack-meta-head">
        <span className="tm-pack-meta-head-icon" aria-hidden>
          <PackageOpen size={16} strokeWidth={1.85} />
        </span>
        <div>
          <h3 className="tm-pack-meta-title">{t("packInstaller.appliedPanelTitle")}</h3>
        </div>
      </header>

      <div className="tm-pack-applied-list">
        {bridge.appliedEntries.length === 0 ? (
          <p className="tm-pack-applied-empty">{t("packInstaller.appliedEmpty")}</p>
        ) : (
          bridge.appliedEntries.map((entry, index) => {
            const preview =
              libraryPreviews[`library:${entry.folderName}`] ??
              (entry.packPngPath ? libraryPreviews[entry.folderName] : null);
            const isDragging = dragIndex === index;
            const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;

            return (
              <div
                key={`${entry.folderName}-${index}`}
                className={`tm-pack-applied-row${isDragging ? " is-dragging" : ""}${
                  isDropTarget ? " is-drop-target" : ""
                }${entry.missing ? " is-missing" : ""}`}
                onDragOver={(event) => {
                  if (dragIndex !== null) {
                    event.preventDefault();
                    setDropIndexBoth(index);
                  }
                }}
              >
                <span className="tm-pack-applied-index" aria-hidden>
                  {index + 1}
                </span>
                <button
                  type="button"
                  className="tm-pack-applied-grip tm-pack-applied-drag-zone"
                  aria-label={t("packInstaller.appliedDragHandleAria")}
                  onPointerDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }
                    event.preventDefault();
                    dragPointerIdRef.current = event.pointerId;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDragIndex(index);
                    setDropIndexBoth(index);
                  }}
                  onPointerMove={(event) => {
                    if (dragPointerIdRef.current !== event.pointerId || dragIndex === null) {
                      return;
                    }
                    const target = document.elementFromPoint(event.clientX, event.clientY);
                    const row = target?.closest<HTMLElement>(".tm-pack-applied-row");
                    if (!row) {
                      return;
                    }
                    const rows = Array.from(
                      row.parentElement?.querySelectorAll(".tm-pack-applied-row") ?? [],
                    );
                    const nextIndex = rows.indexOf(row);
                    if (nextIndex >= 0) {
                      setDropIndexBoth(nextIndex);
                    }
                  }}
                  onPointerUp={(event) => {
                    if (dragPointerIdRef.current !== event.pointerId) {
                      return;
                    }
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    finishDrag(dragIndex, dropIndexRef.current);
                  }}
                  onPointerCancel={(event) => {
                    if (dragPointerIdRef.current !== event.pointerId) {
                      return;
                    }
                    finishDrag(null, null);
                  }}
                >
                  <GripVertical size={mobileShell ? 18 : 14} strokeWidth={2} aria-hidden />
                </button>

                <div className="tm-pack-applied-preview">
                  {preview ? (
                    <img className="tm-pack-applied-thumb" src={preview} alt="" />
                  ) : (
                    <div className="tm-pack-applied-thumb-missing" aria-hidden>
                      <ImageOff size={16} strokeWidth={1.6} />
                    </div>
                  )}
                </div>

                <div className="tm-pack-applied-copy">
                  <span className="tm-pack-applied-name">{entry.displayName}</span>
                  {entry.missing ? (
                    <span className="tm-pack-applied-missing">
                      {t("packInstaller.appliedMissingPack")}
                    </span>
                  ) : null}
                </div>

                <button
                  type="button"
                  className="tm-pack-applied-remove"
                  aria-label={t("packInstaller.appliedRemoveAria", { name: entry.displayName })}
                  onClick={() => removeEntry(index)}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {availablePacks.length > 0 ? (
        <section className="tm-pack-applied-available">
          <h4 className="tm-pack-applied-available-title">
            {t("packInstaller.appliedAvailableTitle")}
          </h4>
          <ul className="tm-pack-applied-available-list">
            {availablePacks.map((pack) => {
              const preview = libraryPreviews[pack.id];
              return (
                <li key={pack.id} className="tm-pack-applied-available-item">
                  <PackLibraryDragHandle
                    pack={pack}
                    className="tm-pack-applied-grip tm-pack-applied-drag-zone tm-pack-applied-available-drag"
                    ariaLabel={t("packInstaller.appliedDragToAddAria")}
                    iconSize={mobileShell ? 18 : 14}
                  />
                  <div className="tm-pack-applied-available-main">
                    <div className="tm-pack-applied-preview">
                      {preview ? (
                        <img className="tm-pack-applied-thumb" src={preview} alt="" draggable={false} />
                      ) : (
                        <div className="tm-pack-applied-thumb-missing" aria-hidden>
                          <PackageOpen size={16} strokeWidth={1.5} />
                        </div>
                      )}
                    </div>
                    <span className="tm-pack-applied-name">{libraryPackTitle(pack)}</span>
                  </div>
                  <button
                    type="button"
                    className="tm-tool-path-browse tm-pack-applied-add-btn"
                    draggable={false}
                    onClick={() => onAddPack(pack)}
                  >
                    <Plus size={14} />
                    {t("packInstaller.appliedAddPack")}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
