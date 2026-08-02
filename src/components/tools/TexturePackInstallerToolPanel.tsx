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
  LoaderCircle,
  PackageOpen,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import convertVersionMap from "../../config/convertVersionMap.json";
import type {
  InstallPlan,
  InstallTreeNode,
  InstallUnit,
  InstallUnitKind,
  PackInstallerBridge,
  PackMetadata,
} from "../../domain/packInstaller";
import {
  DEFAULT_PACK_METADATA,
  folderNameFromPackName,
} from "../../domain/packInstaller";
import {
  cleanupPackInstallTemp,
  createTexturePack,
  discoverPackInstall,
  getPackPngDataUrl,
  installPackPlan,
} from "../../services/tauriPackInstaller";
import { isTauriRuntime } from "../../services/tauriOperations";
import { openPathInOs } from "../../services/tauriSettings";
import { redactAbsolutePathsInText, shortenPathForDisplay } from "../../utils/pathDisplay";
import {
  ToolCheckboxField,
  ToolPage,
  ToolPageHeader,
  ToolSection,
  ToolSelectField,
  ToolTextField,
} from "./layout";

const CONVERT_VERSION_OPTIONS = Object.keys(convertVersionMap);

export type PackInstallerSidebarActions = {
  browsePackPng: () => void;
  clearPackPng: () => void;
  updateSelectedPackMetadata: (metadata: PackMetadata) => void;
};

type TexturePackInstallerToolPanelProps = {
  geometryDashFound: boolean;
  bridge: PackInstallerBridge;
  onBridgeChange: (next: PackInstallerBridge) => void;
  onSidebarActionsChange?: (actions: PackInstallerSidebarActions) => void;
};

type BusyKind = "discover" | "install" | "create" | null;
type OverlayState = "working" | "success" | "warning" | "error";

type PackOverlay = {
  state: OverlayState;
  title: string;
  detail?: string | null;
};

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
  const { t } = useTranslation(["tools", "errors"]);
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
  const extrasPanelId = useId();
  const tempDirRef = useRef<string | null>(null);
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;
  const overlayTimerRef = useRef<number | null>(null);

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
      setOverlay({ state, title, detail: detail ?? null });
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

  useEffect(() => {
    onSidebarActionsChange?.({
      browsePackPng: () => {
        void browsePackPng();
      },
      clearPackPng,
      updateSelectedPackMetadata,
    });
  }, [
    browsePackPng,
    clearPackPng,
    onSidebarActionsChange,
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
    if (mode === "install") {
      if (!plan) {
        setBridge({
          mode,
          selectedUnit: null,
          packPngDataUrl: null,
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
        packPngDataUrl: null,
      });
      void loadUnitPreview(selected);
    } else {
      const createPngPath = bridgeRef.current.createPackPngPath;
      setBridge({
        mode,
        selectedUnit: null,
        packPngDataUrl: null,
        createPackPngPath: createPngPath,
      });
      if (createPngPath) {
        void getPackPngDataUrl(createPngPath).then((dataUrl) => {
          if (bridgeRef.current.mode === "create") {
            setBridge({ packPngDataUrl: dataUrl });
          }
        });
      } else {
        setBridge({ packPngDataUrl: null });
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
            title: t("packInstaller.installing"),
            detail: t("packInstaller.progressUnit", {
              label: progress.label,
              completed: progress.completed,
              total: progress.total,
            }),
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
      </div>

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
      ) : (
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
      )}

      {statusMessage && busy !== "install" && busy !== "create" ? (
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
