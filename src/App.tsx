import { Fragment, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { LucideIcon } from "lucide-react";
import {
  Box,
  Sparkles,
  GitBranch,
  Scissors,
  WandSparkles,
  FileOutput,
  RefreshCw,
  Activity,
  AlertCircle,
  Image,
  House,
} from "lucide-react";
import "./App.css";
import {
  OperationProgress,
  OperationReport,
  OperationRequest,
} from "./domain/operations";
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
import convertVersionMap from "./config/convertVersionMap.json";

type PrimaryTool =
  | "home"
  | "iconEditor"
  | "splitter"
  | "porter"
  | "merger"
  | "convertToNewVersion"
  | "glowMaker";

type AppTool = Exclude<PrimaryTool, "home">;

const TOOL_ENTRIES: ReadonlyArray<{
  id: AppTool;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "iconEditor", label: "Icon Editor", icon: Image },
  { id: "splitter", label: "Splitter", icon: Scissors },
  { id: "merger", label: "Merger", icon: FileOutput },
  { id: "porter", label: "Porter", icon: GitBranch },
  { id: "glowMaker", label: "Glow Maker", icon: WandSparkles },
  { id: "convertToNewVersion", label: "Convert to New Version", icon: RefreshCw },
];

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

  const [glowInputDir, setGlowInputDir] = useState("");
  const [glowOutputDir, setGlowOutputDir] = useState("");
  const [glowThickness, setGlowThickness] = useState(3);
  const [glowTolerance, setGlowTolerance] = useState(32);

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

  const runtimeLabel = isTauriRuntime() ? "Tauri Desktop Runtime" : "Browser";

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
    const groups = new Map<
      string,
      { level: string; sheet: string; message: string; count: number }
    >();
    for (const issue of report.issues) {
      const fileName = issue.file
        ?.split(/[/\\]/)
        .pop()
        ?.replace(/\.(plist|png)$/i, "");
      const sheet = fileName && fileName.trim().length > 0 ? fileName : "global";
      const key = `${issue.level}|${sheet}|${issue.message}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      groups.set(key, {
        level: issue.level,
        sheet,
        message: issue.message,
        count: 1,
      });
    }
    return Array.from(groups.values());
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
  const isIconEditor = selectedTool === "iconEditor";
  const isHome = selectedTool === "home";
  const showOperationAndReport = !isIconEditor && !isHome;

  const toolPanel = (() => {
    switch (selectedTool) {
      case "home": {
        return (
          <div className="tm-home">
            <h2>Texture Manager</h2>
            <p className="desc tm-home-subtitle">Choose a tool to get started.</p>
            <div className="tm-home-grid" role="list">
              {TOOL_ENTRIES.map((entry) => {
                const ToolIcon = entry.icon;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className="tm-home-tile"
                    onClick={() => {
                      setSelectedTool(entry.id);
                    }}
                    role="listitem"
                  >
                    <span className="tm-home-tile-icon" aria-hidden>
                      <ToolIcon size={28} strokeWidth={1.75} />
                    </span>
                    <span className="tm-home-tile-label">{entry.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      }
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
            onInputDirChange={setGlowInputDir}
            onOutputDirChange={setGlowOutputDir}
            onThicknessChange={setGlowThickness}
            onToleranceChange={setGlowTolerance}
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

      <header className="tm-header">
        <h1 className="tm-title">
          <Sparkles size={22} />
          Texture Manager 2
        </h1>
        <div className="tm-meta">
          <span className="chip">
            <Box size={13} />
            Rust + Tauri + React
          </span>
          <span className="chip">
            <Activity size={13} />
            {runtimeLabel}
          </span>
        </div>
      </header>

      <section
        className={`tm-layout ${
          isIconEditor || isHome ? "tm-layout-icon-editor" : ""
        }`}
      >
        <aside className="tm-sidebar tm-glass-card">
          <h3 className="tm-section-title">Tools</h3>
          <button
            className={`menu-btn ${selectedTool === "home" ? "active" : ""}`}
            onClick={() => {
              setSelectedTool("home");
            }}
            type="button"
          >
            <House size={16} />
            Home
          </button>
          {TOOL_ENTRIES.map((entry) => {
            const ToolIcon = entry.icon;
            return (
              <Fragment key={entry.id}>
                {entry.id === "splitter" ? (
                  <div className="tm-tool-divider" role="separator" aria-hidden="true" />
                ) : null}
                <button
                  className={`menu-btn ${selectedTool === entry.id ? "active" : ""}`}
                  onClick={() => {
                    setSelectedTool(entry.id);
                  }}
                  type="button"
                >
                  <ToolIcon size={16} />
                  {entry.label}
                </button>
                {entry.id === "porter" ? (
                  <div className="tm-tool-divider" role="separator" aria-hidden="true" />
                ) : null}
              </Fragment>
            );
          })}
          <button className="menu-btn disabled" type="button" disabled>
            Create Geode Buttons (later)
          </button>
          <div className="tm-tool-divider" role="separator" aria-hidden="true" />
          <button className="menu-btn disabled" type="button" disabled>
            Randomizer
          </button>
        </aside>

        <section className={`tm-panel tm-glass-card${isIconEditor ? " tm-panel-icon-editor" : ""}`}>
          {toolPanel}

          {showOperationAndReport ? (
            <div className="actions">
              <button
                type="button"
                className="tm-primary-btn"
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
          <section className={`tm-report tm-glass-card tm-report-state-${reportState}`}>
            <h3 className="tm-tool-title">
              <Activity size={18} />
              Run Output
            </h3>
            {loadError ? (
              <p className="error">
                <AlertCircle size={15} />
                Defaults load error: {loadError}
              </p>
            ) : null}
            {runError ? (
              <p className="error">
                <AlertCircle size={15} />
                Run error: {runError}
              </p>
            ) : null}
            {!report ? <p>No operation has run yet.</p> : null}
            {report ? (
              <>
                <p>
                  <strong>Operation:</strong> {report.operation}
                </p>
                <p>
                  <strong>Output:</strong> {report.outputDir}
                </p>
                <p>
                  <strong>Processed:</strong> {report.filesProcessed} /{" "}
                  {report.filesSeen}
                </p>
                <p>
                  <strong>Elapsed:</strong> {(report.elapsedMs / 1000).toFixed(2)} s
                </p>
                <h4>Issues</h4>
                {report.issues.length === 0 ? <p>None</p> : null}
                {report.issues.length > 0 ? (
                  <div className="tm-issues-list">
                    {groupedIssues.map((issue, index) => (
                      <div
                        className={`tm-issue-row tm-issue-row-${issue.level}`}
                        key={`${issue.level}-${issue.sheet}-${index}`}
                      >
                        <span className={`tm-issue-chip tm-issue-chip-${issue.level}`}>
                          [{issue.level}]
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
              </>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}

export default App;
