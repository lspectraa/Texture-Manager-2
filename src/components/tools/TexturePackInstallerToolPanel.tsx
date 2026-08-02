import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileArchive,
  FolderOpen,
  FolderPlus,
  Library,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  Scissors,
  Shuffle,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import convertVersionMap from "../../config/convertVersionMap.json";
import type {
  InstallPlan,
  InstallTreeNode,
  InstallUnit,
  InstallUnitKind,
  InstalledPack,
  PackInstallerBridge,
  PackMetadata,
  PackOperationKind,
} from "../../domain/packInstaller";
import {
  DEFAULT_PACK_METADATA,
  folderNameFromPackName,
} from "../../domain/packInstaller";
import {
  cleanupPackInstallTemp,
  createTexturePack,
  deleteInstalledPack,
  discoverPackInstall,
  getPackPngDataUrl,
  installPackPlan,
  listInstalledPacks,
  runPackOperation,
  updateInstalledPackMetadata,
} from "../../services/tauriPackInstaller";
import { getGameFilesLayout } from "../../services/tauriGeodeButtons";
import { isTauriRuntime } from "../../services/tauriOperations";
import { openPathInOs } from "../../services/tauriSettings";
import { redactAbsolutePathsInText, shortenPathForDisplay } from "../../utils/pathDisplay";
import {
  PackLibraryContextMenu,
  type PackLibraryContextAction,
} from "./PackLibraryContextMenu";
import {
  FolderPathField,
  ToolCheckboxField,
  ToolNumberField,
  ToolPage,
  ToolPageHeader,
  ToolSection,
  ToolSelectField,
  ToolTextField,
} from "./layout";

const CONVERT_VERSION_OPTIONS = Object.keys(convertVersionMap);
const DEFAULT_LIBRARY_SHEET_CONCURRENCY = 5;

export type PackInstallerSidebarActions = {
  browsePackPng: () => void;
  clearPackPng: () => void;
  updateSelectedPackMetadata: (metadata: PackMetadata) => void;
  updateLibraryPackMetadata: (metadata: PackMetadata) => void;
  saveLibraryMetadata: () => void;
};

type TexturePackInstallerToolPanelProps = {
  geometryDashFound: boolean;
  bridge: PackInstallerBridge;
  onBridgeChange: (next: PackInstallerBridge) => void;
  onSidebarActionsChange?: (actions: PackInstallerSidebarActions) => void;
};

type BusyKind = "discover" | "install" | "create" | "library" | "librarySave" | null;
type OverlayState = "working" | "success" | "warning" | "error";
type LibraryActionPanel = "convert" | "port" | "split" | null;

type PackOverlay = {
  state: OverlayState;
  title: string;
  detail?: string | null;
  completed?: number;
  total?: number;
};

type LibraryContextMenuState = {
  pack: InstalledPack;
  x: number;
  y: number;
};

function libraryPackTitle(pack: InstalledPack): string {
  const name = pack.metadata?.name?.trim();
  return name || pack.folderName;
}

function unitKindLabel(kind: InstallUnitKind, t: (key: string) => string): string {
  switch (kind) {
    case "pack":
      return t("packInstaller.kindPack");
    case "configTree":
      return t("packInstaller.kindConfigTree");
    case "mod":
      return t("packInstaller.kindMod");
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function unitKindClass(kind: InstallUnitKind): string {
  switch (kind) {
    case "pack":
      return "tm-pack-unit-kind-pack";
    case "configTree":
      return "tm-pack-unit-kind-config";
    case "mod":
      return "tm-pack-unit-kind-mod";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function isZipPath(path: string): boolean {
  return path.trim().toLowerCase().endsWith(".zip");
}

function isPngPath(path: string): boolean {
  return path.trim().toLowerCase().endsWith(".png");
}

function TreeNodeView({
  node,
  depth,
}: {
  node: InstallTreeNode;
  depth: number;
}) {
  const [openNode, setOpenNode] = useState(depth < 2);
  const hasChildren = Boolean(node.children && node.children.length > 0);

  return (
    <div className="tm-pack-tree-node" style={{ paddingLeft: depth * 12 }}>
      <button
        type="button"
        className="tm-pack-tree-row"
        onClick={() => {
          if (hasChildren) {
            setOpenNode((prev) => !prev);
          }
        }}
        disabled={!hasChildren}
      >
        <span className="tm-pack-tree-chevron" aria-hidden>
          {hasChildren ? (
            openNode ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="tm-pack-tree-leaf-dot" />
          )}
        </span>
        <span className="tm-pack-tree-name">{node.name}</span>
        {node.isDir ? <span className="tm-pack-tree-badge">/</span> : null}
      </button>
      {hasChildren && openNode
        ? node.children!.map((child, index) => (
            <TreeNodeView
              key={`${child.name}-${index}`}
              node={child}
              depth={depth + 1}
            />
          ))
        : null}
    </div>
  );
}

function InstallUnitRow({
  unit,
  selected,
  expanded,
  onToggleEnabled,
  onSelect,
  onToggleExpand,
}: {
  unit: InstallUnit;
  selected: boolean;
  expanded: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onSelect: () => void;
  onToggleExpand: () => void;
}) {
  const { t } = useTranslation("tools");
  const hasTree = Boolean(unit.tree);

  return (
    <div
      className={`tm-pack-unit ${unitKindClass(unit.kind)}${
        selected ? " tm-pack-unit-selected" : ""
      }${unit.enabled ? "" : " tm-pack-unit-disabled"}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="tm-pack-unit-head">
        <label
          className="tm-pack-unit-check"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={unit.enabled}
            onChange={(event) => onToggleEnabled(event.target.checked)}
            aria-label={t("packInstaller.toggleUnit", { label: unit.label })}
          />
        </label>
        <div className="tm-pack-unit-main">
          <span className={`tm-pack-unit-kind ${unitKindClass(unit.kind)}`}>
            {unitKindLabel(unit.kind, t)}
          </span>
          <span className="tm-pack-unit-label">{unit.label}</span>
          {typeof unit.fileCount === "number" ? (
            <span className="tm-pack-unit-count">
              {t("packInstaller.files", { count: unit.fileCount })}
            </span>
          ) : null}
        </div>
        {hasTree ? (
          <button
            type="button"
            className="tm-pack-unit-expand"
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand();
            }}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? t("packInstaller.collapseTree")
                : t("packInstaller.expandTree")
            }
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : null}
      </div>
      <p className="tm-pack-unit-dest" title={unit.destinationPath}>
        → {shortenPathForDisplay(unit.destinationPath)}
      </p>
      {expanded && unit.tree ? (
        <div
          className="tm-pack-unit-tree"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <TreeNodeView node={unit.tree} depth={0} />
        </div>
      ) : null}
    </div>
  );
}

export function TexturePackInstallerToolPanel({
  geometryDashFound,
  bridge,
  onBridgeChange,
  onSidebarActionsChange,
}: TexturePackInstallerToolPanelProps) {
  const { t } = useTranslation(["tools", "errors", "common"]);
  const [plan, setPlan] = useState<InstallPlan | null>(null);
  const [expandedUnitIds, setExpandedUnitIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<BusyKind>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"info" | "success" | "error">("info");
  const [overlay, setOverlay] = useState<PackOverlay | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderNameTouched, setFolderNameTouched] = useState(false);
  const [createdPackDir, setCreatedPackDir] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [extrasExpanded, setExtrasExpanded] = useState(false);
  const [convertToLatestVersion, setConvertToLatestVersion] = useState(false);
  const [convertGameVersion, setConvertGameVersion] = useState(() =>
    CONVERT_VERSION_OPTIONS.includes("2.2")
      ? "2.2"
      : (CONVERT_VERSION_OPTIONS[0] ?? ""),
  );
  const [portPacks, setPortPacks] = useState(false);
  const [portLowGraphics, setPortLowGraphics] = useState(false);
  const [libraryPacks, setLibraryPacks] = useState<InstalledPack[]>([]);
  const [libraryPacksPath, setLibraryPacksPath] = useState<string | null>(null);
  const [libraryPreviews, setLibraryPreviews] = useState<Record<string, string | null>>(
    {},
  );
  const [libraryActionPanel, setLibraryActionPanel] = useState<LibraryActionPanel>(null);
  const [libraryConvertVersion, setLibraryConvertVersion] = useState(() =>
    CONVERT_VERSION_OPTIONS.includes("2.2")
      ? "2.2"
      : (CONVERT_VERSION_OPTIONS[0] ?? ""),
  );
  const [libraryPortLowGraphics, setLibraryPortLowGraphics] = useState(false);
  const [librarySplitOutputDir, setLibrarySplitOutputDir] = useState("");
  const [librarySplitConcurrency, setLibrarySplitConcurrency] = useState(
    DEFAULT_LIBRARY_SHEET_CONCURRENCY,
  );
  const [libraryContextMenu, setLibraryContextMenu] =
    useState<LibraryContextMenuState | null>(null);
  const [libraryDeleteConfirm, setLibraryDeleteConfirm] =
    useState<InstalledPack | null>(null);
  const extrasPanelId = useId();
  const libraryActionPanelId = useId();
  const tempDirRef = useRef<string | null>(null);
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;
  const overlayTimerRef = useRef<number | null>(null);
  const libraryRailFocusRef = useRef<HTMLDivElement | null>(null);

  const setBridge = useCallback(
    (patch: Partial<PackInstallerBridge>) => {
      // Eagerly update the ref so rapid follow-up patches (e.g. mode switch
      // then loadUnitPreview) do not clobber fields like `mode`.
      const next = { ...bridgeRef.current, ...patch };
      bridgeRef.current = next;
      onBridgeChange(next);
    },
    [onBridgeChange],
  );

  const clearOverlayTimer = useCallback((): void => {
    if (overlayTimerRef.current !== null) {
      window.clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = null;
    }
  }, []);

  const showCompletionOverlay = useCallback(
    (state: Exclude<OverlayState, "working">, title: string, detail?: string | null) => {
      clearOverlayTimer();
      setOverlay({
        state,
        title,
        detail: detail ?? null,
        completed: undefined,
        total: undefined,
      });
      overlayTimerRef.current = window.setTimeout(() => {
        setOverlay(null);
        overlayTimerRef.current = null;
      }, 1800);
    },
    [clearOverlayTimer],
  );

  useEffect(() => {
    return () => {
      clearOverlayTimer();
    };
  }, [clearOverlayTimer]);

  const extrasActiveCount =
    (convertToLatestVersion ? 1 : 0) + (portPacks ? 1 : 0);
  const extrasSummary =
    extrasActiveCount === 0
      ? t("packInstaller.extrasNone")
      : [
          convertToLatestVersion ? t("packInstaller.convertToLatestVersion") : null,
          portPacks ? t("packInstaller.portPacks") : null,
        ]
          .filter((part): part is string => Boolean(part))
          .join(" · ");

  const clearTemp = useCallback(async () => {
    const tempDir = tempDirRef.current;
    tempDirRef.current = null;
    if (tempDir) {
      try {
        await cleanupPackInstallTemp(tempDir);
      } catch {
        // Best-effort cleanup.
      }
    }
  }, []);

  const clearInstallMetadata = useCallback((): void => {
    setBridge({
      selectedUnit: null,
      packPngDataUrl: null,
    });
  }, [setBridge]);

  const resetInstallState = useCallback(async () => {
    await clearTemp();
    setPlan(null);
    setExpandedUnitIds(new Set());
    clearInstallMetadata();
  }, [clearTemp, clearInstallMetadata]);

  // Keep the metadata rail empty whenever install mode has no loaded plan.
  useEffect(() => {
    if (bridge.mode !== "install") {
      return;
    }
    if (!plan) {
      if (bridge.selectedUnit !== null || bridge.packPngDataUrl !== null) {
        clearInstallMetadata();
      }
      return;
    }
    // Drop a stale selection if the unit disappeared from the plan.
    if (
      bridge.selectedUnit &&
      !plan.units.some((unit) => unit.id === bridge.selectedUnit?.id)
    ) {
      clearInstallMetadata();
    }
  }, [
    bridge.mode,
    bridge.packPngDataUrl,
    bridge.selectedUnit,
    clearInstallMetadata,
    plan,
  ]);

  useEffect(() => {
    return () => {
      const tempDir = tempDirRef.current;
      if (tempDir) {
        void cleanupPackInstallTemp(tempDir);
      }
    };
  }, []);

  const loadUnitPreview = useCallback(
    async (unit: InstallUnit | null) => {
      if (!unit || unit.kind !== "pack" || !unit.packPngPath) {
        setBridge({ selectedUnit: unit, packPngDataUrl: null });
        return;
      }
      setBridge({ selectedUnit: unit, packPngDataUrl: null });
      const dataUrl = await getPackPngDataUrl(unit.packPngPath);
      if (bridgeRef.current.selectedUnit?.id === unit.id) {
        setBridge({ selectedUnit: unit, packPngDataUrl: dataUrl });
      }
    },
    [setBridge],
  );

  const runDiscovery = useCallback(
    async (path: string) => {
      if (!geometryDashFound) {
        setStatusTone("error");
        setStatusMessage(t("errors:packInstaller.geometryDashRequired"));
        return;
      }
      if (!isTauriRuntime()) {
        setStatusTone("error");
        setStatusMessage(t("errors:packInstaller.runtimeUnavailable"));
        return;
      }
      const trimmed = path.trim();
      if (!trimmed) {
        return;
      }

      setBusy("discover");
      setStatusMessage(null);
      // Drop previous pack metadata immediately so the rail doesn't keep stale fields.
      clearInstallMetadata();
      setPlan(null);
      setExpandedUnitIds(new Set());

      try {
        await clearTemp();
        const nextPlan = await discoverPackInstall(trimmed);
        tempDirRef.current = nextPlan.tempDir ?? null;
        setPlan(nextPlan);
        setExpandedUnitIds(new Set());
        const firstPack =
          nextPlan.units.find((unit) => unit.kind === "pack") ?? nextPlan.units[0] ?? null;
        await loadUnitPreview(firstPack ?? null);
        setStatusMessage(null);
      } catch (err: unknown) {
        setPlan(null);
        clearInstallMetadata();
        setStatusTone("error");
        setStatusMessage(
          redactAbsolutePathsInText(
            err instanceof Error
              ? err.message
              : t("errors:packInstaller.discoverFailed"),
          ),
        );
      } finally {
        setBusy(null);
      }
    },
    [clearInstallMetadata, clearTemp, geometryDashFound, loadUnitPreview, t],
  );

  const browseFolder = async (): Promise<void> => {
    if (!isTauriRuntime()) {
      setStatusTone("error");
      setStatusMessage(t("errors:packInstaller.runtimeUnavailable"));
      return;
    }
    try {
      const selected = await open({
        title: t("packInstaller.selectFolderDialog"),
        directory: true,
        multiple: false,
      });
      if (typeof selected === "string" && selected.trim()) {
        await runDiscovery(selected);
      }
    } catch {
      // Cancelled.
    }
  };

  const browseZip = async (): Promise<void> => {
    if (!isTauriRuntime()) {
      setStatusTone("error");
      setStatusMessage(t("errors:packInstaller.runtimeUnavailable"));
      return;
    }
    try {
      const selected = await open({
        title: t("packInstaller.selectZipDialog"),
        directory: false,
        multiple: false,
        filters: [{ name: t("packInstaller.zipFilter"), extensions: ["zip"] }],
      });
      if (typeof selected === "string" && selected.trim()) {
        await runDiscovery(selected);
      }
    } catch {
      // Cancelled.
    }
  };

  const selectLibraryPack = useCallback(
    async (pack: InstalledPack | null, options?: { focusRail?: boolean }) => {
      if (!pack) {
        setBridge({
          libraryPack: null,
          packPngDataUrl: null,
          libraryPackPngPath: undefined,
          libraryPackPngDirty: false,
        });
        return;
      }
      setBridge({
        libraryPack: pack,
        packPngDataUrl: null,
        libraryPackPngPath: undefined,
        libraryPackPngDirty: false,
      });
      const previewPath = pack.packPngPath;
      if (previewPath) {
        const dataUrl = await getPackPngDataUrl(previewPath);
        if (bridgeRef.current.libraryPack?.id === pack.id) {
          setBridge({ libraryPack: pack, packPngDataUrl: dataUrl });
        }
      }
      if (options?.focusRail) {
        window.requestAnimationFrame(() => {
          libraryRailFocusRef.current?.scrollIntoView({
            block: "nearest",
            behavior: "smooth",
          });
        });
      }
    },
    [setBridge],
  );

  const refreshLibrary = useCallback(async (): Promise<void> => {
    if (!geometryDashFound) {
      setStatusTone("error");
      setStatusMessage(t("errors:packInstaller.geometryDashRequired"));
      return;
    }
    if (!isTauriRuntime()) {
      setStatusTone("error");
      setStatusMessage(t("errors:packInstaller.runtimeUnavailable"));
      return;
    }

    setBusy("library");
    setStatusMessage(null);
    try {
      const [packs, layout] = await Promise.all([
        listInstalledPacks(),
        getGameFilesLayout().catch(() => null),
      ]);
      setLibraryPacks(packs);
      if (layout?.textureLoaderPacksDir) {
        setLibraryPacksPath(layout.textureLoaderPacksDir);
      }

      const selectedId = bridgeRef.current.libraryPack?.id ?? null;
      const selected =
        (selectedId ? packs.find((pack) => pack.id === selectedId) : null) ?? null;
      await selectLibraryPack(selected);

      const previewEntries = await Promise.all(
        packs.map(async (pack) => {
          if (!pack.packPngPath) {
            return [pack.id, null] as const;
          }
          const dataUrl = await getPackPngDataUrl(pack.packPngPath);
          return [pack.id, dataUrl] as const;
        }),
      );
      setLibraryPreviews(Object.fromEntries(previewEntries));
    } catch (err: unknown) {
      setStatusTone("error");
      setStatusMessage(
        redactAbsolutePathsInText(
          err instanceof Error ? err.message : t("errors:packInstaller.listFailed"),
        ),
      );
    } finally {
      setBusy(null);
    }
  }, [geometryDashFound, selectLibraryPack, t]);

  // Reload whenever Library is shown — including remount after leaving the tool
  // with Library still selected (local grid state is empty on mount).
  useEffect(() => {
    if (bridge.mode !== "library") {
      return;
    }
    void refreshLibrary();
  }, [bridge.mode, refreshLibrary]);

  const browsePackPng = useCallback(async (): Promise<void> => {
    if (!isTauriRuntime()) {
      return;
    }
    try {
      const selected = await open({
        title: t("packInstaller.selectPackPngDialog"),
        directory: false,
        multiple: false,
        filters: [{ name: t("packInstaller.pngFilter"), extensions: ["png"] }],
      });
      if (typeof selected !== "string" || !selected.trim()) {
        return;
      }
      const dataUrl = await getPackPngDataUrl(selected);
      if (bridgeRef.current.mode === "create") {
        setBridge({
          createPackPngPath: selected,
          packPngDataUrl: dataUrl,
        });
        return;
      }
      if (bridgeRef.current.mode === "library") {
        if (!bridgeRef.current.libraryPack) {
          return;
        }
        setBridge({
          libraryPackPngPath: selected,
          libraryPackPngDirty: true,
          packPngDataUrl: dataUrl,
        });
        return;
      }
      const unit = bridgeRef.current.selectedUnit;
      if (!unit || unit.kind !== "pack") {
        return;
      }
      const nextUnit: InstallUnit = { ...unit, packPngPath: selected };
      setPlan((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          units: prev.units.map((entry) =>
            entry.id === nextUnit.id ? nextUnit : entry,
          ),
        };
      });
      setBridge({ selectedUnit: nextUnit, packPngDataUrl: dataUrl });
    } catch {
      // Cancelled.
    }
  }, [setBridge, t]);

  const clearPackPng = useCallback((): void => {
    if (bridgeRef.current.mode === "create") {
      setBridge({
        createPackPngPath: null,
        packPngDataUrl: null,
      });
      return;
    }
    if (bridgeRef.current.mode === "library") {
      if (!bridgeRef.current.libraryPack) {
        return;
      }
      setBridge({
        libraryPackPngPath: null,
        libraryPackPngDirty: true,
        packPngDataUrl: null,
      });
      return;
    }
    const unit = bridgeRef.current.selectedUnit;
    if (!unit || unit.kind !== "pack") {
      return;
    }
    const nextUnit: InstallUnit = { ...unit, packPngPath: undefined };
    setPlan((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        units: prev.units.map((entry) =>
          entry.id === nextUnit.id ? nextUnit : entry,
        ),
      };
    });
    setBridge({ selectedUnit: nextUnit, packPngDataUrl: null });
  }, [setBridge]);

  const updateSelectedPackMetadata = useCallback(
    (metadata: PackMetadata): void => {
      const unit = bridgeRef.current.selectedUnit;
      if (!unit || unit.kind !== "pack") {
        return;
      }
      const nextUnit: InstallUnit = {
        ...unit,
        metadata,
        label: metadata.name.trim() || unit.label,
      };
      setPlan((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          units: prev.units.map((entry) =>
            entry.id === nextUnit.id ? nextUnit : entry,
          ),
        };
      });
      setBridge({ selectedUnit: nextUnit });
    },
    [setBridge],
  );

  const updateLibraryPackMetadata = useCallback(
    (metadata: PackMetadata): void => {
      const pack = bridgeRef.current.libraryPack;
      if (!pack) {
        return;
      }
      const nextPack: InstalledPack = { ...pack, metadata };
      setLibraryPacks((prev) =>
        prev.map((entry) => (entry.id === nextPack.id ? nextPack : entry)),
      );
      setBridge({ libraryPack: nextPack });
    },
    [setBridge],
  );

  const saveLibraryMetadata = useCallback(async (): Promise<void> => {
    const pack = bridgeRef.current.libraryPack;
    if (!pack?.metadata) {
      setStatusTone("error");
      setStatusMessage(t("errors:packInstaller.noLibraryPackSelected"));
      return;
    }
    if (!isTauriRuntime()) {
      setStatusTone("error");
      setStatusMessage(t("errors:packInstaller.runtimeUnavailable"));
      return;
    }

    setBusy("librarySave");
    setBridge({ librarySaving: true });
    setStatusMessage(null);
    try {
      const result = await updateInstalledPackMetadata({
        packDir: pack.path,
        metadata: pack.metadata,
        updatePackPng: bridgeRef.current.libraryPackPngDirty,
        packPngPath: bridgeRef.current.libraryPackPngDirty
          ? (bridgeRef.current.libraryPackPngPath ?? null)
          : undefined,
      });
      const nextPack: InstalledPack = {
        ...pack,
        metadata: result.metadata ?? pack.metadata,
        packPngPath: result.packPngPath ?? undefined,
      };
      setLibraryPacks((prev) =>
        prev.map((entry) => (entry.id === nextPack.id ? nextPack : entry)),
      );
      if (result.packPngPath) {
        const dataUrl = await getPackPngDataUrl(result.packPngPath);
        setLibraryPreviews((prev) => ({ ...prev, [nextPack.id]: dataUrl }));
        setBridge({
          libraryPack: nextPack,
          packPngDataUrl: dataUrl,
          libraryPackPngPath: undefined,
          libraryPackPngDirty: false,
          librarySaving: false,
        });
      } else {
        setLibraryPreviews((prev) => ({ ...prev, [nextPack.id]: null }));
        setBridge({
          libraryPack: nextPack,
          packPngDataUrl: null,
          libraryPackPngPath: undefined,
          libraryPackPngDirty: false,
          librarySaving: false,
        });
      }
      setStatusTone("success");
      setStatusMessage(t("packInstaller.librarySaveSuccess"));
    } catch (err: unknown) {
      setBridge({ librarySaving: false });
      setStatusTone("error");
      setStatusMessage(
        redactAbsolutePathsInText(
          err instanceof Error
            ? err.message
            : t("errors:packInstaller.saveMetadataFailed"),
        ),
      );
    } finally {
      setBusy(null);
    }
  }, [setBridge, t]);

  const runLibraryOperation = useCallback(
    async (kind: PackOperationKind): Promise<void> => {
      const pack = bridgeRef.current.libraryPack;
      if (!pack) {
        setStatusTone("error");
        setStatusMessage(t("errors:packInstaller.noLibraryPackSelected"));
        return;
      }
      if (!geometryDashFound) {
        setStatusTone("error");
        setStatusMessage(t("errors:packInstaller.geometryDashRequired"));
        return;
      }
      if (!isTauriRuntime()) {
        setStatusTone("error");
        setStatusMessage(t("errors:packInstaller.runtimeUnavailable"));
        return;
      }
      if (kind === "convertToNewVersion" && !libraryConvertVersion.trim()) {
        setStatusTone("error");
        setStatusMessage(t("errors:packInstaller.convertVersionRequired"));
        return;
      }
      if (kind === "splitter" && !librarySplitOutputDir.trim()) {
        setStatusTone("error");
        setStatusMessage(t("errors:packInstaller.splitOutputRequired"));
        return;
      }

      setBusy("library");
      setStatusMessage(null);
      setLibraryActionPanel(null);
      clearOverlayTimer();
      setOverlay({
        state: "working",
        title: t("packInstaller.libraryWorking"),
        detail: libraryPackTitle(pack),
        completed: 0,
        total: 0,
      });

      try {
        const result = await runPackOperation(
          pack.path,
          kind,
          {
            gameVersion: libraryConvertVersion,
            lowPort: libraryPortLowGraphics,
            outputDir: librarySplitOutputDir,
            sheetConcurrency:
              kind === "splitter"
                ? librarySplitConcurrency
                : DEFAULT_LIBRARY_SHEET_CONCURRENCY,
          },
          (progress) => {
            setOverlay({
              state: "working",
              title: progress.label,
              detail: t("packInstaller.progressUnit", {
                label: progress.label,
                completed: progress.completed,
                total: progress.total,
              }),
              completed: progress.completed,
              total: progress.total,
            });
          },
        );
        showCompletionOverlay(
          "success",
          t("packInstaller.libraryOperationComplete"),
          result.message,
        );
        setStatusTone("success");
        setStatusMessage(result.message);
        await refreshLibrary();
      } catch (err: unknown) {
        const message = redactAbsolutePathsInText(
          err instanceof Error
            ? err.message
            : t("errors:packInstaller.operationFailed"),
        );
        showCompletionOverlay("error", t("packInstaller.libraryOperationFailed"), message);
        setStatusTone("error");
        setStatusMessage(message);
      } finally {
        setBusy(null);
      }
    },
    [
      clearOverlayTimer,
      geometryDashFound,
      libraryConvertVersion,
      libraryPortLowGraphics,
      librarySplitConcurrency,
      librarySplitOutputDir,
      refreshLibrary,
      showCompletionOverlay,
      t,
    ],
  );

  const openLibrarySplitPanel = useCallback(
    (pack: InstalledPack): void => {
      void selectLibraryPack(pack);
      setLibrarySplitOutputDir((prev) => prev.trim() || pack.path);
      setLibraryActionPanel("split");
    },
    [selectLibraryPack],
  );

  const pickLibrarySplitOutputFolder = useCallback(
    async (onPicked: (path: string) => void): Promise<void> => {
      if (!isTauriRuntime()) {
        return;
      }
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("packInstaller.librarySplitOutputBrowse"),
      });
      if (typeof selected === "string" && selected.trim()) {
        onPicked(selected);
      }
    },
    [t],
  );

  const openLibraryPackFolder = useCallback(async (pack: InstalledPack): Promise<void> => {
    try {
      await openPathInOs(pack.path);
    } catch (err: unknown) {
      setStatusTone("error");
      setStatusMessage(
        redactAbsolutePathsInText(
          err instanceof Error
            ? err.message
            : t("errors:packInstaller.openFolderFailed"),
        ),
      );
    }
  }, [t]);

  const openPacksFolder = useCallback(async (): Promise<void> => {
    const path = libraryPacksPath;
    if (!path) {
      try {
        const layout = await getGameFilesLayout();
        if (!layout.textureLoaderPacksDir) {
          throw new Error(t("errors:packInstaller.openPacksFolderFailed"));
        }
        setLibraryPacksPath(layout.textureLoaderPacksDir);
        await openPathInOs(layout.textureLoaderPacksDir);
      } catch (err: unknown) {
        setStatusTone("error");
        setStatusMessage(
          redactAbsolutePathsInText(
            err instanceof Error
              ? err.message
              : t("errors:packInstaller.openPacksFolderFailed"),
          ),
        );
      }
      return;
    }
    try {
      await openPathInOs(path);
    } catch (err: unknown) {
      setStatusTone("error");
      setStatusMessage(
        redactAbsolutePathsInText(
          err instanceof Error
            ? err.message
            : t("errors:packInstaller.openPacksFolderFailed"),
        ),
      );
    }
  }, [libraryPacksPath, t]);

  const handleLibraryContextAction = useCallback(
    (action: PackLibraryContextAction): void => {
      const pack = libraryContextMenu?.pack ?? bridgeRef.current.libraryPack;
      if (!pack) {
        return;
      }
      switch (action) {
        case "openFolder":
          void openLibraryPackFolder(pack);
          break;
        case "convert":
          void selectLibraryPack(pack);
          setLibraryActionPanel("convert");
          break;
        case "port":
          void selectLibraryPack(pack);
          setLibraryActionPanel("port");
          break;
        case "split":
          openLibrarySplitPanel(pack);
          break;
        case "delete":
          void selectLibraryPack(pack);
          setLibraryDeleteConfirm(pack);
          break;
        default: {
          const _exhaustive: never = action;
          void _exhaustive;
          break;
        }
      }
    },
    [
      libraryContextMenu?.pack,
      openLibraryPackFolder,
      openLibrarySplitPanel,
      selectLibraryPack,
    ],
  );

  const confirmDeleteLibraryPack = useCallback(async (): Promise<void> => {
    const pack = libraryDeleteConfirm;
    if (!pack) {
      return;
    }
    if (!isTauriRuntime()) {
      setStatusTone("error");
      setStatusMessage(t("errors:packInstaller.runtimeUnavailable"));
      return;
    }
    setBusy("library");
    setStatusMessage(null);
    try {
      await deleteInstalledPack(pack.path);
      setLibraryDeleteConfirm(null);
      if (bridgeRef.current.libraryPack?.id === pack.id) {
        setBridge({
          libraryPack: null,
          packPngDataUrl: null,
          libraryPackPngPath: undefined,
          libraryPackPngDirty: false,
        });
      }
      setStatusTone("success");
      setStatusMessage(
        t("packInstaller.libraryDeleteSuccess", { name: libraryPackTitle(pack) }),
      );
      await refreshLibrary();
    } catch (err: unknown) {
      setStatusTone("error");
      setStatusMessage(
        redactAbsolutePathsInText(
          err instanceof Error
            ? err.message
            : t("errors:packInstaller.deleteFailed"),
        ),
      );
    } finally {
      setBusy(null);
    }
  }, [libraryDeleteConfirm, refreshLibrary, setBridge, t]);

  useEffect(() => {
    onSidebarActionsChange?.({
      browsePackPng: () => {
        void browsePackPng();
      },
      clearPackPng,
      updateSelectedPackMetadata,
      updateLibraryPackMetadata,
      saveLibraryMetadata: () => {
        void saveLibraryMetadata();
      },
    });
  }, [
    browsePackPng,
    clearPackPng,
    onSidebarActionsChange,
    saveLibraryMetadata,
    updateLibraryPackMetadata,
    updateSelectedPackMetadata,
  ]);

  const handleDroppedPaths = useCallback(
    async (paths: string[]) => {
      if (!paths.length || busy) {
        return;
      }
      if (bridgeRef.current.mode === "create") {
        const png = paths.find(isPngPath);
        if (!png) {
          setStatusTone("error");
          setStatusMessage(t("errors:packInstaller.invalidDropPng"));
          return;
        }
        const dataUrl = await getPackPngDataUrl(png);
        setBridge({ createPackPngPath: png, packPngDataUrl: dataUrl });
        setStatusTone("info");
        setStatusMessage(t("packInstaller.packPngSelected"));
        return;
      }

      if (bridgeRef.current.mode === "library") {
        const png = paths.find(isPngPath);
        if (!png || !bridgeRef.current.libraryPack || paths.length !== 1) {
          return;
        }
        const dataUrl = await getPackPngDataUrl(png);
        setBridge({
          libraryPackPngPath: png,
          libraryPackPngDirty: true,
          packPngDataUrl: dataUrl,
        });
        setStatusTone("info");
        setStatusMessage(t("packInstaller.packPngSelected"));
        return;
      }

      // Install mode: dropping a PNG while a pack unit is selected replaces pack.png.
      const png = paths.find(isPngPath);
      const selectedPack =
        bridgeRef.current.selectedUnit?.kind === "pack"
          ? bridgeRef.current.selectedUnit
          : null;
      if (png && selectedPack && paths.length === 1) {
        const dataUrl = await getPackPngDataUrl(png);
        const nextUnit: InstallUnit = { ...selectedPack, packPngPath: png };
        setPlan((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            units: prev.units.map((entry) =>
              entry.id === nextUnit.id ? nextUnit : entry,
            ),
          };
        });
        setBridge({ selectedUnit: nextUnit, packPngDataUrl: dataUrl });
        setStatusTone("info");
        setStatusMessage(t("packInstaller.packPngSelected"));
        return;
      }
      const source = paths.find((path) => isZipPath(path)) ?? paths[0];
      if (!source) {
        return;
      }
      await runDiscovery(source);
    },
    [busy, runDiscovery, setBridge, t],
  );

  // Tauri webview drag-drop (folders/zips with real OS paths).
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (disposed) {
          return;
        }
        const payload = event.payload;
        switch (payload.type) {
          case "enter":
          case "over":
            setDropActive(true);
            break;
          case "leave":
            setDropActive(false);
            break;
          case "drop":
            setDropActive(false);
            void handleDroppedPaths(payload.paths);
            break;
          default: {
            const _exhaustive: never = payload;
            void _exhaustive;
            break;
          }
        }
      })
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(() => {
        // Drag-drop unavailable.
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleDroppedPaths]);

  // HTML5 fallback for non-Tauri / when dragDropEnabled is false.
  const onHtmlDragOver = (event: ReactDragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(true);
  };

  const onHtmlDragLeave = (event: ReactDragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
  };

  const onHtmlDrop = (event: ReactDragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
    // HTML5 File API does not expose filesystem paths in the browser sandbox.
    if (!isTauriRuntime()) {
      setStatusTone("error");
      setStatusMessage(t("errors:packInstaller.runtimeUnavailable"));
    }
  };

  const setMode = (mode: PackInstallerBridge["mode"]): void => {
    if (mode === bridgeRef.current.mode) {
      return;
    }
    setStatusMessage(null);
    setLibraryActionPanel(null);
    setLibraryContextMenu(null);
    switch (mode) {
      case "install": {
        if (!plan) {
          setBridge({
            mode,
            selectedUnit: null,
            libraryPack: null,
            packPngDataUrl: null,
            libraryPackPngPath: undefined,
            libraryPackPngDirty: false,
          });
          return;
        }
        const selected =
          plan.units.find((u) => u.id === bridgeRef.current.selectedUnit?.id) ??
          plan.units.find((u) => u.kind === "pack") ??
          plan.units[0] ??
          null;
        setBridge({
          mode,
          selectedUnit: selected,
          libraryPack: null,
          packPngDataUrl: null,
          libraryPackPngPath: undefined,
          libraryPackPngDirty: false,
        });
        void loadUnitPreview(selected);
        break;
      }
      case "create": {
        const createPngPath = bridgeRef.current.createPackPngPath;
        setBridge({
          mode,
          selectedUnit: null,
          libraryPack: null,
          packPngDataUrl: null,
          createPackPngPath: createPngPath,
          libraryPackPngPath: undefined,
          libraryPackPngDirty: false,
        });
        if (createPngPath) {
          void getPackPngDataUrl(createPngPath).then((dataUrl) => {
            if (bridgeRef.current.mode === "create") {
              setBridge({ packPngDataUrl: dataUrl });
            }
          });
        }
        break;
      }
      case "library": {
        setBridge({
          mode,
          selectedUnit: null,
          packPngDataUrl: null,
          libraryPackPngPath: undefined,
          libraryPackPngDirty: false,
        });
        break;
      }
      default: {
        const _exhaustive: never = mode;
        void _exhaustive;
        break;
      }
    }
  };

  // Keep create folder name in sync with pack name until the user edits it.
  useEffect(() => {
    if (bridge.mode !== "create" || folderNameTouched) {
      return;
    }
    setFolderName(folderNameFromPackName(bridge.createMetadata.name));
  }, [bridge.createMetadata.name, bridge.mode, folderNameTouched]);

  const toggleUnitEnabled = (unitId: string, enabled: boolean): void => {
    setPlan((prev) => {
      if (!prev) {
        return prev;
      }
      const units = prev.units.map((unit) =>
        unit.id === unitId ? { ...unit, enabled } : unit,
      );
      const selected =
        bridge.selectedUnit?.id === unitId
          ? (units.find((unit) => unit.id === unitId) ?? null)
          : bridge.selectedUnit;
      if (selected && bridge.selectedUnit?.id === unitId) {
        setBridge({ selectedUnit: selected });
      }
      return { ...prev, units };
    });
  };

  const selectUnit = (unit: InstallUnit): void => {
    void loadUnitPreview(unit);
  };

  const toggleExpand = (unitId: string): void => {
    setExpandedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  };

  const setAllEnabled = (enabled: boolean): void => {
    setPlan((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        units: prev.units.map((unit) => ({ ...unit, enabled })),
      };
    });
  };

  const runInstall = async (): Promise<void> => {
    if (!plan) {
      return;
    }
    if (!geometryDashFound) {
      setStatusTone("error");
      setStatusMessage(t("errors:packInstaller.geometryDashRequired"));
      return;
    }
    const unitIds = plan.units.filter((unit) => unit.enabled).map((unit) => unit.id);
    if (unitIds.length === 0) {
      setStatusTone("error");
      setStatusMessage(t("errors:packInstaller.noUnitsSelected"));
      return;
    }
    if (convertToLatestVersion && !convertGameVersion.trim()) {
      setStatusTone("error");
      setStatusMessage(t("errors:packInstaller.convertVersionRequired"));
      return;
    }

    setBusy("install");
    setStatusMessage(null);
    clearOverlayTimer();
    setOverlay({
      state: "working",
      title: t("packInstaller.installing"),
      detail: null,
      completed: 0,
      total: 0,
    });

    try {
      const result = await installPackPlan(
        plan,
        unitIds,
        {
          convertToLatestVersion,
          gameVersion: convertGameVersion,
          portPacks,
          lowPort: portLowGraphics,
          sheetConcurrency: 5,
        },
        (progress) => {
          setOverlay({
            state: "working",
            title: progress.label || t("packInstaller.installing"),
            detail: t("packInstaller.progressUnit", {
              label: progress.label,
              completed: progress.completed,
              total: progress.total,
            }),
            completed: progress.completed,
            total: progress.total,
          });
        },
      );
      const issueErrors = result.issues.filter((issue) => issue.level === "error");
      const issueWarnings = result.issues.filter((issue) => issue.level === "warning");
      const completeState: Exclude<OverlayState, "working"> =
        issueErrors.length > 0
          ? "error"
          : issueWarnings.length > 0
            ? "warning"
            : "success";
      const title =
        completeState === "success"
          ? t("packInstaller.installComplete")
          : completeState === "warning"
            ? t("packInstaller.installCompleteWarnings")
            : t("packInstaller.installCompleteErrors");
      const firstIssue = result.issues[0];
      showCompletionOverlay(
        completeState,
        title,
        firstIssue
          ? redactAbsolutePathsInText(firstIssue.message)
          : t("packInstaller.installSummary", {
              installed: result.installed,
              skipped: result.skipped,
            }),
      );
    } catch (err: unknown) {
      showCompletionOverlay(
        "error",
        t("packInstaller.installCompleteErrors"),
        redactAbsolutePathsInText(
          err instanceof Error ? err.message : t("errors:packInstaller.installFailed"),
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  const runCreate = async (): Promise<void> => {
    if (!geometryDashFound) {
      setStatusTone("error");
      setStatusMessage(t("errors:packInstaller.geometryDashRequired"));
      return;
    }
    if (!isTauriRuntime()) {
      setStatusTone("error");
      setStatusMessage(t("errors:packInstaller.runtimeUnavailable"));
      return;
    }

    const resolvedFolder = folderName.trim() || folderNameFromPackName(bridge.createMetadata.name);
    if (!resolvedFolder) {
      setStatusTone("error");
      setStatusMessage(t("errors:packInstaller.folderNameRequired"));
      return;
    }

    const metadata: PackMetadata = {
      ...bridge.createMetadata,
      name: bridge.createMetadata.name.trim() || resolvedFolder,
      textureldr: bridge.createMetadata.textureldr.trim() || DEFAULT_PACK_METADATA.textureldr,
      version: bridge.createMetadata.version.trim() || DEFAULT_PACK_METADATA.version,
    };

    setBusy("create");
    setStatusMessage(null);
    clearOverlayTimer();
    setOverlay({
      state: "working",
      title: t("packInstaller.creating"),
      detail: null,
    });

    try {
      const result = await createTexturePack({
        folderName: resolvedFolder,
        metadata,
        packPngPath: bridge.createPackPngPath ?? undefined,
      });
      setCreatedPackDir(result.packDir);
      showCompletionOverlay(
        "success",
        t("packInstaller.createSuccess"),
        shortenPathForDisplay(result.packDir),
      );
    } catch (err: unknown) {
      showCompletionOverlay(
        "error",
        t("packInstaller.createFailedTitle"),
        redactAbsolutePathsInText(
          err instanceof Error ? err.message : t("errors:packInstaller.createFailed"),
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  const openCreatedFolder = async (): Promise<void> => {
    if (!createdPackDir) {
      return;
    }
    try {
      await openPathInOs(createdPackDir);
    } catch (err: unknown) {
      setStatusTone("error");
      setStatusMessage(
        redactAbsolutePathsInText(
          err instanceof Error ? err.message : t("errors:packInstaller.openFolderFailed"),
        ),
      );
    }
  };

  const completionCheckClass =
    overlay?.state === "warning"
      ? "tm-progress-check-warning"
      : overlay?.state === "error"
        ? "tm-progress-check-error"
        : "tm-progress-check-success";
  const overlayProgressTotal = overlay?.total ?? 0;
  const overlayProgressCompleted = overlay?.completed ?? 0;
  const overlayProgressRatio =
    overlay?.state === "working" && overlayProgressTotal > 0
      ? Math.min(1, Math.max(0, overlayProgressCompleted / overlayProgressTotal))
      : 0;

  return (
    <ToolPage accent="amber" wide>
      {overlay ? (
        <div
          className={`tm-progress-overlay tm-progress-state-${overlay.state}`}
          role="alertdialog"
          aria-busy={overlay.state === "working"}
          aria-live="polite"
          aria-label={overlay.title}
        >
          <div
            className={`tm-progress-card ${
              overlay.state !== "working" ? "tm-progress-complete" : ""
            }`}
          >
            {overlay.state !== "working" ? (
              <svg
                className={`tm-progress-check ${completionCheckClass}`}
                viewBox="0 0 64 64"
                aria-hidden="true"
              >
                <circle className="tm-progress-check-circle" cx="32" cy="32" r="26" />
                <path className="tm-progress-check-mark" d="M18 33.5 28.5 44 46 24" />
              </svg>
            ) : (
              <div className="tm-progress-spinner" />
            )}
            <p className="tm-progress-title">{overlay.title}</p>
            {overlay.detail ? (
              <p className="tm-progress-count">{overlay.detail}</p>
            ) : overlay.state === "working" ? (
              <p className="tm-progress-muted">{t("packInstaller.overlayPreparing")}</p>
            ) : null}
            {overlay.state === "working" && overlayProgressTotal > 0 ? (
              <div
                className="tm-pack-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={overlayProgressTotal}
                aria-valuenow={overlayProgressCompleted}
              >
                <div
                  className="tm-pack-progress-fill"
                  style={{ width: `${overlayProgressRatio * 100}%` }}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ToolPageHeader toolId="texturePackInstaller" />

      {!geometryDashFound ? (
        <p className="tm-tool-inline-error" role="alert">
          {t("errors:packInstaller.geometryDashRequired")}
        </p>
      ) : null}

      <div className="tm-pack-mode-toggle" role="tablist" aria-label={t("packInstaller.modeLabel")}>
        <button
          type="button"
          role="tab"
          aria-selected={bridge.mode === "install"}
          className={`tm-pack-mode-btn${bridge.mode === "install" ? " tm-pack-mode-btn-active" : ""}`}
          onClick={() => setMode("install")}
          disabled={busy !== null}
        >
          <PackageOpen size={15} />
          {t("packInstaller.modeInstall")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={bridge.mode === "create"}
          className={`tm-pack-mode-btn${bridge.mode === "create" ? " tm-pack-mode-btn-active" : ""}`}
          onClick={() => setMode("create")}
          disabled={busy !== null}
        >
          <FolderPlus size={15} />
          {t("packInstaller.modeCreate")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={bridge.mode === "library"}
          className={`tm-pack-mode-btn${bridge.mode === "library" ? " tm-pack-mode-btn-active" : ""}`}
          onClick={() => setMode("library")}
          disabled={busy !== null}
        >
          <Library size={15} />
          {t("packInstaller.modeLibrary")}
        </button>
      </div>

      <div ref={libraryRailFocusRef} className="tm-pack-library-rail-anchor" aria-hidden />

      {bridge.mode === "install" ? (
        <>
          <ToolSection
            title={t("packInstaller.source")}
            subtitle={t("packInstaller.sourceDescription")}
            icon={FolderOpen}
          >
            <div
              className={`tm-pack-dropzone${dropActive ? " tm-pack-dropzone-active" : ""}`}
              onDragOver={onHtmlDragOver}
              onDragLeave={onHtmlDragLeave}
              onDrop={onHtmlDrop}
            >
              <FileArchive size={28} strokeWidth={1.5} />
              <p className="tm-pack-dropzone-title">{t("packInstaller.dropHint")}</p>
              <p className="tm-pack-dropzone-sub">{t("packInstaller.dropHintSub")}</p>
              <div className="tm-pack-dropzone-actions">
                <button
                  type="button"
                  className="tm-tool-path-browse"
                  onClick={() => void browseFolder()}
                  disabled={busy !== null || !geometryDashFound}
                >
                  <FolderOpen size={15} />
                  {t("packInstaller.browseFolder")}
                </button>
                <button
                  type="button"
                  className="tm-tool-path-browse"
                  onClick={() => void browseZip()}
                  disabled={busy !== null || !geometryDashFound}
                >
                  <FileArchive size={15} />
                  {t("packInstaller.browseZip")}
                </button>
              </div>
            </div>
            {plan ? (
              <div className="tm-pack-source-bar">
                <span title={plan.sourcePath}>
                  {plan.isZip ? t("packInstaller.sourceZip") : t("packInstaller.sourceFolder")}
                  {": "}
                  {shortenPathForDisplay(plan.sourcePath)}
                </span>
                <button
                  type="button"
                  className="tm-pack-clear-btn"
                  onClick={() => void resetInstallState()}
                  disabled={busy !== null}
                >
                  <Trash2 size={14} />
                  {t("packInstaller.clear")}
                </button>
              </div>
            ) : null}
          </ToolSection>

          <ToolSection
            title={t("packInstaller.installPlan")}
            subtitle={t("packInstaller.installPlanDescription")}
            icon={PackageOpen}
          >
            {!plan ? (
              <p className="tm-tool-section-note">{t("packInstaller.installPlanEmpty")}</p>
            ) : (
              <>
                <div
                  className={`tm-pack-extras${extrasExpanded ? " is-expanded" : ""}`}
                >
                  <button
                    type="button"
                    className="tm-pack-extras-toggle"
                    aria-expanded={extrasExpanded}
                    aria-controls={extrasPanelId}
                    disabled={busy !== null}
                    onClick={() => setExtrasExpanded((prev) => !prev)}
                  >
                    <span className="tm-pack-extras-toggle-copy">
                      <span className="tm-pack-extras-toggle-label">
                        {t("packInstaller.extras")}
                      </span>
                      <span className="tm-pack-extras-toggle-summary">{extrasSummary}</span>
                    </span>
                    {extrasExpanded ? (
                      <ChevronDown size={16} aria-hidden />
                    ) : (
                      <ChevronRight size={16} aria-hidden />
                    )}
                  </button>
                  {extrasExpanded ? (
                    <div
                      id={extrasPanelId}
                      className="tm-pack-extras-body"
                      role="group"
                      aria-label={t("packInstaller.extras")}
                    >
                      <p className="tm-tool-section-note tm-pack-extras-hint">
                        {t("packInstaller.extrasHint")}
                      </p>
                      <div className="tm-pack-extras-option">
                        <ToolCheckboxField
                          label={t("packInstaller.convertToLatestVersion")}
                          checked={convertToLatestVersion}
                          onChange={setConvertToLatestVersion}
                        />
                        {convertToLatestVersion ? (
                          <div className="tm-pack-extras-option-settings">
                            <ToolSelectField
                              label={t("packInstaller.convertPreviousVersion")}
                              value={convertGameVersion}
                              options={CONVERT_VERSION_OPTIONS}
                              onChange={setConvertGameVersion}
                            />
                            <p className="tm-tool-section-note">
                              {t("packInstaller.convertToLatestVersionHint")}
                            </p>
                          </div>
                        ) : null}
                      </div>
                      <div className="tm-pack-extras-option">
                        <ToolCheckboxField
                          label={t("packInstaller.portPacks")}
                          checked={portPacks}
                          onChange={setPortPacks}
                        />
                        {portPacks ? (
                          <div className="tm-pack-extras-option-settings">
                            <ToolCheckboxField
                              label={t("packInstaller.portLowGraphics")}
                              checked={portLowGraphics}
                              onChange={setPortLowGraphics}
                            />
                            <p className="tm-tool-section-note">
                              {t("packInstaller.portPacksHint")}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="tm-pack-plan-toolbar">
                  <button
                    type="button"
                    className="tm-pack-link-btn"
                    onClick={() => setAllEnabled(true)}
                    disabled={busy !== null}
                  >
                    {t("packInstaller.selectAll")}
                  </button>
                  <button
                    type="button"
                    className="tm-pack-link-btn"
                    onClick={() => setAllEnabled(false)}
                    disabled={busy !== null}
                  >
                    {t("packInstaller.selectNone")}
                  </button>
                  <span className="tm-pack-plan-count">
                    {t("packInstaller.unitsSelected", {
                      selected: plan.units.filter((u) => u.enabled).length,
                      total: plan.units.length,
                    })}
                  </span>
                </div>
                <div className="tm-pack-unit-list">
                  {plan.units.map((unit) => (
                    <InstallUnitRow
                      key={unit.id}
                      unit={unit}
                      selected={bridge.selectedUnit?.id === unit.id}
                      expanded={expandedUnitIds.has(unit.id)}
                      onToggleEnabled={(enabled) => toggleUnitEnabled(unit.id, enabled)}
                      onSelect={() => selectUnit(unit)}
                      onToggleExpand={() => toggleExpand(unit.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </ToolSection>

          <div className="tm-pack-actions">
            <button
              type="button"
              className="tm-tool-run-btn"
              onClick={() => void runInstall()}
              disabled={busy !== null || !plan || !geometryDashFound}
            >
              {busy === "install" || busy === "discover" ? (
                <LoaderCircle size={16} className="tm-pack-spin" />
              ) : (
                <Check size={16} />
              )}
              {busy === "install" ? t("packInstaller.installing") : t("packInstaller.install")}
            </button>
          </div>
        </>
      ) : bridge.mode === "create" ? (
        <>
          <ToolSection
            title={t("packInstaller.createSection")}
            subtitle={t("packInstaller.createDescription")}
            icon={FolderPlus}
          >
            <ToolTextField
              label={t("packInstaller.folderName")}
              hint={t("packInstaller.folderNameHint")}
              value={folderName}
              onChange={(value) => {
                setFolderNameTouched(true);
                setFolderName(value);
              }}
              placeholder={t("packInstaller.folderNamePlaceholder")}
            />
            <p className="tm-tool-section-note">{t("packInstaller.createMetadataHint")}</p>
            <div
              className={`tm-pack-dropzone tm-pack-dropzone-compact${
                dropActive ? " tm-pack-dropzone-active" : ""
              }`}
              onDragOver={onHtmlDragOver}
              onDragLeave={onHtmlDragLeave}
              onDrop={onHtmlDrop}
            >
              <p className="tm-pack-dropzone-title">{t("packInstaller.dropPackPngHint")}</p>
              <div className="tm-pack-dropzone-actions">
                <button
                  type="button"
                  className="tm-tool-path-browse"
                  onClick={() => void browsePackPng()}
                  disabled={busy !== null || !geometryDashFound}
                >
                  {t("packInstaller.browsePackPng")}
                </button>
              </div>
            </div>
          </ToolSection>

          <div className="tm-pack-actions">
            <button
              type="button"
              className="tm-tool-run-btn"
              onClick={() => void runCreate()}
              disabled={busy !== null || !geometryDashFound}
            >
              {busy === "create" ? (
                <LoaderCircle size={16} className="tm-pack-spin" />
              ) : (
                <FolderPlus size={16} />
              )}
              {busy === "create" ? t("packInstaller.creating") : t("packInstaller.createPack")}
            </button>
            {createdPackDir ? (
              <button
                type="button"
                className="tm-pack-secondary-btn"
                onClick={() => void openCreatedFolder()}
                disabled={busy !== null}
              >
                <FolderOpen size={15} />
                {t("packInstaller.openFolder")}
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <ToolSection
            title={t("packInstaller.librarySection")}
            subtitle={t("packInstaller.libraryDescription")}
            icon={Library}
          >
            <div className="tm-pack-library-toolbar">
              <p className="tm-pack-library-path" title={libraryPacksPath ?? undefined}>
                <span className="tm-pack-library-path-label">
                  {t("packInstaller.libraryPacksPath")}
                </span>
                <span>
                  {libraryPacksPath
                    ? shortenPathForDisplay(libraryPacksPath)
                    : "—"}
                </span>
              </p>
              <div className="tm-pack-library-toolbar-actions">
                <button
                  type="button"
                  className="tm-tool-path-browse"
                  onClick={() => void refreshLibrary()}
                  disabled={busy !== null || !geometryDashFound}
                >
                  <RefreshCw size={15} />
                  {t("packInstaller.libraryRefresh")}
                </button>
                <button
                  type="button"
                  className="tm-tool-path-browse"
                  onClick={() => void openPacksFolder()}
                  disabled={busy !== null || !geometryDashFound}
                >
                  <FolderOpen size={15} />
                  {t("packInstaller.libraryOpenPacksFolder")}
                </button>
              </div>
            </div>

            {libraryPacks.length === 0 ? (
              <div className="tm-pack-library-empty">
                <p>{t("packInstaller.libraryEmpty")}</p>
                <p className="tm-tool-section-note">{t("packInstaller.libraryEmptyHint")}</p>
              </div>
            ) : (
              <div className="tm-pack-library-grid">
                {libraryPacks.map((pack) => {
                  const selected = bridge.libraryPack?.id === pack.id;
                  const preview = libraryPreviews[pack.id];
                  const author = pack.metadata?.author?.trim() || t("packInstaller.libraryNoAuthor");
                  const version = pack.metadata?.version?.trim() || "1.0.0";
                  return (
                    <button
                      key={pack.id}
                      type="button"
                      className={`tm-pack-library-card${selected ? " selected" : ""}`}
                      onClick={() => void selectLibraryPack(pack)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void selectLibraryPack(pack);
                        setLibraryContextMenu({
                          pack,
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                      disabled={busy !== null}
                    >
                      <div className="tm-pack-library-preview">
                        {preview ? (
                          <img
                            className="tm-pack-library-thumb"
                            src={preview}
                            alt=""
                          />
                        ) : (
                          <div className="tm-pack-library-thumb-missing" aria-hidden>
                            <PackageOpen size={28} strokeWidth={1.5} />
                          </div>
                        )}
                      </div>
                      <div className="tm-pack-library-title">{libraryPackTitle(pack)}</div>
                      <div className="tm-pack-library-meta">
                        {t("packInstaller.libraryVersionAuthor", {
                          author,
                          version,
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {bridge.libraryPack ? (
              <div className="tm-pack-library-selection-actions">
                <button
                  type="button"
                  className="tm-pack-secondary-btn"
                  onClick={() => void openLibraryPackFolder(bridge.libraryPack!)}
                  disabled={busy !== null}
                >
                  <FolderOpen size={15} />
                  {t("packInstaller.libraryActionOpenFolder")}
                </button>
                <button
                  type="button"
                  className="tm-pack-secondary-btn"
                  onClick={() => setLibraryActionPanel("convert")}
                  disabled={busy !== null}
                >
                  <WandSparkles size={15} />
                  {t("packInstaller.libraryActionConvert")}
                </button>
                <button
                  type="button"
                  className="tm-pack-secondary-btn"
                  onClick={() => setLibraryActionPanel("port")}
                  disabled={busy !== null}
                >
                  <Shuffle size={15} />
                  {t("packInstaller.libraryActionPort")}
                </button>
                <button
                  type="button"
                  className="tm-pack-secondary-btn"
                  onClick={() => openLibrarySplitPanel(bridge.libraryPack!)}
                  disabled={busy !== null}
                >
                  <Scissors size={15} />
                  {t("packInstaller.libraryActionSplit")}
                </button>
              </div>
            ) : null}

            {libraryActionPanel ? (
              <div
                className="tm-pack-library-action-panel"
                id={libraryActionPanelId}
                role="region"
                aria-label={
                  libraryActionPanel === "convert"
                    ? t("packInstaller.libraryConvertOptions")
                    : libraryActionPanel === "port"
                      ? t("packInstaller.libraryPortOptions")
                      : t("packInstaller.librarySplitOptions")
                }
              >
                {libraryActionPanel === "convert" ? (
                  <>
                    <p className="tm-pack-library-action-title">
                      {t("packInstaller.libraryConvertOptions")}
                    </p>
                    <ToolSelectField
                      label={t("packInstaller.convertPreviousVersion")}
                      value={libraryConvertVersion}
                      options={CONVERT_VERSION_OPTIONS}
                      onChange={setLibraryConvertVersion}
                    />
                    <div className="tm-pack-library-action-buttons">
                      <button
                        type="button"
                        className="tm-tool-run-btn"
                        onClick={() => void runLibraryOperation("convertToNewVersion")}
                        disabled={busy !== null}
                      >
                        <WandSparkles size={15} />
                        {t("packInstaller.libraryRunConvert")}
                      </button>
                      <button
                        type="button"
                        className="tm-pack-secondary-btn"
                        onClick={() => setLibraryActionPanel(null)}
                        disabled={busy !== null}
                      >
                        {t("packInstaller.libraryCancelOptions")}
                      </button>
                    </div>
                  </>
                ) : null}
                {libraryActionPanel === "port" ? (
                  <>
                    <p className="tm-pack-library-action-title">
                      {t("packInstaller.libraryPortOptions")}
                    </p>
                    <ToolCheckboxField
                      label={t("packInstaller.portLowGraphics")}
                      checked={libraryPortLowGraphics}
                      onChange={setLibraryPortLowGraphics}
                    />
                    <div className="tm-pack-library-action-buttons">
                      <button
                        type="button"
                        className="tm-tool-run-btn"
                        onClick={() => void runLibraryOperation("porterSplitter")}
                        disabled={busy !== null}
                      >
                        <Shuffle size={15} />
                        {t("packInstaller.libraryRunPort")}
                      </button>
                      <button
                        type="button"
                        className="tm-pack-secondary-btn"
                        onClick={() => setLibraryActionPanel(null)}
                        disabled={busy !== null}
                      >
                        {t("packInstaller.libraryCancelOptions")}
                      </button>
                    </div>
                  </>
                ) : null}
                {libraryActionPanel === "split" ? (
                  <>
                    <p className="tm-pack-library-action-title">
                      {t("packInstaller.librarySplitOptions")}
                    </p>
                    <FolderPathField
                      label={t("packInstaller.librarySplitOutput")}
                      value={librarySplitOutputDir}
                      onChange={setLibrarySplitOutputDir}
                      pickFolder={pickLibrarySplitOutputFolder}
                      placeholder={t("packInstaller.librarySplitOutputPlaceholder")}
                    />
                    <p className="tm-tool-section-note">
                      {t("packInstaller.librarySplitOutputHint")}
                    </p>
                    <ToolNumberField
                      label={t("packInstaller.librarySplitConcurrency")}
                      hint={t("common.range1To64")}
                      value={librarySplitConcurrency}
                      min={1}
                      max={64}
                      onChange={setLibrarySplitConcurrency}
                    />
                    <div className="tm-pack-library-action-buttons">
                      <button
                        type="button"
                        className="tm-tool-run-btn"
                        onClick={() => void runLibraryOperation("splitter")}
                        disabled={busy !== null || !librarySplitOutputDir.trim()}
                      >
                        <Scissors size={15} />
                        {t("packInstaller.libraryRunSplit")}
                      </button>
                      <button
                        type="button"
                        className="tm-pack-secondary-btn"
                        onClick={() => setLibraryActionPanel(null)}
                        disabled={busy !== null}
                      >
                        {t("packInstaller.libraryCancelOptions")}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </ToolSection>
        </>
      )}

      {libraryContextMenu ? (
        <PackLibraryContextMenu
          pack={libraryContextMenu.pack}
          x={libraryContextMenu.x}
          y={libraryContextMenu.y}
          disabled={busy !== null}
          onAction={handleLibraryContextAction}
          onClose={() => setLibraryContextMenu(null)}
        />
      ) : null}

      {libraryDeleteConfirm ? (
        <div
          className="tm-icon-editor-confirm-dialog-backdrop"
          onClick={() => {
            if (busy === null) {
              setLibraryDeleteConfirm(null);
            }
          }}
          role="presentation"
        >
          <div
            className="tm-icon-editor-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("packInstaller.libraryDeleteConfirmAria")}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{t("packInstaller.libraryDeleteConfirmTitle")}</h3>
            <p>
              {t("packInstaller.libraryDeleteConfirmDescription", {
                name: libraryPackTitle(libraryDeleteConfirm),
              })}
            </p>
            <div className="tm-icon-editor-confirm-dialog-actions">
              <button
                type="button"
                onClick={() => setLibraryDeleteConfirm(null)}
                disabled={busy !== null}
              >
                {t("common:cancel")}
              </button>
              <button
                type="button"
                className="tm-icon-editor-confirm-dialog-primary tm-pack-library-delete-confirm"
                onClick={() => void confirmDeleteLibraryPack()}
                disabled={busy !== null}
              >
                {busy === "library" ? (
                  <LoaderCircle size={14} className="tm-pack-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                {t("packInstaller.libraryActionDelete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {statusMessage &&
      busy !== "install" &&
      busy !== "create" &&
      busy !== "library" &&
      busy !== "librarySave" ? (
        <div className={`tm-pack-status tm-pack-status-${statusTone}`} role="status">
          {busy ? <LoaderCircle size={15} className="tm-pack-spin" /> : null}
          <div>
            <p>{statusMessage}</p>
          </div>
        </div>
      ) : null}
    </ToolPage>
  );
}
