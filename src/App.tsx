import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
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
  Package,
} from "lucide-react";
import "./App.css";
import {
  OperationProgress,
  OperationReport,
  OperationRequest,
} from "./domain/operations";
import type { GeodeButtonsOptions } from "./domain/operations";
import {
  DEFAULT_PACK_INSTALLER_BRIDGE,
  type PackInstallerBridge,
} from "./domain/packInstaller";
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
import { ParticleEditorToolPanel } from "./components/tools/ParticleEditorToolPanel";
import { SettingsToolPanel } from "./components/tools/SettingsToolPanel";
import {
  TexturePackInstallerToolPanel,
  type PackInstallerSidebarActions,
} from "./components/tools/TexturePackInstallerToolPanel";
import { PackInstallerMetadataSidebar } from "./components/tools/PackInstallerMetadataSidebar";
import { useShellPanelTransition } from "./hooks/useShellPanelTransition";
import { HomeScreen } from "./components/HomeScreen";
import { AppSidebar } from "./components/AppSidebar";
import { AppGameBackground } from "./components/AppGameBackground";
import { CopyrightDialog } from "./components/CopyrightDialog";
import { GlassFrost } from "./components/GlassFrost";
import { OnboardingFlow } from "./components/OnboardingFlow";
import { AppUpdateBanner } from "./components/AppUpdateBanner";
import {
  allAppBackgroundOptions,
  APP_BACKGROUND_RANDOM,
  DEFAULT_APP_BACKGROUND_OPACITY,
} from "./config/appBackground";
import { APP_VERSION } from "./config/appMeta";
import { isUpcomingTool } from "./config/toolNavigation";
import {
  buildIssuesCsvFromReport,
  copyTextToClipboard,
  downloadTextFile,
  groupReportIssues,
  issuesCsvFileName,
} from "./utils/reportIssuesCsv";
import {
  redactAbsolutePathsInText,
  shortenPathForDisplay,
} from "./utils/pathDisplay";
import convertVersionMap from "./config/convertVersionMap.json";
import type { AppLanguage, AppSettingsView } from "./domain/settings";
import {
  CURRENT_ONBOARDING_VERSION,
  DEFAULT_APP_SETTINGS_VIEW,
} from "./domain/settings";
import {
  addCustomAppBackground,
  clearGeometryDashDir,
  getAppSettings,
  openPathInOs,
  redetectGeometryDashDir,
  removeCustomAppBackground,
  saveAppSettings,
  setGeometryDashDir,
} from "./services/tauriSettings";
import {
  checkForAppUpdate,
  getAppPackageVersion,
  type AvailableAppUpdate,
} from "./services/tauriUpdater";
import { applyTheme, setStoredTheme, type AppTheme } from "./utils/theme";
import { changeAppLanguage } from "./i18n";
import { resolveInitialAppLanguage } from "./i18n/languages";

type PrimaryTool =
  | "home"
  | "settings"
  | "iconEditor"
  | "splitter"
  | "porter"
  | "merger"
  | "randomizer"
  | "convertToNewVersion"
  | "glowMaker"
  | "geodeButtons"
  | "texturePackInstaller"
  | "particleEditor";

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
  const { t } = useTranslation();
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
  const [isCopyrightOpen, setIsCopyrightOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettingsView>(
    DEFAULT_APP_SETTINGS_VIEW,
  );
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [availableUpdate, setAvailableUpdate] =
    useState<AvailableAppUpdate | null>(null);
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);
  const [updateCheckBusy, setUpdateCheckBusy] = useState(false);
  const [updateStatusMessage, setUpdateStatusMessage] = useState<string | null>(
    null,
  );
  const [updateStatusTone, setUpdateStatusTone] = useState<
    "success" | "warning" | "danger" | "info" | "neutral" | null
  >(null);
  const updateCheckBusyRef = useRef(false);
  /** While set, applySettingsView must not clobber a newer in-flight opacity drag. */
  const optimisticBackgroundOpacityRef = useRef<number | null>(null);
  const backgroundOpacitySaveTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
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
  const [splitterSkipIcons, setSplitterSkipIcons] = useState(false);
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

  const [packInstallerBridge, setPackInstallerBridge] = useState<PackInstallerBridge>(
    DEFAULT_PACK_INSTALLER_BRIDGE,
  );
  const [packInstallerSidebarActions, setPackInstallerSidebarActions] =
    useState<PackInstallerSidebarActions | null>(null);

  useEffect(() => {
    const loadDefaults = async (): Promise<void> => {
      try {
        const settings = await getAppSettings();
        const language = resolveInitialAppLanguage({
          persistedLanguage: settings.language,
          onboardingComplete:
            settings.onboardingVersion >= CURRENT_ONBOARDING_VERSION,
        });
        const resolvedSettings =
          settings.language === language ? settings : { ...settings, language };
        await changeAppLanguage(language);
        setAppSettings(resolvedSettings);
        applyTheme(settings.theme);
        setStoredTheme(settings.theme);
        const version = await getAppPackageVersion();
        setAppVersion(version);

        const response = await getPhaseDefaults();
        const concurrency = settings.defaultSheetConcurrency;
        setSplitterSheetConcurrency(
          response.splitter.sheetConcurrency || concurrency,
        );
        setSplitterSkipIcons(response.splitter.skipIcons ?? false);
        setPorterSheetConcurrency(
          response.porter.sheetConcurrency || concurrency,
        );
        setMergerSheetConcurrency(
          response.merger.sheetConcurrency || concurrency,
        );
        setConvertSheetConcurrency(
          response.convertToNewVersion.sheetConcurrency || concurrency,
        );
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : t("errors:defaults.loadFailed"),
        );
      } finally {
        setSettingsHydrated(true);
      }
    };

    loadDefaults().catch((error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : t("errors:defaults.unexpectedLoadFailure");
      setLoadError(message);
      setSettingsHydrated(true);
    });
  }, []);

  const applySettingsView = useCallback((view: AppSettingsView): void => {
    setAppSettings((prev) => {
      if (prev.theme !== view.theme) {
        applyTheme(view.theme);
        setStoredTheme(view.theme);
      }
      if (prev.language !== view.language) {
        void changeAppLanguage(view.language);
      }
      const optimisticOpacity = optimisticBackgroundOpacityRef.current;
      if (optimisticOpacity !== null) {
        const sameOpacity =
          Math.round(view.appBackgroundOpacity * 100) ===
          Math.round(optimisticOpacity * 100);
        if (sameOpacity) {
          optimisticBackgroundOpacityRef.current = null;
          return view;
        }
        return { ...view, appBackgroundOpacity: optimisticOpacity };
      }
      return view;
    });
    setSplitterSheetConcurrency(view.defaultSheetConcurrency);
    setPorterSheetConcurrency(view.defaultSheetConcurrency);
    setMergerSheetConcurrency(view.defaultSheetConcurrency);
    setConvertSheetConcurrency(view.defaultSheetConcurrency);
  }, []);

  useEffect(() => {
    return () => {
      if (backgroundOpacitySaveTimerRef.current !== null) {
        clearTimeout(backgroundOpacitySaveTimerRef.current);
      }
    };
  }, []);

  const runSettingsAction = useCallback(
    async (
      action: () => Promise<AppSettingsView>,
      options?: { blockUi?: boolean; applyResult?: boolean },
    ): Promise<void> => {
      const blockUi = options?.blockUi ?? true;
      const applyResult = options?.applyResult ?? true;
      setSettingsError(null);
      if (blockUi) {
        setSettingsBusy(true);
      }
      try {
        const view = await action();
        if (applyResult) {
          applySettingsView(view);
        }
      } catch (error) {
        setSettingsError(
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        if (blockUi) {
          setSettingsBusy(false);
        }
      }
    },
    [applySettingsView],
  );

  const pickFolder = async (assign: (path: string) => void): Promise<void> => {
    if (!isTauriRuntime()) {
      setRunError(t("errors:runtime.folderPickerUnavailable"));
      return;
    }
    const selected = await open({
      directory: true,
      multiple: false,
      title: t("common:selectFolder"),
    });
    if (typeof selected === "string" && selected.trim().length > 0) {
      assign(selected);
    }
  };

  const runOnboardingAction = useCallback(
    async (action: () => Promise<AppSettingsView>): Promise<void> => {
      setOnboardingError(null);
      setOnboardingBusy(true);
      try {
        const view = await action();
        applySettingsView(view);
      } catch (error) {
        setOnboardingError(
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        setOnboardingBusy(false);
      }
    },
    [applySettingsView],
  );

  const completeOnboarding = useCallback(
    async (choices: { language: AppLanguage; theme: AppTheme }): Promise<void> => {
      setOnboardingError(null);
      setOnboardingBusy(true);
      try {
        applyTheme(choices.theme);
        setStoredTheme(choices.theme);
        await changeAppLanguage(choices.language);
        const view = await saveAppSettings({
          language: choices.language,
          theme: choices.theme,
          onboardingVersion: CURRENT_ONBOARDING_VERSION,
        });
        applySettingsView(view);
      } catch (error) {
        setOnboardingError(
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        setOnboardingBusy(false);
      }
    },
    [applySettingsView],
  );

  const handleLanguageChange = useCallback(
    async (language: AppLanguage): Promise<void> => {
      const previousLanguage = appSettings.language;
      if (language === previousLanguage) {
        return;
      }
      setSettingsError(null);
      setAppSettings((previous) => ({ ...previous, language }));
      await changeAppLanguage(language);
      try {
        const view = await saveAppSettings({ language });
        applySettingsView(view);
      } catch (error) {
        await changeAppLanguage(previousLanguage);
        setAppSettings((previous) => ({
          ...previous,
          language: previousLanguage,
        }));
        setSettingsError(
          t("settings:saveFailed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    },
    [appSettings.language, applySettingsView, t],
  );

  const needsOnboarding =
    settingsHydrated &&
    appSettings.onboardingVersion < CURRENT_ONBOARDING_VERSION;

  const runUpdateCheck = useCallback(
    async (options?: { silent?: boolean }): Promise<void> => {
      const silent = options?.silent ?? false;
      if (updateCheckBusyRef.current) {
        return;
      }
      updateCheckBusyRef.current = true;
      setUpdateCheckBusy(true);
      if (!silent) {
        setUpdateStatusMessage(t("settings:updates.checking"));
        setUpdateStatusTone("info");
      }
      try {
        const result = await checkForAppUpdate();
        switch (result.status) {
          case "unsupported":
            setAvailableUpdate(null);
            setUpdateStatusMessage(t("settings:updates.unsupported"));
            setUpdateStatusTone("warning");
            break;
          case "upToDate":
            setAvailableUpdate(null);
            setAppVersion(result.currentVersion);
            setUpdateStatusMessage(
              t("settings:updates.upToDate", { version: result.currentVersion }),
            );
            setUpdateStatusTone("success");
            break;
          case "available":
            setAvailableUpdate(result.update);
            setUpdateBannerDismissed(false);
            setAppVersion(result.update.currentVersion);
            setUpdateStatusMessage(
              t("settings:updates.available", {
                version: result.update.version,
                current: result.update.currentVersion,
              }),
            );
            setUpdateStatusTone("info");
            break;
          case "error":
            setAvailableUpdate(null);
            setAppVersion(result.currentVersion);
            if (silent) {
              setUpdateStatusMessage(null);
              setUpdateStatusTone(null);
            } else {
              setUpdateStatusMessage(
                t("settings:updates.checkFailed", { error: result.message }),
              );
              setUpdateStatusTone("danger");
            }
            break;
          default: {
            const _exhaustive: never = result;
            void _exhaustive;
            break;
          }
        }
      } finally {
        updateCheckBusyRef.current = false;
        setUpdateCheckBusy(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!settingsHydrated || needsOnboarding) {
      return;
    }
    const timer = window.setTimeout(() => {
      void runUpdateCheck({ silent: true });
    }, 1500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [settingsHydrated, needsOnboarding, runUpdateCheck]);

  const executeSelectedOperation = async (): Promise<void> => {
    setRunError(null);
    setReport(null);

    let request: OperationRequest | null = null;

    if (selectedTool === "splitter") {
      if (!splitterInputDir || !splitterOutputDir) {
        setRunError(t("errors:validation.splitterPathsRequired"));
        return;
      }
      request = {
        kind: "splitter",
        inputDir: splitterInputDir,
        outputDir: splitterOutputDir,
        options: {
          type: "splitter",
          sheetConcurrency: splitterSheetConcurrency,
          skipIcons: splitterSkipIcons,
        },
      };
    }

    if (selectedTool === "porter") {
      if (!porterInputDir || !porterOutputDir) {
        setRunError(t("errors:validation.porterPathsRequired"));
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
        setRunError(t("errors:validation.mergerPathsRequired"));
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
        setRunError(t("errors:validation.glowMakerPathsRequired"));
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
        setRunError(t("errors:validation.convertPathsRequired"));
        return;
      }
      if (!convertGameVersion.trim()) {
        setRunError(t("errors:validation.convertVersionRequired"));
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
        setRunError(t("errors:validation.randomizerPathsRequired"));
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
        setRunError(t("errors:validation.geodeButtonsPathsRequired"));
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
      setRunError(t("errors:validation.operationRequestMissing"));
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
          ? t("errors:operation.cancelled")
          : t("errors:operation.backendExecutionFailed", {
              error: redactAbsolutePathsInText(raw),
            }),
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
      ? t("reports:status.running")
      : reportState === "success"
        ? t("reports:status.complete")
        : reportState === "warning"
          ? t("reports:status.warnings")
          : reportState === "error"
            ? runError
              ? t("reports:status.runFailed")
              : t("reports:status.errorsFound")
            : t("reports:status.ready");
  const isIconEditor = selectedTool === "iconEditor";
  const isParticleEditor = selectedTool === "particleEditor";
  const isHome = selectedTool === "home";
  const isSettings = selectedTool === "settings";
  const isGeodeButtons = selectedTool === "geodeButtons";
  const isPackInstaller = selectedTool === "texturePackInstaller";
  const isToolPanel = !isIconEditor && !isParticleEditor && !isHome && !isSettings;
  const showRunAction = isToolPanel && !isPackInstaller;
  const showOperationAndReport =
    !isIconEditor &&
    !isParticleEditor &&
    !isHome &&
    !isGeodeButtons &&
    !isSettings &&
    !isPackInstaller;
  const showPackMetadataRail = isPackInstaller;
  const showRightRail = showOperationAndReport || showPackMetadataRail;

  const shellBackgroundOptions = useMemo(
    () =>
      allAppBackgroundOptions(
        appSettings.availableAppBackgrounds,
        appSettings.availableCustomAppBackgrounds,
      ),
    [
      appSettings.availableAppBackgrounds,
      appSettings.availableCustomAppBackgrounds,
    ],
  );

  const toolPanel = (() => {
    switch (selectedTool) {
      case "home":
        return (
          <HomeScreen
            onSelectTool={(toolId) => {
              if (isUpcomingTool(toolId)) {
                return;
              }
              setSelectedTool(toolId);
            }}
          />
        );
      case "settings":
        return (
          <SettingsToolPanel
            settings={appSettings}
            busy={settingsBusy}
            error={settingsError}
            appVersion={appVersion}
            updateStatusMessage={updateStatusMessage}
            updateStatusTone={updateStatusTone}
            updateCheckBusy={updateCheckBusy}
            operationRunning={isRunning}
            pickFolder={pickFolder}
            onCheckForUpdates={() => {
              void runUpdateCheck({ silent: false });
            }}
            onThemeChange={(theme: AppTheme) => {
              // Optimistic: keep selection/theme stable while Tauri persists.
              applyTheme(theme);
              setStoredTheme(theme);
              setAppSettings((prev) =>
                prev.theme === theme ? prev : { ...prev, theme },
              );
              runSettingsAction(() => saveAppSettings({ theme }), {
                blockUi: false,
              }).catch(() => {
                // Error surfaced via settingsError.
              });
            }}
            onLanguageChange={(language) => {
              void handleLanguageChange(language);
            }}
            onConcurrencyChange={(value) => {
              setAppSettings((prev) =>
                prev.defaultSheetConcurrency === value
                  ? prev
                  : { ...prev, defaultSheetConcurrency: value },
              );
              setSplitterSheetConcurrency(value);
              setPorterSheetConcurrency(value);
              setMergerSheetConcurrency(value);
              setConvertSheetConcurrency(value);
              runSettingsAction(
                () => saveAppSettings({ defaultSheetConcurrency: value }),
                { blockUi: false },
              ).catch(() => {
                // Error surfaced via settingsError.
              });
            }}
            onGeometryDashPathSelected={(path) => {
              runSettingsAction(() => setGeometryDashDir(path)).catch(() => {
                // Error surfaced via settingsError.
              });
            }}
            onClearGeometryDashOverride={() => {
              runSettingsAction(() => clearGeometryDashDir()).catch(() => {
                // Error surfaced via settingsError.
              });
            }}
            onRedetectGeometryDash={() => {
              runSettingsAction(() => redetectGeometryDashDir()).catch(() => {
                // Error surfaced via settingsError.
              });
            }}
            onOpenCacheFolder={() => {
              if (!appSettings.gameFilesRoot) {
                return;
              }
              openPathInOs(appSettings.gameFilesRoot).catch((error: unknown) => {
                setSettingsError(
                  error instanceof Error ? error.message : String(error),
                );
              });
            }}
            onAppBackgroundChange={(appBackground) => {
              setAppSettings((prev) =>
                prev.appBackground === appBackground
                  ? prev
                  : { ...prev, appBackground },
              );
              runSettingsAction(() => saveAppSettings({ appBackground }), {
                blockUi: false,
              }).catch(() => {
                // Error surfaced via settingsError.
              });
            }}
            onAddCustomAppBackground={(sourcePath) => {
              runSettingsAction(() => addCustomAppBackground(sourcePath)).catch(
                () => {
                  // Error surfaced via settingsError.
                },
              );
            }}
            onRemoveCustomAppBackground={(id) => {
              runSettingsAction(() => removeCustomAppBackground(id), {
                blockUi: false,
              }).catch(() => {
                // Error surfaced via settingsError.
              });
            }}
            onAppBackgroundOpacityChange={(appBackgroundOpacity) => {
              optimisticBackgroundOpacityRef.current = appBackgroundOpacity;
              setAppSettings((prev) =>
                prev.appBackgroundOpacity === appBackgroundOpacity
                  ? prev
                  : { ...prev, appBackgroundOpacity },
              );
              if (backgroundOpacitySaveTimerRef.current !== null) {
                clearTimeout(backgroundOpacitySaveTimerRef.current);
              }
              // Debounce disk writes: range input fires many times per drag.
              // Skip applying the save result — optimistic UI is already correct,
              // and out-of-order responses were snapping the slider backwards.
              backgroundOpacitySaveTimerRef.current = setTimeout(() => {
                backgroundOpacitySaveTimerRef.current = null;
                const value = optimisticBackgroundOpacityRef.current;
                if (value === null) {
                  return;
                }
                runSettingsAction(
                  async () => {
                    const view = await saveAppSettings({
                      appBackgroundOpacity: value,
                    });
                    if (
                      optimisticBackgroundOpacityRef.current !== null &&
                      Math.round(optimisticBackgroundOpacityRef.current * 100) ===
                        Math.round(value * 100)
                    ) {
                      optimisticBackgroundOpacityRef.current = null;
                    }
                    return view;
                  },
                  { blockUi: false, applyResult: false },
                ).catch(() => {
                  // Error surfaced via settingsError.
                });
              }, 180);
            }}
            onResetDefaults={() => {
              optimisticBackgroundOpacityRef.current = null;
              if (backgroundOpacitySaveTimerRef.current !== null) {
                clearTimeout(backgroundOpacitySaveTimerRef.current);
                backgroundOpacitySaveTimerRef.current = null;
              }
              runSettingsAction(() =>
                saveAppSettings({
                  clearGeometryDashDir: true,
                  defaultSheetConcurrency: DEFAULT_SHEET_CONCURRENCY,
                  theme: "dark",
                  language: "en",
                  appBackground: APP_BACKGROUND_RANDOM,
                  appBackgroundOpacity: DEFAULT_APP_BACKGROUND_OPACITY,
                }),
              ).catch(() => {
                // Error surfaced via settingsError.
              });
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
            skipIcons={splitterSkipIcons}
            onInputDirChange={setSplitterInputDir}
            onOutputDirChange={setSplitterOutputDir}
            onSheetConcurrencyChange={setSplitterSheetConcurrency}
            onSkipIconsChange={setSplitterSkipIcons}
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
      case "particleEditor":
        return <ParticleEditorToolPanel />;
      case "texturePackInstaller":
        return (
          <TexturePackInstallerToolPanel
            geometryDashFound={appSettings.geometryDashFound}
            bridge={packInstallerBridge}
            onBridgeChange={setPackInstallerBridge}
            onSidebarActionsChange={setPackInstallerSidebarActions}
          />
        );
      default: {
        const neverTool: never = selectedTool;
        throw new Error(`Unhandled tool selection: ${neverTool}`);
      }
    }
  })();

  if (!settingsHydrated) {
    return (
      <main className="tm-shell tm-shell--boot">
        <div className="tm-bg" aria-hidden="true">
          <span className="tm-bg-orb tm-bg-orb-a" />
          <span className="tm-bg-orb tm-bg-orb-b" />
          <span className="tm-bg-orb tm-bg-orb-c" />
          <span className="tm-bg-orb tm-bg-orb-d" />
        </div>
      </main>
    );
  }

  if (needsOnboarding) {
    return (
      <main className="tm-shell tm-shell--onboarding">
        <div className="tm-bg" aria-hidden="true">
          <span className="tm-bg-orb tm-bg-orb-a" />
          <span className="tm-bg-orb tm-bg-orb-b" />
          <span className="tm-bg-orb tm-bg-orb-c" />
          <span className="tm-bg-orb tm-bg-orb-d" />
        </div>
        <AppGameBackground
          setting={appSettings.appBackground}
          options={shellBackgroundOptions}
          opacity={appSettings.appBackgroundOpacity}
        />
        <OnboardingFlow
          settings={appSettings}
          busy={onboardingBusy}
          error={onboardingError}
          pickFolder={pickFolder}
          onThemeChange={(theme: AppTheme) => {
            applyTheme(theme);
            setStoredTheme(theme);
            setAppSettings((prev) =>
              prev.theme === theme ? prev : { ...prev, theme },
            );
          }}
          onLanguagePreview={(language) => {
            void changeAppLanguage(language);
            setAppSettings((previous) => ({ ...previous, language }));
          }}
          onGeometryDashPathSelected={(path) => {
            runOnboardingAction(() => setGeometryDashDir(path)).catch(() => {
              // Error surfaced via onboardingError.
            });
          }}
          onRedetectGeometryDash={() => {
            runOnboardingAction(() => redetectGeometryDashDir()).catch(() => {
              // Error surfaced via onboardingError.
            });
          }}
          onComplete={(choices) => {
            completeOnboarding(choices).catch(() => {
              // Error surfaced via onboardingError.
            });
          }}
        />
      </main>
    );
  }

  return (
    <main className="tm-shell">
      <div className="tm-bg" aria-hidden="true">
        <span className="tm-bg-orb tm-bg-orb-a" />
        <span className="tm-bg-orb tm-bg-orb-b" />
        <span className="tm-bg-orb tm-bg-orb-c" />
        <span className="tm-bg-orb tm-bg-orb-d" />
      </div>
      <AppGameBackground
        setting={appSettings.appBackground}
        options={shellBackgroundOptions}
        opacity={appSettings.appBackgroundOpacity}
      />
      {isRunning ? (
        <div
          className={`tm-progress-overlay tm-progress-state-${overlayState}`}
          role="alertdialog"
          aria-busy="true"
          aria-live="polite"
          aria-label={t("reports:progress.aria")}
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
                ? t("reports:progress.cancelling")
                : overlayState === "success"
                  ? t("reports:progress.completed")
                  : overlayState === "warning"
                    ? t("reports:progress.completedWithWarnings")
                    : overlayState === "error"
                      ? t("reports:progress.completedWithErrors")
                      : t("reports:progress.working")}
            </p>
            {showProgressDetails && operationProgress ? (
              <>
                <p className="tm-progress-sheet">
                  <span className="tm-progress-label">
                    {t("reports:progress.gamesheet")}
                  </span>{" "}
                  {operationProgress.gamesheetName.trim() || "—"}
                </p>
                <p className="tm-progress-count">
                  {t("reports:progress.sprites", {
                    count: operationProgress.spritesTotal,
                    completed: operationProgress.spritesCompleted,
                    total: operationProgress.spritesTotal,
                  })}
                </p>
                {(operationProgress.plistsTotal ?? 0) > 0 ? (
                  <p className="tm-progress-count">
                    {t("reports:progress.plists", {
                      count: operationProgress.plistsTotal,
                      completed: operationProgress.plistsCompleted ?? 0,
                      total: operationProgress.plistsTotal,
                    })}
                  </p>
                ) : null}
              </>
            ) : null}
            {showProgressDetails && !operationProgress ? (
              <p className="tm-progress-muted">
                {t("reports:progress.preparing")}
              </p>
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
                {t("reports:progress.cancel")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <section
        className={`tm-layout ${
          isIconEditor || isParticleEditor || isHome || isGeodeButtons || isSettings ? "tm-layout-icon-editor" : ""
        }${isNavCollapsed ? " tm-layout-nav-collapsed" : ""}${
          showRightRail && isReportCollapsed ? " tm-layout-report-collapsed" : ""
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
            if (tool !== "home" && tool !== "settings" && isUpcomingTool(tool)) {
              return;
            }
            setSelectedTool(tool);
          }}
          onCopyrightClick={() => setIsCopyrightOpen(true)}
        />

        <div className="tm-main-column">
          {availableUpdate && !updateBannerDismissed ? (
            <AppUpdateBanner
              update={availableUpdate}
              operationRunning={isRunning}
              onDismiss={() => setUpdateBannerDismissed(true)}
            />
          ) : null}
          <section
            className={`tm-panel tm-glass-card${
              isIconEditor ? " tm-panel-icon-editor" : ""
            }${isParticleEditor ? " tm-panel-particle-editor" : ""}${isHome ? " tm-panel-home" : ""}${isToolPanel || isSettings ? " tm-panel-tool" : ""}${
              isGeodeButtons ? " tm-panel-geode" : ""
            }${isPackInstaller ? " tm-panel-pack-installer" : ""}`}
          >
            <GlassFrost />
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
                  {isRunning ? t("tools:common.running") : t("tools:common.runOperation")}
                </button>
              </div>
            ) : null}
          </section>
        </div>

        {showRightRail ? (
          <section
            className={`tm-report tm-glass-card ${
              showPackMetadataRail
                ? "tm-report-state-ready tm-report-pack-meta"
                : `tm-report-state-${reportState}`
            }${isReportCollapsed ? " tm-report--collapsed" : ""}${
              reportPanelTransition.animating ? " tm-report--animating" : ""
            }`}
          >
            <GlassFrost />
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
                  ? showPackMetadataRail
                    ? t("tools:packInstaller.expandPanelAria")
                    : t("reports:expandPanelAria")
                  : showPackMetadataRail
                    ? t("tools:packInstaller.collapsePanelAria")
                    : t("reports:collapsePanelAria")
              }
              title={
                isReportCollapsed
                  ? showPackMetadataRail
                    ? t("tools:packInstaller.showPanel")
                    : t("reports:showPanel")
                  : showPackMetadataRail
                    ? t("tools:packInstaller.hidePanel")
                    : t("reports:hidePanel")
              }
              disabled={reportPanelTransition.animating}
            >
              <span className="tm-nav-btn-icon" aria-hidden>
                {showPackMetadataRail ? (
                  <Package size={16} strokeWidth={1.85} />
                ) : (
                  <Activity size={16} strokeWidth={1.85} />
                )}
              </span>
              <span className="tm-nav-btn-copy">
                <span className="tm-nav-btn-label">
                  {showPackMetadataRail
                    ? t("tools:packInstaller.metadataPanelTitle")
                    : t("reports:panelTitle")}
                </span>
              </span>
              <span className="tm-shell-panel-title-chevron" aria-hidden>
                <ChevronRight size={15} />
              </span>
            </button>
            <div className="tm-report-body" aria-hidden={isReportCollapsed}>
            <div className="tm-report-body-inner">
            {showPackMetadataRail ? (
              <PackInstallerMetadataSidebar
                bridge={packInstallerBridge}
                onBridgeChange={setPackInstallerBridge}
                onBrowsePackPng={packInstallerSidebarActions?.browsePackPng}
                onClearPackPng={packInstallerSidebarActions?.clearPackPng}
                onUpdateSelectedPackMetadata={
                  packInstallerSidebarActions?.updateSelectedPackMetadata
                }
                onUpdateLibraryPackMetadata={
                  packInstallerSidebarActions?.updateLibraryPackMetadata
                }
                onSaveLibraryMetadata={packInstallerSidebarActions?.saveLibraryMetadata}
              />
            ) : null}
            {!showPackMetadataRail && loadError ? (
              <div className="tm-report-alert tm-report-alert-error" role="alert">
                <AlertCircle size={15} strokeWidth={2} />
                <div className="tm-report-alert-copy">
                  <span className="tm-report-alert-title">
                    {t("reports:alerts.defaultsLoadError")}
                  </span>
                  <span className="tm-report-alert-message">{loadError}</span>
                </div>
              </div>
            ) : null}
            {!showPackMetadataRail && runError ? (
              <div className="tm-report-alert tm-report-alert-error" role="alert">
                <AlertCircle size={15} strokeWidth={2} />
                <div className="tm-report-alert-copy">
                  <span className="tm-report-alert-title">
                    {t("reports:alerts.runError")}
                  </span>
                  <span className="tm-report-alert-message">{runError}</span>
                </div>
              </div>
            ) : null}
            {!showPackMetadataRail && !report ? (
              <div className="tm-report-empty">
                <span className="tm-report-empty-icon" aria-hidden>
                  <Activity size={22} strokeWidth={1.75} />
                </span>
                <p className="tm-report-empty-title">
                  {t("reports:empty.title")}
                </p>
                <p className="tm-report-empty-hint">
                  {t("reports:empty.hint")}
                </p>
              </div>
            ) : null}
            {!showPackMetadataRail && report ? (
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
                        <span className="tm-report-stat-label">
                          {t("reports:summary.processed")}
                        </span>
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
                        <span className="tm-report-stat-label">
                          {t("reports:summary.elapsed")}
                        </span>
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
                      <span className="tm-report-output-path-label">
                        {t("reports:summary.output")}
                      </span>
                      <span className="tm-report-output-path-value">
                        {shortenPathForDisplay(report.outputDir)}
                      </span>
                    </span>
                  </div>
                </div>

                <section className="tm-report-issues" aria-labelledby="tm-report-issues-title">
                  <div className="tm-report-issues-head">
                    <div className="tm-report-issues-head-main">
                      <h4 id="tm-report-issues-title">
                        {t("reports:issues.title")}
                      </h4>
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
                          title={t("reports:issues.copyCsvTooltip")}
                          aria-label={t("reports:issues.copyCsvAria")}
                        >
                          <Copy size={13} strokeWidth={2} />
                          <span>
                            {issuesCsvCopied
                              ? t("reports:issues.copied")
                              : t("reports:issues.copyCsv")}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="tm-report-issues-action-btn"
                          onClick={handleDownloadIssuesCsv}
                          title={t("reports:issues.downloadCsvTooltip")}
                          aria-label={t("reports:issues.downloadCsvAria")}
                        >
                          <Download size={13} strokeWidth={2} />
                          <span>{t("reports:issues.download")}</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {report.issues.length === 0 ? (
                    <div className="tm-report-issues-empty">
                      <CheckCircle2 size={15} strokeWidth={2} />
                      <span>{t("reports:issues.noIssues")}</span>
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
                            {t(`reports:severity.${issue.level}`)}
                          </span>
                          <span className="tm-issue-sheet">{issue.sheet}</span>
                          <span className="tm-issue-message">{issue.message}</span>
                          {issue.count > 1 ? (
                            <span className="chip tm-issue-count">
                              {t("reports:issues.occurrence", {
                                count: issue.count,
                              })}
                            </span>
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

      <CopyrightDialog
        open={isCopyrightOpen}
        onClose={() => setIsCopyrightOpen(false)}
      />
    </main>
  );
}

export default App;
