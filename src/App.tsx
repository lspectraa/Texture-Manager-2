import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Sparkles,
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Files,
  FolderOutput,
} from "lucide-react";
import "./App.css";
import {
  OperationProgress,
  OperationReport,
  OperationRequest,
} from "./domain/operations";
import type { GeodeButtonsOptions } from "./domain/operations";
import {
  getPhaseDefaults,
  isTauriRuntime,
  requestOperationCancel,
  runOperation,
} from "./services/tauriOperations";
import { GlowMakerToolPanel } from "./components/tools/GlowMakerToolPanel";
import { MergerToolPanel } from "./components/tools/MergerToolPanel";
import { PorterToolPanel } from "./components/tools/PorterToolPanel";
import { SplitterToolPanel } from "./components/tools/SplitterToolPanel";
import { ConvertToNewVersionToolPanel } from "./components/tools/ConvertToNewVersionToolPanel";
import { IconEditorToolPanel } from "./components/tools/IconEditorToolPanel";
import { RandomizerToolPanel } from "./components/tools/RandomizerToolPanel";
import { GeodeButtonsToolPanel } from "./components/tools/GeodeButtonsToolPanel";
import { useShellPanelTransition } from "./hooks/useShellPanelTransition";
import { HomeScreen } from "./components/HomeScreen";
import { AppSidebar } from "./components/AppSidebar";
import {
  buildIssuesCsvFromReport,
  copyTextToClipboard,
  downloadTextFile,
  groupReportIssues,
  issuesCsvFileName,
} from "./utils/reportIssuesCsv";
import convertVersionMap from "./config/convertVersionMap.json";

type PrimaryTool =
  | "home"
  | "iconEditor"
  | "splitter"
  | "porter"
  | "merger"
  | "randomizer"
  | "convertToNewVersion"
  | "glowMaker"
  | "geodeButtons";

type Rgb = [number, number, number];

const PROGRESS_COLOR_STOPS: Rgb[] = [
  [87, 182, 255],
  [77, 218, 255],
  [92, 241, 208],
  [129, 242, 146],
  [255, 209, 112],
];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const interpolateProgressColor = (ratio: number): Rgb => {
  const normalized = clamp01(ratio);
  const segmentCount = PROGRESS_COLOR_STOPS.length - 1;
  const scaled = normalized * segmentCount;
  const segmentIndex = Math.min(segmentCount - 1, Math.floor(scaled));
  const t = scaled - segmentIndex;
  const from = PROGRESS_COLOR_STOPS[segmentIndex];
  const to = PROGRESS_COLOR_STOPS[segmentIndex + 1];
  return [
    Math.round(lerp(from[0], to[0], t)),
    Math.round(lerp(from[1], to[1], t)),
    Math.round(lerp(from[2], to[2], t)),
  ];
};

const rgbCss = ([r, g, b]: Rgb): string => `rgb(${r} ${g} ${b})`;
const rgbaCss = ([r, g, b]: Rgb, alpha: number): string =>
  `rgb(${r} ${g} ${b} / ${clamp01(alpha)})`;
const CONVERT_VERSION_OPTIONS = Object.keys(convertVersionMap);
const DEFAULT_SHEET_CONCURRENCY = 5;
const NAV_COLLAPSED_STORAGE_KEY = "texture-manager-2.nav-collapsed";
const REPORT_COLLAPSED_STORAGE_KEY = "texture-manager-2.report-collapsed";

function readStoredCollapsed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function App() {
  const [selectedTool, setSelectedTool] = useState<PrimaryTool>("home");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCancelHovered, setIsCancelHovered] = useState(false);
  const [overlayState, setOverlayState] = useState<
    "working" | "success" | "warning" | "error"
  >("working");
  const [operationProgress, setOperationProgress] =
    useState<OperationProgress | null>(null);
  const [report, setReport] = useState<OperationReport | null>(null);
  const [isNavCollapsed, setIsNavCollapsed] = useState(() =>
    readStoredCollapsed(NAV_COLLAPSED_STORAGE_KEY),
  );
  const [isReportCollapsed, setIsReportCollapsed] = useState(() =>
    readStoredCollapsed(REPORT_COLLAPSED_STORAGE_KEY),
  );
  const navPanelTransition = useShellPanelTransition(setIsNavCollapsed);
  const reportPanelTransition = useShellPanelTransition(setIsReportCollapsed);

  useEffect(() => {
    try {
      window.localStorage.setItem(NAV_COLLAPSED_STORAGE_KEY, String(isNavCollapsed));
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }, [isNavCollapsed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(REPORT_COLLAPSED_STORAGE_KEY, String(isReportCollapsed));
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }, [isReportCollapsed]);

  const [splitterInputDir, setSplitterInputDir] = useState("");
  const [splitterOutputDir, setSplitterOutputDir] = useState("");
  const [splitterSheetConcurrency, setSplitterSheetConcurrency] = useState(
    DEFAULT_SHEET_CONCURRENCY,
  );

  const [porterInputDir, setPorterInputDir] = useState("");
  const [porterOutputDir, setPorterOutputDir] = useState("");
  const [porterLowPort, setPorterLowPort] = useState(false);
  const [porterSheetConcurrency, setPorterSheetConcurrency] = useState(
    DEFAULT_SHEET_CONCURRENCY,
  );

  const [mergerInputDir, setMergerInputDir] = useState("");
  const [mergerOutputDir, setMergerOutputDir] = useState("");
  const [mergerIncludeOutsideFiles, setMergerIncludeOutsideFiles] = useState(false);
  const [mergerSheetConcurrency, setMergerSheetConcurrency] = useState(
    DEFAULT_SHEET_CONCURRENCY,
  );

  const [convertInputDir, setConvertInputDir] = useState("");
  const [convertOutputDir, setConvertOutputDir] = useState("");
  const [convertGameVersion, setConvertGameVersion] = useState<string>(() => {
    if (CONVERT_VERSION_OPTIONS.includes("2.2")) {
      return "2.2";
    }
    return CONVERT_VERSION_OPTIONS[0] ?? "";
  });
  const [convertSheetConcurrency, setConvertSheetConcurrency] = useState(
    DEFAULT_SHEET_CONCURRENCY,
  );
  const [randomizerInputDir, setRandomizerInputDir] = useState("");
  const [randomizerOutputDir, setRandomizerOutputDir] = useState("");
  const [randomizerSeed, setRandomizerSeed] = useState("");

  const [glowInputDir, setGlowInputDir] = useState("");
  const [glowOutputDir, setGlowOutputDir] = useState("");
  const [glowThickness, setGlowThickness] = useState(3);
  const [glowTolerance, setGlowTolerance] = useState(6);
  const [glowRainbow, setGlowRainbow] = useState(false);
  const [glowCompositeLayers, setGlowCompositeLayers] = useState(false);

  const [geodeButtonsInputDir, setGeodeButtonsInputDir] = useState("");
  const [geodeButtonsOutputDir, setGeodeButtonsOutputDir] = useState("");
  const [geodeButtonsOptions, setGeodeButtonsOptions] = useState<GeodeButtonsOptions>(() => ({
    sheetStem: "BlankSheet-uhd",
    templates: {
      familyTemplates: {} as Record<string, string>,
      tabSelected: null as string | null,
      tabUnselected: null as string | null,
      tabUnselectedDark: null as string | null,
    },
    variantRules: [
      { variant: "primary", hsv: { hueDeg: 0, satDelta: 0, valDelta: 0 } },
      { variant: "secondary", hsv: { hueDeg: 0, satDelta: 0, valDelta: 0 } },
      { variant: "darkAqua", hsv: { hueDeg: 0, satDelta: 0, valDelta: 0 } },
      { variant: "darkPurple", hsv: { hueDeg: 0, satDelta: 0, valDelta: 0 } },
      { variant: "gray", hsv: { hueDeg: 0, satDelta: 0, valDelta: 0 } },
      { variant: "error", hsv: { hueDeg: 0, satDelta: 0, valDelta: 0 } },
      { variant: "info", hsv: { hueDeg: 0, satDelta: 0, valDelta: 0 } },
      { variant: "pink", hsv: { hueDeg: 0, satDelta: 0, valDelta: 0 } },
    ],
    familyVariantRules: null,
    sheetConcurrency: 1,
  }));

  useEffect(() => {
    const loadDefaults = async (): Promise<void> => {
      try {
        const response = await getPhaseDefaults();
        setSplitterSheetConcurrency(response.splitter.sheetConcurrency);
        setPorterSheetConcurrency(response.porter.sheetConcurrency);
        setMergerSheetConcurrency(response.merger.sheetConcurrency);
        setConvertSheetConcurrency(response.convertToNewVersion.sheetConcurrency);
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load phase defaults from backend.",
        );
      }
    };

    loadDefaults().catch((error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected error while loading defaults.";
      setLoadError(message);
    });
  }, []);

  const pickFolder = async (assign: (path: string) => void): Promise<void> => {
    if (!isTauriRuntime()) {
      setRunError("Folder picker is available in Tauri runtime.");
      return;
    }
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select folder",
    });
    if (typeof selected === "string" && selected.trim().length > 0) {
      assign(selected);
    }
  };

  const executeSelectedOperation = async (): Promise<void> => {
    setRunError(null);
    setReport(null);

    let request: OperationRequest | null = null;

    if (selectedTool === "splitter") {
      if (!splitterInputDir || !splitterOutputDir) {
        setRunError("Splitter requires both input and output directories.");
        return;
      }
      request = {
        kind: "splitter",
        inputDir: splitterInputDir,
        outputDir: splitterOutputDir,
        options: {
          type: "splitter",
          sheetConcurrency: splitterSheetConcurrency,
        },
      };
    }

    if (selectedTool === "porter") {
      if (!porterInputDir || !porterOutputDir) {
        setRunError("Porter requires both input and output directories.");
        return;
      }

      request = {
        kind: "porterSplitter",
        inputDir: porterInputDir,
        outputDir: porterOutputDir,
        options: {
          type: "porterSplitter",
          lowPort: porterLowPort,
          dimensions: null,
          sheetConcurrency: porterSheetConcurrency,
        },
      };
    }

    if (selectedTool === "merger") {
      if (!mergerInputDir || !mergerOutputDir) {
        setRunError("Merger requires both input and output directories.");
        return;
      }
      request = {
        kind: "merger",
        inputDir: mergerInputDir,
        outputDir: mergerOutputDir,
        options: {
          type: "merger",
          includeOutsidePlistFiles: mergerIncludeOutsideFiles,
          dimensions: null,
          sheetConcurrency: mergerSheetConcurrency,
        },
      };
    }

    if (selectedTool === "glowMaker") {
      if (!glowInputDir || !glowOutputDir) {
        setRunError("Glow Maker requires both input and output directories.");
        return;
      }
      request = {
        kind: "glowMaker",
        inputDir: glowInputDir,
        outputDir: glowOutputDir,
        options: {
          type: "glowMaker",
          thickness: Math.min(128, Math.max(1, glowThickness)),
          tolerance: Math.min(255, Math.max(0, glowTolerance)),
          dimensions: null,
          rainbowGlow: glowRainbow,
          compositeLayers: glowCompositeLayers,
        },
      };
    }

    if (selectedTool === "convertToNewVersion") {
      if (!convertInputDir || !convertOutputDir) {
        setRunError("Convert to New Version requires both input and output directories.");
        return;
      }
      if (!convertGameVersion.trim()) {
        setRunError("Convert to New Version requires a game version.");
        return;
      }
      request = {
        kind: "convertToNewVersion",
        inputDir: convertInputDir,
        outputDir: convertOutputDir,
        options: {
          type: "convertToNewVersion",
          gameVersion: convertGameVersion.trim(),
          sheetConcurrency: convertSheetConcurrency,
        },
      };
    }
    if (selectedTool === "randomizer") {
      if (!randomizerInputDir || !randomizerOutputDir) {
        setRunError("Randomizer requires both input and output directories.");
        return;
      }
      request = {
        kind: "randomizer",
        inputDir: randomizerInputDir,
        outputDir: randomizerOutputDir,
        options: {
          type: "randomizer",
          seed: randomizerSeed.trim() ? randomizerSeed.trim() : null,
        },
      };
    }

    if (selectedTool === "geodeButtons") {
      if (!geodeButtonsInputDir || !geodeButtonsOutputDir) {
        setRunError("Create Geode Buttons requires both input and output directories.");
        return;
      }
      request = {
        kind: "geodeButtons",
        inputDir: geodeButtonsInputDir,
        outputDir: geodeButtonsOutputDir,
        options: {
          type: "geodeButtons",
          ...geodeButtonsOptions,
        },
      };
    }

    if (!request) {
      setRunError("No operation request was built.");
      return;
    }

    try {
      setIsRunning(true);
      setIsCancelling(false);
      setIsCancelHovered(false);
      setOverlayState("working");
      setOperationProgress(null);
      const operationReport = await runOperation(request, (progress) => {
        setOperationProgress(progress);
      });
      setReport(operationReport);
      const hasError = operationReport.issues.some((issue) => issue.level === "error");
      const hasWarning = operationReport.issues.some((issue) => issue.level === "warning");
      const completeState = hasError ? "error" : hasWarning ? "warning" : "success";
      setOverlayState(completeState);
      await new Promise((resolve) => setTimeout(resolve, 1800));
    } catch (error) {
      setOverlayState("error");
      const raw =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : JSON.stringify(error, null, 2);
      const cancelled =
        /cancelled/i.test(raw) || /operation cancelled/i.test(raw);
      setRunError(
        cancelled
          ? "Operation cancelled."
          : `Failed to execute operation through backend. ${raw}`,
      );
    } finally {
      setIsRunning(false);
      setIsCancelling(false);
      setIsCancelHovered(false);
      setOperationProgress(null);
    }
  };

  const progressRatio =
    operationProgress !== null && operationProgress.spritesTotal > 0
      ? Math.min(
          1,
          Math.max(0, operationProgress.spritesCompleted / operationProgress.spritesTotal),
        )
      : 0;
  const progressAccentRgb = interpolateProgressColor(progressRatio);
  const progressAccent = rgbCss(progressAccentRgb);
  const cancelHoverAccentRgb: Rgb = [255, 104, 126];
  const activeWorkingAccentRgb = isCancelHovered ? cancelHoverAccentRgb : progressAccentRgb;
  const activeWorkingAccent = rgbCss(activeWorkingAccentRgb);
  const spinnerAccent =
    overlayState === "working"
      ? activeWorkingAccent
      : overlayState === "warning"
        ? "hsl(44 88% 58%)"
        : overlayState === "error"
          ? "hsl(351 84% 63%)"
          : progressAccent
  ;
  const showProgressDetails = overlayState === "working";
  const progressCardStyle =
    overlayState === "working"
      ? {
          borderColor: activeWorkingAccent,
          boxShadow: `0 0 0 1px ${rgbaCss(activeWorkingAccentRgb, 0.24)}, 0 30px 64px rgba(2, 8, 22, 0.6)`,
        }
      : undefined;
  const showCompletionCheck = overlayState !== "working";
  const completionCheckClass =
    overlayState === "warning"
      ? "tm-progress-check-warning"
      : overlayState === "error"
        ? "tm-progress-check-error"
        : "tm-progress-check-success";

  const groupedIssues = useMemo(() => {
    if (!report) {
      return [];
    }
    return groupReportIssues(report.issues);
  }, [report]);

  const [issuesCsvCopied, setIssuesCsvCopied] = useState(false);
  const issuesCsvCopiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (issuesCsvCopiedTimerRef.current !== null) {
        window.clearTimeout(issuesCsvCopiedTimerRef.current);
      }
    };
  }, []);

  const handleCopyIssuesCsv = useCallback(async (): Promise<void> => {
    if (!report || report.issues.length === 0) {
      return;
    }
    try {
      await copyTextToClipboard(buildIssuesCsvFromReport(report));
      setIssuesCsvCopied(true);
      if (issuesCsvCopiedTimerRef.current !== null) {
        window.clearTimeout(issuesCsvCopiedTimerRef.current);
      }
      issuesCsvCopiedTimerRef.current = window.setTimeout(() => {
        setIssuesCsvCopied(false);
        issuesCsvCopiedTimerRef.current = null;
      }, 2000);
    } catch {
      setIssuesCsvCopied(false);
    }
  }, [report]);

  const handleDownloadIssuesCsv = useCallback((): void => {
    if (!report || report.issues.length === 0) {
      return;
    }
    downloadTextFile(
      buildIssuesCsvFromReport(report),
      issuesCsvFileName(report.operation),
    );
  }, [report]);

  const reportState: "running" | "error" | "warning" | "success" | "idle" = isRunning
    ? "running"
    : runError
      ? "error"
      : report
        ? report.issues.some((issue) => issue.level === "error")
          ? "error"
          : report.issues.some((issue) => issue.level === "warning")
            ? "warning"
            : "success"
        : "idle";
  const reportStatusLabel =
    reportState === "running"
      ? "Running"
      : reportState === "success"
        ? "Complete"
        : reportState === "warning"
          ? "Warnings"
          : reportState === "error"
            ? runError
              ? "Run failed"
              : "Errors found"
            : "Ready";
  const isIconEditor = selectedTool === "iconEditor";
  const isHome = selectedTool === "home";
  const isGeodeButtons = selectedTool === "geodeButtons";
  const isToolPanel = !isIconEditor && !isHome;
  const showRunAction = isToolPanel;
  const showOperationAndReport = !isIconEditor && !isHome && !isGeodeButtons;

  const toolPanel = (() => {
    switch (selectedTool) {
      case "home":
        return (
          <HomeScreen
            onSelectTool={(toolId) => {
              setSelectedTool(toolId);
            }}
          />
        );
      case "iconEditor":
        return <IconEditorToolPanel />;
      case "splitter":
        return (
          <SplitterToolPanel
            inputDir={splitterInputDir}
            outputDir={splitterOutputDir}
            sheetConcurrency={splitterSheetConcurrency}
            onInputDirChange={setSplitterInputDir}
            onOutputDirChange={setSplitterOutputDir}
            onSheetConcurrencyChange={setSplitterSheetConcurrency}
            pickFolder={pickFolder}
          />
        );
      case "porter":
        return (
          <PorterToolPanel
            inputDir={porterInputDir}
            outputDir={porterOutputDir}
            lowPort={porterLowPort}
            sheetConcurrency={porterSheetConcurrency}
            onInputDirChange={setPorterInputDir}
            onOutputDirChange={setPorterOutputDir}
            onLowPortChange={setPorterLowPort}
            onSheetConcurrencyChange={setPorterSheetConcurrency}
            pickFolder={pickFolder}
          />
        );
      case "merger":
        return (
          <MergerToolPanel
            inputDir={mergerInputDir}
            outputDir={mergerOutputDir}
            includeOutsideFiles={mergerIncludeOutsideFiles}
            sheetConcurrency={mergerSheetConcurrency}
            onInputDirChange={setMergerInputDir}
            onOutputDirChange={setMergerOutputDir}
            onIncludeOutsideFilesChange={setMergerIncludeOutsideFiles}
            onSheetConcurrencyChange={setMergerSheetConcurrency}
            pickFolder={pickFolder}
          />
        );
      case "glowMaker":
        return (
          <GlowMakerToolPanel
            inputDir={glowInputDir}
            outputDir={glowOutputDir}
            thickness={glowThickness}
            tolerance={glowTolerance}
            rainbowGlow={glowRainbow}
            compositeLayers={glowCompositeLayers}
            onInputDirChange={setGlowInputDir}
            onOutputDirChange={setGlowOutputDir}
            onThicknessChange={setGlowThickness}
            onToleranceChange={setGlowTolerance}
            onRainbowGlowChange={setGlowRainbow}
            onCompositeLayersChange={setGlowCompositeLayers}
            pickFolder={pickFolder}
          />
        );
      case "convertToNewVersion":
        return (
          <ConvertToNewVersionToolPanel
            inputDir={convertInputDir}
            outputDir={convertOutputDir}
            gameVersion={convertGameVersion}
            versionOptions={CONVERT_VERSION_OPTIONS}
            sheetConcurrency={convertSheetConcurrency}
            onInputDirChange={setConvertInputDir}
            onOutputDirChange={setConvertOutputDir}
            onGameVersionChange={setConvertGameVersion}
            onSheetConcurrencyChange={setConvertSheetConcurrency}
            pickFolder={pickFolder}
          />
        );
      case "randomizer":
        return (
          <RandomizerToolPanel
            inputDir={randomizerInputDir}
            outputDir={randomizerOutputDir}
            seed={randomizerSeed}
            onInputDirChange={setRandomizerInputDir}
            onOutputDirChange={setRandomizerOutputDir}
            onSeedChange={setRandomizerSeed}
            pickFolder={pickFolder}
          />
        );
      case "geodeButtons":
        return (
          <GeodeButtonsToolPanel
            inputDir={geodeButtonsInputDir}
            outputDir={geodeButtonsOutputDir}
            options={geodeButtonsOptions}
            onInputDirChange={setGeodeButtonsInputDir}
            onOutputDirChange={setGeodeButtonsOutputDir}
            onOptionsChange={setGeodeButtonsOptions}
            pickFolder={pickFolder}
          />
        );
      default: {
        const neverTool: never = selectedTool;
        throw new Error(`Unhandled tool selection: ${neverTool}`);
      }
    }
  })();

  return (
    <main className="tm-shell">
      <div className="tm-bg" aria-hidden="true">
        <span className="tm-bg-orb tm-bg-orb-a" />
        <span className="tm-bg-orb tm-bg-orb-b" />
        <span className="tm-bg-orb tm-bg-orb-c" />
        <span className="tm-bg-orb tm-bg-orb-d" />
      </div>
      {isRunning ? (
        <div
          className={`tm-progress-overlay tm-progress-state-${overlayState}`}
          role="alertdialog"
          aria-busy="true"
          aria-live="polite"
          aria-label="Operation in progress"
        >
          <div
            className={`tm-progress-card ${overlayState !== "working" ? "tm-progress-complete" : ""}`}
            style={progressCardStyle}
          >
            {showCompletionCheck ? (
              <svg
                className={`tm-progress-check ${completionCheckClass}`}
                viewBox="0 0 64 64"
                aria-hidden="true"
              >
                <circle className="tm-progress-check-circle" cx="32" cy="32" r="26" />
                <path className="tm-progress-check-mark" d="M18 33.5 28.5 44 46 24" />
              </svg>
            ) : (
              <div
                className="tm-progress-spinner"
                style={{
                  borderTopColor: spinnerAccent,
                }}
              />
            )}
            <p className="tm-progress-title">
              {isCancelling
                ? "Cancelling…"
                : overlayState === "success"
                  ? "Completed"
                  : overlayState === "warning"
                    ? "Completed with warnings"
                    : overlayState === "error"
                      ? "Completed with errors"
                      : "Working…"}
            </p>
            {showProgressDetails && operationProgress ? (
              <>
                <p className="tm-progress-sheet">
                  <span className="tm-progress-label">Gamesheet</span>{" "}
                  {operationProgress.gamesheetName.trim() || "—"}
                </p>
                <p className="tm-progress-count">
                  {operationProgress.spritesCompleted} /{" "}
                  {operationProgress.spritesTotal} sprites
                </p>
                {(operationProgress.plistsTotal ?? 0) > 0 ? (
                  <p className="tm-progress-count">
                    {operationProgress.plistsCompleted ?? 0} /{" "}
                    {operationProgress.plistsTotal} plists
                  </p>
                ) : null}
              </>
            ) : null}
            {showProgressDetails && !operationProgress ? (
              <p className="tm-progress-muted">Preparing operation…</p>
            ) : null}
            {showProgressDetails && isTauriRuntime() ? (
              <button
                type="button"
                className="tm-progress-cancel"
                disabled={isCancelling}
                onMouseEnter={() => setIsCancelHovered(true)}
                onMouseLeave={() => setIsCancelHovered(false)}
                onClick={() => {
                  setIsCancelling(true);
                  requestOperationCancel().catch(() => {
                    setIsCancelling(false);
                  });
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <section
        className={`tm-layout ${
          isIconEditor || isHome || isGeodeButtons ? "tm-layout-icon-editor" : ""
        }${isNavCollapsed ? " tm-layout-nav-collapsed" : ""}${
          showOperationAndReport && isReportCollapsed ? " tm-layout-report-collapsed" : ""
        }${
          navPanelTransition.animating || reportPanelTransition.animating
            ? " tm-layout--animating"
            : ""
        }`}
      >
        <AppSidebar
          selectedTool={selectedTool}
          collapsed={isNavCollapsed}
          animating={navPanelTransition.animating}
          onExpand={navPanelTransition.expand}
          onCollapse={navPanelTransition.collapse}
          onNavigate={(tool) => {
            setSelectedTool(tool);
          }}
        />

        <section
          className={`tm-panel tm-glass-card${
            isIconEditor ? " tm-panel-icon-editor" : ""
          }${isHome ? " tm-panel-home" : ""}${isToolPanel ? " tm-panel-tool" : ""}${
            isGeodeButtons ? " tm-panel-geode" : ""
          }`}
        >
          <div className="tm-panel-body">{toolPanel}</div>

          {showRunAction ? (
            <div className="tm-tool-actions">
              <button
                type="button"
                className="tm-tool-run-btn"
                onClick={executeSelectedOperation}
                disabled={isRunning}
              >
                <Sparkles size={16} />
                {isRunning ? "Running..." : "Run Operation"}
              </button>
            </div>
          ) : null}
        </section>

        {showOperationAndReport ? (
          <section
            className={`tm-report tm-glass-card tm-report-state-${reportState}${
              isReportCollapsed ? " tm-report--collapsed" : ""
            }${reportPanelTransition.animating ? " tm-report--animating" : ""}`}
          >
            <button
              type="button"
              className={`tm-shell-panel-title tm-nav-btn tm-nav-btn-sky${
                isReportCollapsed && !reportPanelTransition.animating
                  ? " tm-report-rail-btn"
                  : ""
              }`}
              onClick={
                reportPanelTransition.animating
                  ? undefined
                  : isReportCollapsed
                    ? reportPanelTransition.expand
                    : reportPanelTransition.collapse
              }
              aria-expanded={!isReportCollapsed}
              aria-label={
                isReportCollapsed
                  ? "Expand run output panel"
                  : "Collapse run output panel"
              }
              title={
                isReportCollapsed ? "Show run output" : "Hide run output"
              }
              disabled={reportPanelTransition.animating}
            >
              <span className="tm-nav-btn-icon" aria-hidden>
                <Activity size={16} strokeWidth={1.85} />
              </span>
              <span className="tm-nav-btn-copy">
                <span className="tm-nav-btn-label">Run Output</span>
              </span>
              <span className="tm-shell-panel-title-chevron" aria-hidden>
                <ChevronRight size={15} />
              </span>
            </button>
            <div className="tm-report-body" aria-hidden={isReportCollapsed}>
            <div className="tm-report-body-inner">
            {loadError ? (
              <div className="tm-report-alert tm-report-alert-error" role="alert">
                <AlertCircle size={15} strokeWidth={2} />
                <div className="tm-report-alert-copy">
                  <span className="tm-report-alert-title">Defaults load error</span>
                  <span className="tm-report-alert-message">{loadError}</span>
                </div>
              </div>
            ) : null}
            {runError ? (
              <div className="tm-report-alert tm-report-alert-error" role="alert">
                <AlertCircle size={15} strokeWidth={2} />
                <div className="tm-report-alert-copy">
                  <span className="tm-report-alert-title">Run error</span>
                  <span className="tm-report-alert-message">{runError}</span>
                </div>
              </div>
            ) : null}
            {!report ? (
              <div className="tm-report-empty">
                <span className="tm-report-empty-icon" aria-hidden>
                  <Activity size={22} strokeWidth={1.75} />
                </span>
                <p className="tm-report-empty-title">No operation has run yet</p>
                <p className="tm-report-empty-hint">
                  Run a tool to see results, timing, and issues here.
                </p>
              </div>
            ) : null}
            {report ? (
              <>
                <div className={`tm-report-summary tm-report-summary-${reportState}`}>
                  <div className="tm-report-summary-head">
                    <span className={`tm-report-status tm-report-status-${reportState}`}>
                      {reportState === "success" ? (
                        <CheckCircle2 size={13} strokeWidth={2.2} />
                      ) : reportState === "warning" ? (
                        <AlertTriangle size={13} strokeWidth={2.2} />
                      ) : reportState === "error" ? (
                        <AlertCircle size={13} strokeWidth={2.2} />
                      ) : (
                        <Activity size={13} strokeWidth={2.2} />
                      )}
                      {reportStatusLabel}
                    </span>
                    <span className="tm-report-summary-operation">{report.operation}</span>
                  </div>

                  <div className="tm-report-stats">
                    <div className="tm-report-stat">
                      <span className="tm-report-stat-icon" aria-hidden>
                        <Files size={14} strokeWidth={1.9} />
                      </span>
                      <span className="tm-report-stat-copy">
                        <span className="tm-report-stat-label">Processed</span>
                        <span className="tm-report-stat-value">
                          {report.filesProcessed}
                          <span className="tm-report-stat-value-dim">
                            {" "}
                            / {report.filesSeen}
                          </span>
                        </span>
                      </span>
                    </div>
                    <div className="tm-report-stat">
                      <span className="tm-report-stat-icon" aria-hidden>
                        <Clock3 size={14} strokeWidth={1.9} />
                      </span>
                      <span className="tm-report-stat-copy">
                        <span className="tm-report-stat-label">Elapsed</span>
                        <span className="tm-report-stat-value">
                          {(report.elapsedMs / 1000).toFixed(2)} s
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="tm-report-output-path" title={report.outputDir}>
                    <span className="tm-report-output-path-icon" aria-hidden>
                      <FolderOutput size={14} strokeWidth={1.9} />
                    </span>
                    <span className="tm-report-output-path-copy">
                      <span className="tm-report-output-path-label">Output</span>
                      <span className="tm-report-output-path-value">{report.outputDir}</span>
                    </span>
                  </div>
                </div>

                <section className="tm-report-issues" aria-labelledby="tm-report-issues-title">
                  <div className="tm-report-issues-head">
                    <div className="tm-report-issues-head-main">
                      <h4 id="tm-report-issues-title">Issues</h4>
                      <span className="tm-report-issues-count">{report.issues.length}</span>
                    </div>
                    {report.issues.length > 0 ? (
                      <div className="tm-report-issues-actions">
                        <button
                          type="button"
                          className="tm-report-issues-action-btn"
                          onClick={() => {
                            handleCopyIssuesCsv().catch(() => {
                              setIssuesCsvCopied(false);
                            });
                          }}
                          title="Copy issues as CSV"
                          aria-label="Copy issues as CSV"
                        >
                          <Copy size={13} strokeWidth={2} />
                          <span>{issuesCsvCopied ? "Copied" : "Copy CSV"}</span>
                        </button>
                        <button
                          type="button"
                          className="tm-report-issues-action-btn"
                          onClick={handleDownloadIssuesCsv}
                          title="Download issues as CSV"
                          aria-label="Download issues as CSV"
                        >
                          <Download size={13} strokeWidth={2} />
                          <span>Download</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {report.issues.length === 0 ? (
                    <div className="tm-report-issues-empty">
                      <CheckCircle2 size={15} strokeWidth={2} />
                      <span>No issues reported</span>
                    </div>
                  ) : null}
                  {report.issues.length > 0 ? (
                    <div className="tm-issues-list">
                      {groupedIssues.map((issue, index) => (
                        <div
                          className={`tm-issue-row tm-issue-row-${issue.level}`}
                          key={`${issue.level}-${issue.sheet}-${index}`}
                        >
                          <span className={`tm-issue-chip tm-issue-chip-${issue.level}`}>
                            {issue.level}
                          </span>
                          <span className="tm-issue-sheet">{issue.sheet}</span>
                          <span className="tm-issue-message">{issue.message}</span>
                          {issue.count > 1 ? (
                            <span className="chip tm-issue-count">x{issue.count}</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
            </div>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

export default App;
