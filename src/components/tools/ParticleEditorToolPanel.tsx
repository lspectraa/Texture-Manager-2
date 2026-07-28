import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  FilePlus,
  FolderOpen,
  ImagePlus,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Save,
  SaveAll,
  Undo2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { open, save } from "@tauri-apps/plugin-dialog";
import { isTauriRuntime } from "../../services/tauriOperations";
import {
  openParticleEditor,
  saveParticleEditor,
  loadParticleEditorTexture,
  defaultParticleConfig,
  getParticlePreviewIconDataUrl,
  getParticleEffectSpriteDataUrl,
  joinGameResourcePath,
  type ParticleConfig,
  type ParticlePreviewSprite,
  type TextureSource,
} from "../../services/tauriParticleEditor";
import { getGameFilesLayout } from "../../services/tauriGeodeButtons";
import {
  BLEND_PRESETS,
  DEFAULT_PARTICLE_CONFIG,
  getEmissionRate,
  withSyncedEmissionRate,
} from "../../domain/particleConfig";
import {
  detectEffectKind,
  getEffectsByGroup,
  EFFECT_GROUP_ORDER,
  type EffectGroup,
  type GDParticleEffect,
  type PreviewMode,
} from "../../domain/gdParticleEffects";
import {
  commitParticleEditorHistory,
  cloneParticleEditorSnapshot,
  emptyParticleEditorSnapshot,
  redoParticleEditorHistory,
  undoParticleEditorHistory,
  type ParticleEditorHistoryState,
  type ParticleEditorSnapshot,
} from "../../services/particleEditorHistory";
import { AppSelect, type AppSelectOption } from "../AppSelect";
import { AppTooltip } from "../AppTooltip";
import {
  ParticlePreviewCanvas,
  type ParticleBackground,
} from "./particleEditor/ParticlePreviewCanvas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type InspectorTab = "basics" | "motion" | "look" | "texture";

const BACKGROUND_ORDER: readonly ParticleBackground[] = ["dark", "checkerboard", "gd"];

const D = DEFAULT_PARTICLE_CONFIG;

const POSITION_TYPES = [0, 1, 2] as const;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;

/** Scrollport height mapped to the baseline auto zoom (1080p-class layouts). */
const ZOOM_AUTO_VIEWPORT_HEIGHT_BASE = 1000;
/** Scrollport height mapped to the max auto zoom. */
const ZOOM_AUTO_VIEWPORT_HEIGHT_FULL = 1600;
/** Baseline auto zoom at 1080p-class viewports — 150%. */
const ZOOM_AUTO_ZOOM_MIN = 1.5;
const ZOOM_AUTO_ZOOM_MAX = 2.5;

const snapZoomToTenth = (value: number): number => Math.round(value * 10) / 10;
const clampZoom = (value: number): number =>
  snapZoomToTenth(clamp(value, MIN_ZOOM, MAX_ZOOM));

/** Linear auto zoom from preview viewport height (same curve shape as Icon Editor). */
function computeAutoResolutionZoom(cssViewportHeight: number): number {
  const height = Math.max(1, cssViewportHeight);
  const span = Math.max(1, ZOOM_AUTO_VIEWPORT_HEIGHT_FULL - ZOOM_AUTO_VIEWPORT_HEIGHT_BASE);
  const linear = ZOOM_AUTO_ZOOM_MIN + (height - ZOOM_AUTO_VIEWPORT_HEIGHT_BASE) / span;
  return Math.min(ZOOM_AUTO_ZOOM_MAX, Math.max(ZOOM_AUTO_ZOOM_MIN, linear));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (c: number) =>
    Math.round(clamp(c, 0, 1) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  const n = parseInt(match[1], 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

function patchConfig<K extends keyof ParticleConfig>(
  prev: ParticleConfig,
  key: K,
  value: ParticleConfig[K],
): ParticleConfig {
  const next = { ...prev, [key]: value };
  if (key === "maxParticles" || key === "particleLifespan") {
    return withSyncedEmissionRate(next);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Compact field controls
// ---------------------------------------------------------------------------

type SliderFieldProps = {
  label: string;
  /** Short explanation rendered under the label. */
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  unit?: string;
  disabled?: boolean;
  /** Double-click resets the slider to this value. */
  defaultValue?: number;
  /** Tooltip on the slider itself (reset affordance). */
  resetHint?: string;
  onChange: (value: number) => void;
  /** Fired on pointer-up after a drag (for history commits). */
  onCommit?: () => void;
};

function FieldTip({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (!label) {
    return <>{children}</>;
  }
  return (
    <AppTooltip
      label={label}
      className={`tm-pe-field-tip${className ? ` ${className}` : ""}`}
      placement="bottom"
    >
      {children}
    </AppTooltip>
  );
}

function SliderField({
  label,
  hint,
  value,
  min,
  max,
  step = 0.01,
  decimals = 2,
  unit,
  disabled = false,
  defaultValue,
  resetHint,
  onChange,
  onCommit,
}: SliderFieldProps) {
  const display = Number.isFinite(value) ? value.toFixed(decimals) : "0";
  const resetTo =
    defaultValue !== undefined && Number.isFinite(defaultValue)
      ? clamp(defaultValue, min, max)
      : min;
  return (
    <label className={`tm-pe-field${disabled ? " tm-pe-field--disabled" : ""}`}>
      <span className="tm-pe-field-label">
        {label}
        {unit ? <span className="tm-pe-field-unit">{unit}</span> : null}
      </span>
      {hint ? <span className="tm-pe-field-hint">{hint}</span> : null}
      <div className="tm-pe-field-controls">
        <FieldTip label={resetHint}>
          <input
            type="range"
            className="tm-geode-slider tm-pe-slider"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            aria-label={label}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            onPointerUp={() => onCommit?.()}
            onDoubleClick={() => {
              onChange(resetTo);
              onCommit?.();
            }}
          />
        </FieldTip>
        <input
          type="number"
          className="tm-pe-num"
          min={min}
          max={max}
          step={step}
          value={display}
          disabled={disabled}
          onChange={(e) => {
            const next = parseFloat(e.target.value);
            if (Number.isFinite(next)) onChange(clamp(next, min, max));
          }}
          onBlur={() => onCommit?.()}
        />
      </div>
    </label>
  );
}

/** Primary value slider with a compact ± variance number beside it. */
type ValueVarianceProps = {
  label: string;
  hint?: string;
  value: number;
  variance: number;
  min: number;
  max: number;
  varMax?: number;
  step?: number;
  decimals?: number;
  unit?: string;
  disabled?: boolean;
  defaultValue?: number;
  defaultVariance?: number;
  varianceLabel: string;
  resetHint?: string;
  onChangeValue: (value: number) => void;
  onChangeVariance: (value: number) => void;
  onCommit?: () => void;
};

function ValueVarianceField({
  label,
  hint,
  value,
  variance,
  min,
  max,
  varMax,
  step = 1,
  decimals = 1,
  unit,
  disabled,
  defaultValue,
  defaultVariance,
  varianceLabel,
  resetHint,
  onChangeValue,
  onChangeVariance,
  onCommit,
}: ValueVarianceProps) {
  const varianceCeiling = varMax ?? Math.max(Math.abs(max), Math.abs(min));
  const resetValue =
    defaultValue !== undefined && Number.isFinite(defaultValue)
      ? clamp(defaultValue, min, max)
      : min;
  const varianceTip = [varianceLabel, resetHint].filter(Boolean).join(" — ");
  return (
    <div className={`tm-pe-vv${disabled ? " tm-pe-field--disabled" : ""}`}>
      <div className="tm-pe-vv-head">
        <span className="tm-pe-field-label">
          {label}
          {unit ? <span className="tm-pe-field-unit">{unit}</span> : null}
        </span>
        <div className="tm-pe-vv-nums">
          <input
            type="number"
            className="tm-pe-num"
            min={min}
            max={max}
            step={step}
            value={Number.isFinite(value) ? value.toFixed(decimals) : "0"}
            disabled={disabled}
            aria-label={label}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              if (Number.isFinite(next)) onChangeValue(clamp(next, min, max));
            }}
            onBlur={() => onCommit?.()}
          />
          <span className="tm-pe-vv-pm" aria-hidden>
            ±
          </span>
          <FieldTip label={varianceTip || undefined}>
            <input
              type="number"
              className="tm-pe-num tm-pe-num--var"
              min={0}
              max={varianceCeiling}
              step={step}
              value={Number.isFinite(variance) ? variance.toFixed(decimals) : "0"}
              disabled={disabled}
              aria-label={`${label} — ${varianceLabel}`}
              onChange={(e) => {
                const next = parseFloat(e.target.value);
                if (Number.isFinite(next)) onChangeVariance(clamp(next, 0, varianceCeiling));
              }}
              onBlur={() => onCommit?.()}
              onDoubleClick={() => {
                if (defaultVariance !== undefined) {
                  onChangeVariance(clamp(defaultVariance, 0, varianceCeiling));
                  onCommit?.();
                }
              }}
            />
          </FieldTip>
        </div>
      </div>
      {hint ? <span className="tm-pe-field-hint">{hint}</span> : null}
      <FieldTip label={resetHint}>
        <input
          type="range"
          className="tm-geode-slider tm-pe-slider"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => onChangeValue(parseFloat(e.target.value))}
          onPointerUp={() => onCommit?.()}
          onDoubleClick={() => {
            onChangeValue(resetValue);
            onCommit?.();
          }}
        />
      </FieldTip>
    </div>
  );
}

type ColorFieldProps = {
  label: string;
  alphaLabel: string;
  r: number;
  g: number;
  b: number;
  a: number;
  defaultA?: number;
  resetHint?: string;
  onChange: (rgba: { r: number; g: number; b: number; a: number }) => void;
  onCommit?: () => void;
};

function ColorField({
  label,
  alphaLabel,
  r,
  g,
  b,
  a,
  defaultA = 1,
  resetHint,
  onChange,
  onCommit,
}: ColorFieldProps) {
  const hex = useMemo(() => rgbToHex(r, g, b), [r, g, b]);
  return (
    <div className="tm-pe-color">
      <div className="tm-pe-color-head">
        <span className="tm-pe-field-label">{label}</span>
        <div className="tm-pe-color-tools">
          <input
            type="color"
            className="tm-pe-color-input"
            value={hex}
            aria-label={label}
            onChange={(e) => {
              const rgb = hexToRgb(e.target.value);
              if (rgb) onChange({ ...rgb, a });
            }}
            onBlur={() => onCommit?.()}
          />
          <span className="tm-pe-color-hex">{hex}</span>
        </div>
      </div>
      <label className="tm-pe-color-alpha">
        <span>{alphaLabel}</span>
        <FieldTip label={resetHint}>
          <input
            type="range"
            className="tm-geode-slider tm-pe-slider"
            min={0}
            max={1}
            step={0.01}
            value={a}
            aria-label={`${label} — ${alphaLabel}`}
            onChange={(e) => onChange({ r, g, b, a: parseFloat(e.target.value) })}
            onPointerUp={() => onCommit?.()}
            onDoubleClick={() => {
              onChange({ r, g, b, a: clamp(defaultA, 0, 1) });
              onCommit?.();
            }}
          />
        </FieldTip>
        <input
          type="number"
          className="tm-pe-num"
          min={0}
          max={1}
          step={0.01}
          value={a.toFixed(2)}
          onChange={(e) => {
            const next = parseFloat(e.target.value);
            if (Number.isFinite(next)) onChange({ r, g, b, a: clamp(next, 0, 1) });
          }}
          onBlur={() => onCommit?.()}
        />
      </label>
    </div>
  );
}

type ToggleProps = {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

function Toggle({ label, hint, checked, disabled, onChange }: ToggleProps) {
  return (
    <label className={`tm-pe-toggle${disabled ? " tm-pe-field--disabled" : ""}`}>
      <span className="tm-pe-toggle-copy">
        <span className="tm-pe-field-label">{label}</span>
        {hint ? <span className="tm-pe-toggle-hint">{hint}</span> : null}
      </span>
      <span className={`tm-pe-switch${checked ? " tm-pe-switch--on" : ""}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="tm-pe-switch-track" aria-hidden />
      </span>
    </label>
  );
}

type ToolbarTipProps = {
  label: string;
  shortcut?: string;
  children: React.ReactNode;
};

function ParticleToolbarTip({ label, shortcut, children }: ToolbarTipProps) {
  return (
    <AppTooltip
      label={label}
      shortcut={shortcut}
      className="tm-icon-editor-toolbar-tip"
      placement="bottom"
    >
      {children}
    </AppTooltip>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

/** @deprecated Prefer SliderField / ValueVarianceField — kept for external imports. */
export function ToolSliderField(props: SliderFieldProps) {
  return <SliderField {...props} />;
}

export function ParticleEditorToolPanel() {
  const { t } = useTranslation("tools");
  const [config, setConfig] = useState<ParticleConfig>(defaultParticleConfig);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [textureSrc, setTextureSrc] = useState<string | null>(null);
  /** How the current texture was obtained — drives whether save embeds and/or writes a sibling PNG. */
  const [textureSource, setTextureSource] = useState<TextureSource>("none");
  const [running, setRunning] = useState(true);
  const [background, setBackground] = useState<ParticleBackground>("dark");
  const [zoom, setZoom] = useState(() =>
    typeof window !== "undefined"
      ? computeAutoResolutionZoom(window.innerHeight)
      : ZOOM_AUTO_ZOOM_MIN,
  );
  const [viewportCssHeight, setViewportCssHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : ZOOM_AUTO_VIEWPORT_HEIGHT_BASE,
  );
  const stageViewportRef = useRef<HTMLDivElement | null>(null);
  const lastObservedViewportHeightRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [effectMeta, setEffectMeta] = useState<GDParticleEffect | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [usePlistSourcePosition, setUsePlistSourcePosition] = useState(false);
  const [tab, setTab] = useState<InspectorTab>("basics");
  const [showColorVariance, setShowColorVariance] = useState(false);
  const [showAdvancedBlend, setShowAdvancedBlend] = useState(false);
  const [previewIcon, setPreviewIcon] = useState<ParticlePreviewSprite | null>(null);
  const [attachSpriteAsset, setAttachSpriteAsset] = useState<ParticlePreviewSprite | null>(null);
  const [history, setHistory] = useState<ParticleEditorHistoryState>(() => {
    const present = emptyParticleEditorSnapshot();
    return { past: [], present, future: [] };
  });
  const applyingHistoryRef = useRef(false);
  const historyRef = useRef(history);
  historyRef.current = history;
  const configRef = useRef(config);
  const textureSrcRef = useRef(textureSrc);
  const textureSourceRef = useRef(textureSource);
  const filePathRef = useRef(filePath);
  const effectIdRef = useRef<string | null>(effectMeta?.id ?? null);
  const usePlistSourcePositionRef = useRef(usePlistSourcePosition);
  configRef.current = config;
  textureSrcRef.current = textureSrc;
  textureSourceRef.current = textureSource;
  filePathRef.current = filePath;
  effectIdRef.current = effectMeta?.id ?? null;
  usePlistSourcePositionRef.current = usePlistSourcePosition;

  const previewMode: PreviewMode = effectMeta?.previewMode ?? "static";
  const attachSprite = effectMeta?.attachSprite ?? null;
  const isGravity = config.emitterType === 0;
  const forever = config.duration < 0;
  const fileName = filePath ? filePath.split(/[\\/]/).pop() : null;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const autoResolutionZoom = useMemo(
    () => computeAutoResolutionZoom(viewportCssHeight),
    [viewportCssHeight],
  );
  const resetHint = t("particleEditor.fields.resetHint");

  const blendPresetIndex = BLEND_PRESETS.findIndex(
    (p) => p.src === config.blendFuncSource && p.dst === config.blendFuncDestination,
  );

  const emissionRate =
    config.particleLifespan > 0 ? getEmissionRate(config).toFixed(1) : "—";

  const positionTypeHints = useMemo(
    () =>
      [
        t("particleEditor.positionType.freeHint"),
        t("particleEditor.positionType.relativeHint"),
        t("particleEditor.positionType.groupedHint"),
      ] as const,
    [t],
  );
  const positionTypeLabels = useMemo(
    () =>
      [
        t("particleEditor.positionType.free"),
        t("particleEditor.positionType.relative"),
        t("particleEditor.positionType.grouped"),
      ] as const,
    [t],
  );
  const previewModeLabel = useCallback(
    (mode: PreviewMode): string => t(`particleEditor.previewModes.${mode}`),
    [t],
  );

  const backgroundLabel = useCallback(
    (value: ParticleBackground): string => {
      switch (value) {
        case "dark":
          return t("particleEditor.stage.bgDark");
        case "checkerboard":
          return t("particleEditor.stage.bgChecker");
        case "gd":
          return t("particleEditor.stage.bgGd");
        default: {
          const _exhaustive: never = value;
          return _exhaustive;
        }
      }
    },
    [t],
  );

  const inspectorTabs = useMemo(
    () =>
      [
        { id: "basics", label: t("particleEditor.tabs.basics") },
        { id: "motion", label: t("particleEditor.tabs.motion") },
        { id: "look", label: t("particleEditor.tabs.look") },
        { id: "texture", label: t("particleEditor.tabs.texture") },
      ] as const satisfies readonly { id: InspectorTab; label: string }[],
    [t],
  );

  const effectOptions = useMemo<AppSelectOption[]>(() => {
    const options: AppSelectOption[] = [
      { value: "", label: t("particleEditor.toolbar.effectCustom") },
    ];
    for (const group of EFFECT_GROUP_ORDER) {
      const groupLabel = t(`particleEditor.effectGroups.${group satisfies EffectGroup}`);
      for (const effect of getEffectsByGroup(group)) {
        options.push({
          value: effect.id,
          label: t(`particleEditor.effects.${effect.id}`, {
            defaultValue: effect.label,
          }),
          group: groupLabel,
        });
      }
    }
    return options;
  }, [t]);

  const buildSnapshot = useCallback(
    (overrides?: Partial<ParticleEditorSnapshot>): ParticleEditorSnapshot => {
      const base: ParticleEditorSnapshot = {
        config: configRef.current,
        textureSrc: textureSrcRef.current,
        textureSource: textureSourceRef.current,
        filePath: filePathRef.current,
        effectId: effectIdRef.current,
        usePlistSourcePosition: usePlistSourcePositionRef.current,
      };
      return cloneParticleEditorSnapshot({ ...base, ...overrides });
    },
    [],
  );

  const commitHistory = useCallback((snapshot?: ParticleEditorSnapshot) => {
    if (applyingHistoryRef.current) return;
    const next = snapshot ?? buildSnapshot();
    setHistory((prev) => commitParticleEditorHistory(prev, next));
  }, [buildSnapshot]);

  const applySnapshot = useCallback((snapshot: ParticleEditorSnapshot) => {
    applyingHistoryRef.current = true;
    configRef.current = snapshot.config;
    textureSrcRef.current = snapshot.textureSrc;
    textureSourceRef.current = snapshot.textureSource;
    filePathRef.current = snapshot.filePath;
    effectIdRef.current = snapshot.effectId;
    usePlistSourcePositionRef.current = snapshot.usePlistSourcePosition;
    setConfig(snapshot.config);
    setTextureSrc(snapshot.textureSrc);
    setTextureSource(snapshot.textureSource);
    setFilePath(snapshot.filePath);
    setUsePlistSourcePosition(snapshot.usePlistSourcePosition);
    if (snapshot.effectId) {
      const found = EFFECT_GROUP_ORDER.flatMap((g) => getEffectsByGroup(g)).find(
        (ef) => ef.id === snapshot.effectId,
      );
      setEffectMeta(found ?? null);
    } else {
      setEffectMeta(null);
    }
    setResetKey((k) => k + 1);
    queueMicrotask(() => {
      applyingHistoryRef.current = false;
    });
  }, []);

  const undoEdits = useCallback(() => {
    const next = undoParticleEditorHistory(historyRef.current);
    if (!next) return;
    setHistory(next);
    applySnapshot(next.present);
  }, [applySnapshot]);

  const redoEdits = useCallback(() => {
    const next = redoParticleEditorHistory(historyRef.current);
    if (!next) return;
    setHistory(next);
    applySnapshot(next.present);
  }, [applySnapshot]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoEdits();
      }
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redoEdits();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redoEdits, undoEdits]);

  useLayoutEffect(() => {
    const element = stageViewportRef.current;
    if (!element) {
      return;
    }
    const update = (): void => {
      const h = Math.max(1, element.clientHeight);
      setViewportCssHeight((previous) => (previous === h ? previous : h));
      if (Math.abs(h - lastObservedViewportHeightRef.current) > 0.5) {
        lastObservedViewportHeightRef.current = h;
        const nextZoom = computeAutoResolutionZoom(h);
        setZoom((current) => (Math.abs(current - nextZoom) < 0.0001 ? current : nextZoom));
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const kind = effectMeta?.defaultIcon === "ship" ? "ship" : null;
    void getParticlePreviewIconDataUrl(false, kind).then((sprite) => {
      if (!cancelled && sprite) setPreviewIcon(sprite);
    });
    return () => {
      cancelled = true;
    };
  }, [effectMeta?.defaultIcon]);

  useEffect(() => {
    if (!attachSprite) {
      setAttachSpriteAsset(null);
      return;
    }
    let cancelled = false;
    void getParticleEffectSpriteDataUrl(attachSprite.sheet, attachSprite.frame).then((sprite) => {
      if (!cancelled) setAttachSpriteAsset(sprite);
    });
    return () => {
      cancelled = true;
    };
  }, [attachSprite]);

  const refreshPreviewIcon = useCallback((iconKind?: "ship" | null) => {
    // Only treat an explicit "ship" | null as an override. onClick handlers pass
    // a MouseEvent as the first arg — that must not become `kind`.
    const kind =
      iconKind === "ship"
        ? "ship"
        : iconKind === null
          ? null
          : effectMeta?.defaultIcon === "ship"
            ? "ship"
            : null;
    void getParticlePreviewIconDataUrl(true, kind).then((sprite) => {
      if (sprite) setPreviewIcon(sprite);
    });
  }, [effectMeta?.defaultIcon]);

  const updateConfig = useCallback((updater: (prev: ParticleConfig) => ParticleConfig) => {
    setConfig((prev) => {
      const next = updater(prev);
      configRef.current = next;
      return next;
    });
  }, []);

  const set = useCallback(<K extends keyof ParticleConfig>(key: K, value: ParticleConfig[K]) => {
    updateConfig((prev) => patchConfig(prev, key, value));
  }, [updateConfig]);

  const handleOpen = useCallback(async () => {
    if (!isTauriRuntime()) {
      setError(t("particleEditor.errors.desktopOnlyOpen"));
      return;
    }
    setError(null);
    try {
      const selected = await open({
        title: t("particleEditor.dialogs.openTitle"),
        filters: [
          { name: t("particleEditor.dialogs.plistFilter"), extensions: ["plist"] },
        ],
        multiple: false,
        directory: false,
      });
      if (typeof selected !== "string" || !selected.trim()) return;
      setBusy(true);
      const result = await openParticleEditor(selected);
      const basename = selected.split(/[\\/]/).pop() ?? "";
      const kind = detectEffectKind(basename) ?? null;
      setConfig(result.config);
      setTextureSrc(result.texturePngDataUrl);
      setTextureSource(result.textureSource);
      setFilePath(selected);
      setEffectMeta(kind);
      setResetKey((k) => k + 1);
      setTab("basics");
      commitHistory({
        config: result.config,
        textureSrc: result.texturePngDataUrl,
        textureSource: result.textureSource,
        filePath: selected,
        effectId: kind?.id ?? null,
        usePlistSourcePosition,
      });
      if (result.warnings.length > 0) setError(result.warnings.join(" · "));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [commitHistory, t, usePlistSourcePosition]);

  const handleSave = useCallback(
    async (saveAs = false) => {
      if (!isTauriRuntime()) {
        setError(t("particleEditor.errors.desktopOnlySave"));
        return;
      }
      setError(null);
      let targetPath = filePath;
      if (!targetPath || saveAs) {
        const selected = await save({
          title: t("particleEditor.dialogs.saveTitle"),
          filters: [
            { name: t("particleEditor.dialogs.plistFilter"), extensions: ["plist"] },
          ],
          defaultPath: filePath ?? undefined,
        });
        if (!selected) return;
        targetPath = selected;
      }
      setBusy(true);
      try {
        const hasTexture = Boolean(textureSrc);
        const hasFileName = Boolean(config.textureFileName.trim());
        await saveParticleEditor({
          path: targetPath,
          config,
          texturePngDataUrl: textureSrc ?? undefined,
          // Prefer sibling PNG when a filename is known; keep embeds when the
          // source was embedded or there is no sibling name to write.
          writeSiblingPng: hasTexture && hasFileName,
          embedTexture: hasTexture && (textureSource === "embedded" || !hasFileName),
        });
        setFilePath(targetPath);
        commitHistory({
          config,
          textureSrc,
          textureSource,
          filePath: targetPath,
          effectId: effectMeta?.id ?? null,
          usePlistSourcePosition,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [
      filePath,
      config,
      textureSrc,
      textureSource,
      effectMeta,
      usePlistSourcePosition,
      commitHistory,
      t,
    ],
  );

  const handleNew = useCallback(() => {
    const next = defaultParticleConfig();
    setConfig(next);
    setFilePath(null);
    setTextureSrc(null);
    setTextureSource("none");
    setError(null);
    setEffectMeta(null);
    setResetKey((k) => k + 1);
    setTab("basics");
    commitHistory({
      config: next,
      textureSrc: null,
      textureSource: "none",
      filePath: null,
      effectId: null,
      usePlistSourcePosition,
    });
  }, [commitHistory, usePlistSourcePosition]);

  const handleEffectChange = useCallback(
    async (effectId: string) => {
      if (!effectId) {
        setEffectMeta(null);
        commitHistory(buildSnapshot({ effectId: null }));
        return;
      }
      const found = EFFECT_GROUP_ORDER.flatMap((g) => getEffectsByGroup(g)).find(
        (ef) => ef.id === effectId,
      );
      if (!found) return;
      setEffectMeta(found);
      refreshPreviewIcon(found.defaultIcon === "ship" ? "ship" : null);

      if (!isTauriRuntime()) {
        commitHistory(buildSnapshot({ effectId: found.id }));
        return;
      }

      setBusy(true);
      setError(null);
      try {
        const layout = await getGameFilesLayout();
        if (!layout.resourcesDir?.trim()) {
          setError(t("particleEditor.errors.resourcesMissing"));
          commitHistory(buildSnapshot({ effectId: found.id }));
          return;
        }
        const stockPath = joinGameResourcePath(layout.resourcesDir, `${found.id}.plist`);
        const result = await openParticleEditor(stockPath);
        // Copy settings only — do not mark the stock Resources file as opened.
        setConfig(result.config);
        setTextureSrc(result.texturePngDataUrl);
        setTextureSource(result.textureSource);
        setFilePath(null);
        setResetKey((k) => k + 1);
        commitHistory({
          config: result.config,
          textureSrc: result.texturePngDataUrl,
          textureSource: result.textureSource,
          filePath: null,
          effectId: found.id,
          usePlistSourcePosition,
        });
        if (result.warnings.length > 0) setError(result.warnings.join(" · "));
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t("particleEditor.errors.stockEffectFailed", { effect: found.id }),
        );
        commitHistory(buildSnapshot({ effectId: found.id }));
      } finally {
        setBusy(false);
      }
    },
    [buildSnapshot, commitHistory, refreshPreviewIcon, t, usePlistSourcePosition],
  );

  const handleReplaceTexture = useCallback(async () => {
    if (!isTauriRuntime()) {
      setError(t("particleEditor.errors.desktopOnlyTexture"));
      return;
    }
    setError(null);
    try {
      const selected = await open({
        title: t("particleEditor.dialogs.textureTitle"),
        filters: [
          {
            name: t("particleEditor.dialogs.imageFilter"),
            extensions: ["png", "jpg", "jpeg", "tiff", "bmp"],
          },
        ],
        multiple: false,
        directory: false,
      });
      if (typeof selected !== "string" || !selected.trim()) return;
      setBusy(true);
      const dataUrl = await loadParticleEditorTexture(selected);
      const name = selected.split(/[\\/]/).pop() ?? "";
      setTextureSrc(dataUrl);
      setTextureSource("sibling");
      textureSrcRef.current = dataUrl;
      updateConfig((prev) => {
        const next = { ...prev, textureFileName: name };
        commitHistory({
          config: next,
          textureSrc: dataUrl,
          textureSource: "sibling",
          filePath: filePathRef.current,
          effectId: effectIdRef.current,
          usePlistSourcePosition: usePlistSourcePositionRef.current,
        });
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [commitHistory, t, updateConfig]);

  return (
    <div className="tm-particle-editor">
      <header className="tm-pe-toolbar">
        <div className="tm-pe-toolbar-actions">
          <ParticleToolbarTip label={t("particleEditor.toolbar.openTooltip")}>
            <button
              type="button"
              className="tm-icon-editor-toolbar-btn"
              onClick={() => {
                void handleOpen();
              }}
              disabled={busy}
            >
              <FolderOpen size={14} aria-hidden />
              <span>{t("particleEditor.toolbar.open")}</span>
            </button>
          </ParticleToolbarTip>
          <ParticleToolbarTip label={t("particleEditor.toolbar.saveTooltip")}>
            <button
              type="button"
              className="tm-icon-editor-toolbar-btn"
              onClick={() => {
                void handleSave(false);
              }}
              disabled={busy || !filePath}
            >
              <Save size={14} aria-hidden />
              <span>{t("particleEditor.toolbar.save")}</span>
            </button>
          </ParticleToolbarTip>
          <ParticleToolbarTip label={t("particleEditor.toolbar.saveAsTooltip")}>
            <button
              type="button"
              className="tm-icon-editor-toolbar-btn"
              onClick={() => {
                void handleSave(true);
              }}
              disabled={busy}
            >
              <SaveAll size={14} aria-hidden />
              <span>{t("particleEditor.toolbar.saveAs")}</span>
            </button>
          </ParticleToolbarTip>
          <span className="tm-icon-editor-toolbar-divider" aria-hidden />
          <ParticleToolbarTip label={t("particleEditor.toolbar.newTooltip")}>
            <button
              type="button"
              className="tm-icon-editor-toolbar-btn"
              onClick={handleNew}
              disabled={busy}
            >
              <FilePlus size={14} aria-hidden />
              <span>{t("particleEditor.toolbar.newParticle")}</span>
            </button>
          </ParticleToolbarTip>
          <span className="tm-icon-editor-toolbar-divider" aria-hidden />
          <ParticleToolbarTip
            label={t("particleEditor.toolbar.undoTooltip")}
            shortcut={t("particleEditor.toolbar.undoShortcut")}
          >
            <button
              type="button"
              className="tm-icon-editor-toolbar-btn tm-icon-editor-toolbar-btn--icon-only"
              onClick={undoEdits}
              disabled={!canUndo || busy}
              aria-label={t("particleEditor.toolbar.undo")}
            >
              <Undo2 size={14} aria-hidden />
            </button>
          </ParticleToolbarTip>
          <ParticleToolbarTip
            label={t("particleEditor.toolbar.redoTooltip")}
            shortcut={t("particleEditor.toolbar.redoShortcut")}
          >
            <button
              type="button"
              className="tm-icon-editor-toolbar-btn tm-icon-editor-toolbar-btn--icon-only"
              onClick={redoEdits}
              disabled={!canRedo || busy}
              aria-label={t("particleEditor.toolbar.redo")}
            >
              <Redo2 size={14} aria-hidden />
            </button>
          </ParticleToolbarTip>
          <span className="tm-icon-editor-toolbar-divider" aria-hidden />
          <div className="tm-pe-effect-pick">
            <span className="tm-pe-effect-pick-label">
              {t("particleEditor.toolbar.effect")}
            </span>
            <AppSelect
              className="tm-pe-effect-select"
              menuClassName="tm-pe-effect-menu"
              aria-label={t("particleEditor.toolbar.effectTooltip")}
              value={effectMeta?.id ?? ""}
              options={effectOptions}
              disabled={busy}
              portal
              onChange={(value) => {
                void handleEffectChange(value);
              }}
            />
          </div>
        </div>

        <div className="tm-pe-toolbar-meta">
          <span
            key={previewMode}
            className={`tm-pe-chip tm-pe-chip--preview tm-pe-chip--${previewMode}`}
            title={t("particleEditor.toolbar.previewContext")}
          >
            {previewModeLabel(previewMode)}
          </span>
          {fileName ? (
            <span className="tm-pe-filename" title={filePath ?? undefined}>
              {fileName}
            </span>
          ) : (
            <span className="tm-pe-filename tm-pe-filename--empty">
              {t("particleEditor.toolbar.untitled")}
            </span>
          )}
        </div>
      </header>

      {error ? (
        <div className="tm-pe-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label={t("particleEditor.errors.dismiss")}
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="tm-pe-body">
        <section className="tm-pe-stage" aria-label={t("particleEditor.stage.title")}>
          <div className="tm-pe-stage-card">
            <div className="tm-pe-stage-top">
              <div className="tm-pe-chips">
                <span
                  key={isGravity ? "gravity" : "radius"}
                  className={`tm-pe-chip tm-pe-chip--${isGravity ? "gravity" : "radius"}`}
                >
                  {isGravity
                    ? t("particleEditor.stage.chipGravity")
                    : t("particleEditor.stage.chipRadius")}
                </span>
                <span
                  key={`pos-${config.positionType}`}
                  className="tm-pe-chip tm-pe-chip--pos"
                >
                  {positionTypeLabels[config.positionType]}
                </span>
              </div>
              <div className="tm-pe-stage-transport">
                <div className="tm-pe-zoom" role="group" aria-label={t("particleEditor.stage.zoomIn")}>
                  <ParticleToolbarTip label={t("particleEditor.stage.zoomOut")}>
                    <button
                      type="button"
                      className="tm-icon-editor-toolbar-btn tm-icon-editor-toolbar-btn--icon-only"
                      onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
                      aria-label={t("particleEditor.stage.zoomOut")}
                    >
                      <ZoomOut size={14} aria-hidden />
                    </button>
                  </ParticleToolbarTip>
                  <ParticleToolbarTip
                    label={t("particleEditor.stage.resetZoom", {
                      percent: Math.round(autoResolutionZoom * 100),
                    })}
                  >
                    <button
                      type="button"
                      className="tm-pe-zoom-value"
                      onClick={() => setZoom(autoResolutionZoom)}
                    >
                      {Math.round(zoom * 100)}%
                    </button>
                  </ParticleToolbarTip>
                  <ParticleToolbarTip label={t("particleEditor.stage.zoomIn")}>
                    <button
                      type="button"
                      className="tm-icon-editor-toolbar-btn tm-icon-editor-toolbar-btn--icon-only"
                      onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
                      aria-label={t("particleEditor.stage.zoomIn")}
                    >
                      <ZoomIn size={14} aria-hidden />
                    </button>
                  </ParticleToolbarTip>
                </div>
                <ParticleToolbarTip
                  label={
                    running
                      ? t("particleEditor.stage.pauseTooltip")
                      : t("particleEditor.stage.playTooltip")
                  }
                >
                  <button
                    type="button"
                    className="tm-icon-editor-toolbar-btn"
                    onClick={() => setRunning((r) => !r)}
                  >
                    {running ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
                    <span>
                      {running
                        ? t("particleEditor.stage.pause")
                        : t("particleEditor.stage.play")}
                    </span>
                  </button>
                </ParticleToolbarTip>
                <ParticleToolbarTip label={t("particleEditor.stage.restartTooltip")}>
                  <button
                    type="button"
                    className="tm-icon-editor-toolbar-btn"
                    onClick={() => {
                      setResetKey((k) => k + 1);
                      setRunning(true);
                    }}
                  >
                    <RotateCcw size={14} aria-hidden />
                    <span>{t("particleEditor.stage.restart")}</span>
                  </button>
                </ParticleToolbarTip>
                <ParticleToolbarTip label={t("particleEditor.stage.refreshIconTooltip")}>
                  <button
                    type="button"
                    className="tm-icon-editor-toolbar-btn"
                    onClick={() => refreshPreviewIcon()}
                    aria-label={t("particleEditor.stage.refreshIcon")}
                  >
                    <RefreshCw size={14} aria-hidden />
                    <span>{t("particleEditor.stage.refreshIcon")}</span>
                  </button>
                </ParticleToolbarTip>
              </div>
            </div>

            <div className="tm-pe-canvas-wrap" ref={stageViewportRef}>
              <ParticlePreviewCanvas
                config={config}
                textureSrc={textureSrc}
                running={running}
                background={background}
                zoom={zoom}
                previewMode={previewMode}
                resetKey={resetKey}
                usePlistSourcePosition={usePlistSourcePosition}
                previewIconSrc={previewIcon?.dataUrl ?? null}
                previewIconAnchorX={previewIcon?.anchorX}
                previewIconAnchorY={previewIcon?.anchorY}
                attachSpriteSrc={attachSpriteAsset?.dataUrl ?? null}
                attachSpriteAnchorX={attachSpriteAsset?.anchorX}
                attachSpriteAnchorY={attachSpriteAsset?.anchorY}
              />
            </div>

            <div className="tm-pe-stage-footer">
              <div className="tm-pe-bg" role="group" aria-label={t("particleEditor.stage.background")}>
                {BACKGROUND_ORDER.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`tm-pe-bg-btn${background === value ? " tm-pe-bg-btn--active" : ""}`}
                    onClick={() => setBackground(value)}
                  >
                    {backgroundLabel(value)}
                  </button>
                ))}
              </div>
              <p className="tm-pe-stage-hint">
                {previewMode === "static"
                  ? t("particleEditor.stage.dragHint")
                  : t("particleEditor.stage.modeHint", { mode: previewModeLabel(previewMode) })}
              </p>
            </div>
          </div>
        </section>

        <aside className="tm-pe-inspector" aria-label={t("particleEditor.stage.title")}>
          <nav className="tm-pe-tabs" role="tablist">
            {inspectorTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`tm-pe-tab${tab === item.id ? " tm-pe-tab--active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="tm-pe-inspector-scroll" role="tabpanel">
            {tab === "basics" ? (
              <div className="tm-pe-stack" key="basics">
                <div className="tm-pe-block">
                  <h3 className="tm-pe-block-title">{t("particleEditor.blocks.emitter")}</h3>
                  <div
                    className="tm-pe-seg"
                    role="group"
                    aria-label={t("particleEditor.emitterMode.label")}
                  >
                    <button
                      type="button"
                      className={`tm-pe-seg-btn${isGravity ? " tm-pe-seg-btn--active" : ""}`}
                      onClick={() => {
                        updateConfig((prev) => {
                          const next = { ...prev, emitterType: 0 as const };
                          commitHistory(buildSnapshot({ config: next }));
                          return next;
                        });
                      }}
                    >
                      {t("particleEditor.emitterMode.gravity")}
                    </button>
                    <button
                      type="button"
                      className={`tm-pe-seg-btn${!isGravity ? " tm-pe-seg-btn--active" : ""}`}
                      onClick={() => {
                        updateConfig((prev) => {
                          const next = { ...prev, emitterType: 1 as const };
                          commitHistory(buildSnapshot({ config: next }));
                          return next;
                        });
                      }}
                    >
                      {t("particleEditor.emitterMode.radius")}
                    </button>
                  </div>
                  <p className="tm-pe-hint">
                    {isGravity
                      ? t("particleEditor.emitterMode.gravityHint")
                      : t("particleEditor.emitterMode.radiusHint")}
                  </p>
                  <div
                    className="tm-pe-seg tm-pe-seg--triple"
                    role="group"
                    aria-label={t("particleEditor.positionType.label")}
                  >
                    {POSITION_TYPES.map((pt) => (
                      <button
                        key={pt}
                        type="button"
                        className={`tm-pe-seg-btn${config.positionType === pt ? " tm-pe-seg-btn--active" : ""}`}
                        title={positionTypeHints[pt]}
                        onClick={() => {
                          updateConfig((prev) => {
                            const next = { ...prev, positionType: pt };
                            commitHistory(buildSnapshot({ config: next }));
                            return next;
                          });
                        }}
                      >
                        {positionTypeLabels[pt]}
                      </button>
                    ))}
                  </div>
                  <p className="tm-pe-hint">{positionTypeHints[config.positionType]}</p>
                </div>

                <div className="tm-pe-block">
                  <h3 className="tm-pe-block-title">{t("particleEditor.blocks.timing")}</h3>
                  <Toggle
                    label={t("particleEditor.fields.runForever")}
                    hint={t("particleEditor.fields.runForeverHint")}
                    checked={forever}
                    onChange={(on) => {
                      updateConfig((prev) => {
                        const next = { ...prev, duration: on ? -1 : 1 };
                        commitHistory(buildSnapshot({ config: next }));
                        return next;
                      });
                    }}
                  />
                  {!forever ? (
                    <SliderField
                      label={t("particleEditor.fields.duration")}
                      hint={t("particleEditor.fields.durationHint")}
                      unit="s"
                      value={Math.max(0, config.duration)}
                      min={0}
                      max={30}
                      step={0.05}
                      decimals={2}
                      defaultValue={1}
                      resetHint={resetHint}
                      onCommit={commitHistory}
                      onChange={(v) => set("duration", v)}
                    />
                  ) : null}
                  <ValueVarianceField
                    label={t("particleEditor.fields.lifespan")}
                    hint={t("particleEditor.fields.lifespanHint")}
                    unit="s"
                    value={config.particleLifespan}
                    variance={config.particleLifespanVariance}
                    min={0}
                    max={10}
                    varMax={10}
                    step={0.05}
                    decimals={2}
                    defaultValue={D.particleLifespan}
                    defaultVariance={D.particleLifespanVariance}
                    varianceLabel={t("particleEditor.fields.variance")}
                    resetHint={resetHint}
                    onCommit={commitHistory}
                    onChangeValue={(v) => set("particleLifespan", v)}
                    onChangeVariance={(v) => set("particleLifespanVariance", v)}
                  />
                  <SliderField
                    label={t("particleEditor.fields.maxParticles")}
                    hint={t("particleEditor.fields.maxParticlesHint")}
                    value={config.maxParticles}
                    min={1}
                    max={500}
                    step={1}
                    decimals={0}
                    defaultValue={D.maxParticles}
                    resetHint={resetHint}
                    onCommit={commitHistory}
                    onChange={(v) => set("maxParticles", Math.round(v))}
                  />
                  <div className="tm-pe-stat">
                    <span>{t("particleEditor.fields.emissionRate")}</span>
                    <strong>{emissionRate} /s</strong>
                  </div>
                  <p className="tm-pe-hint">{t("particleEditor.fields.emissionRateHint")}</p>
                </div>

                <div className="tm-pe-block">
                  <h3 className="tm-pe-block-title">{t("particleEditor.blocks.spawnArea")}</h3>
                  <Toggle
                    label={t("particleEditor.fields.usePlistSourcePosition")}
                    hint={t("particleEditor.fields.usePlistSourcePositionHint")}
                    checked={usePlistSourcePosition}
                    onChange={(checked) => {
                      usePlistSourcePositionRef.current = checked;
                      setUsePlistSourcePosition(checked);
                      commitHistory(buildSnapshot({ usePlistSourcePosition: checked }));
                    }}
                  />
                  {usePlistSourcePosition ? (
                    <>
                      <div className="tm-pe-pair">
                        <SliderField
                          label={t("particleEditor.fields.sourceX")}
                          value={config.sourcePositionx}
                          min={-400}
                          max={400}
                          step={1}
                          decimals={1}
                          defaultValue={D.sourcePositionx}
                          resetHint={resetHint}
                          onCommit={commitHistory}
                          onChange={(v) => set("sourcePositionx", v)}
                        />
                        <SliderField
                          label={t("particleEditor.fields.sourceY")}
                          value={config.sourcePositiony}
                          min={-400}
                          max={400}
                          step={1}
                          decimals={1}
                          defaultValue={D.sourcePositiony}
                          resetHint={resetHint}
                          onCommit={commitHistory}
                          onChange={(v) => set("sourcePositiony", v)}
                        />
                      </div>
                      <p className="tm-pe-hint">
                        {t("particleEditor.fields.sourcePositionHint")}
                      </p>
                    </>
                  ) : null}
                  <div className="tm-pe-pair">
                    <SliderField
                      label={t("particleEditor.fields.varianceX")}
                      value={config.sourcePositionVariancex}
                      min={0}
                      max={200}
                      step={1}
                      decimals={1}
                      defaultValue={D.sourcePositionVariancex}
                      resetHint={resetHint}
                      onCommit={commitHistory}
                      onChange={(v) => set("sourcePositionVariancex", v)}
                    />
                    <SliderField
                      label={t("particleEditor.fields.varianceY")}
                      value={config.sourcePositionVariancey}
                      min={0}
                      max={200}
                      step={1}
                      decimals={1}
                      defaultValue={D.sourcePositionVariancey}
                      resetHint={resetHint}
                      onCommit={commitHistory}
                      onChange={(v) => set("sourcePositionVariancey", v)}
                    />
                  </div>
                  <p className="tm-pe-hint">{t("particleEditor.fields.spawnVarianceHint")}</p>
                </div>
              </div>
            ) : null}

            {tab === "motion" ? (
              <div className="tm-pe-stack" key="motion">
                {isGravity ? (
                  <div className="tm-pe-block">
                    <h3 className="tm-pe-block-title">
                      {t("particleEditor.blocks.gravityMode")}
                    </h3>
                    <ValueVarianceField
                      label={t("particleEditor.fields.angle")}
                      hint={t("particleEditor.fields.angleHint")}
                      unit="°"
                      value={config.angle}
                      variance={config.angleVariance}
                      min={0}
                      max={360}
                      step={1}
                      decimals={1}
                      defaultValue={D.angle}
                      defaultVariance={D.angleVariance}
                      varianceLabel={t("particleEditor.fields.variance")}
                      resetHint={resetHint}
                      onCommit={commitHistory}
                      onChangeValue={(v) => set("angle", v)}
                      onChangeVariance={(v) => set("angleVariance", v)}
                    />
                    <ValueVarianceField
                      label={t("particleEditor.fields.speed")}
                      hint={t("particleEditor.fields.speedHint")}
                      value={config.speed}
                      variance={config.speedVariance}
                      min={0}
                      max={800}
                      varMax={400}
                      step={1}
                      decimals={1}
                      defaultValue={D.speed}
                      defaultVariance={D.speedVariance}
                      varianceLabel={t("particleEditor.fields.variance")}
                      resetHint={resetHint}
                      onCommit={commitHistory}
                      onChangeValue={(v) => set("speed", v)}
                      onChangeVariance={(v) => set("speedVariance", v)}
                    />
                    <div className="tm-pe-pair">
                      <SliderField
                        label={t("particleEditor.fields.gravityX")}
                        value={config.gravityx}
                        min={-800}
                        max={800}
                        step={1}
                        decimals={1}
                        defaultValue={D.gravityx}
                        resetHint={resetHint}
                        onCommit={commitHistory}
                        onChange={(v) => set("gravityx", v)}
                      />
                      <SliderField
                        label={t("particleEditor.fields.gravityY")}
                        value={config.gravityy}
                        min={-800}
                        max={800}
                        step={1}
                        decimals={1}
                        defaultValue={D.gravityy}
                        resetHint={resetHint}
                        onCommit={commitHistory}
                        onChange={(v) => set("gravityy", v)}
                      />
                    </div>
                    <p className="tm-pe-hint">{t("particleEditor.fields.gravityHint")}</p>
                    <ValueVarianceField
                      label={t("particleEditor.fields.radialAccel")}
                      hint={t("particleEditor.fields.radialAccelHint")}
                      value={config.radialAcceleration}
                      variance={config.radialAccelerationVariance}
                      min={-400}
                      max={400}
                      varMax={400}
                      step={1}
                      decimals={1}
                      defaultValue={D.radialAcceleration}
                      defaultVariance={D.radialAccelerationVariance}
                      varianceLabel={t("particleEditor.fields.variance")}
                      resetHint={resetHint}
                      onCommit={commitHistory}
                      onChangeValue={(v) => set("radialAcceleration", v)}
                      onChangeVariance={(v) => set("radialAccelerationVariance", v)}
                    />
                    <ValueVarianceField
                      label={t("particleEditor.fields.tangentialAccel")}
                      hint={t("particleEditor.fields.tangentialAccelHint")}
                      value={config.tangentialAcceleration}
                      variance={config.tangentialAccelerationVariance}
                      min={-400}
                      max={400}
                      varMax={400}
                      step={1}
                      decimals={1}
                      defaultValue={D.tangentialAcceleration}
                      defaultVariance={D.tangentialAccelerationVariance}
                      varianceLabel={t("particleEditor.fields.variance")}
                      resetHint={resetHint}
                      onCommit={commitHistory}
                      onChangeValue={(v) => set("tangentialAcceleration", v)}
                      onChangeVariance={(v) => set("tangentialAccelerationVariance", v)}
                    />
                    <Toggle
                      label={t("particleEditor.fields.rotationIsDir")}
                      hint={t("particleEditor.fields.rotationIsDirHint")}
                      checked={config.rotationIsDir}
                      onChange={(v) => {
                        updateConfig((prev) => {
                          const next = { ...prev, rotationIsDir: v };
                          commitHistory(buildSnapshot({ config: next }));
                          return next;
                        });
                      }}
                    />
                  </div>
                ) : (
                  <div className="tm-pe-block">
                    <h3 className="tm-pe-block-title">
                      {t("particleEditor.blocks.radiusMode")}
                    </h3>
                    <ValueVarianceField
                      label={t("particleEditor.fields.angle")}
                      hint={t("particleEditor.fields.angleHint")}
                      unit="°"
                      value={config.angle}
                      variance={config.angleVariance}
                      min={0}
                      max={360}
                      step={1}
                      decimals={1}
                      defaultValue={D.angle}
                      defaultVariance={D.angleVariance}
                      varianceLabel={t("particleEditor.fields.variance")}
                      resetHint={resetHint}
                      onCommit={commitHistory}
                      onChangeValue={(v) => set("angle", v)}
                      onChangeVariance={(v) => set("angleVariance", v)}
                    />
                    <ValueVarianceField
                      label={t("particleEditor.fields.maxRadius")}
                      hint={t("particleEditor.fields.maxRadiusHint")}
                      value={config.maxRadius}
                      variance={config.maxRadiusVariance}
                      min={0}
                      max={600}
                      varMax={300}
                      step={1}
                      decimals={1}
                      defaultValue={D.maxRadius}
                      defaultVariance={D.maxRadiusVariance}
                      varianceLabel={t("particleEditor.fields.variance")}
                      resetHint={resetHint}
                      onCommit={commitHistory}
                      onChangeValue={(v) => set("maxRadius", v)}
                      onChangeVariance={(v) => set("maxRadiusVariance", v)}
                    />
                    <ValueVarianceField
                      label={t("particleEditor.fields.minRadius")}
                      hint={t("particleEditor.fields.minRadiusHint")}
                      value={config.minRadius}
                      variance={config.minRadiusVariance}
                      min={0}
                      max={600}
                      varMax={300}
                      step={1}
                      decimals={1}
                      defaultValue={D.minRadius}
                      defaultVariance={D.minRadiusVariance}
                      varianceLabel={t("particleEditor.fields.variance")}
                      resetHint={resetHint}
                      onCommit={commitHistory}
                      onChangeValue={(v) => set("minRadius", v)}
                      onChangeVariance={(v) => set("minRadiusVariance", v)}
                    />
                    <ValueVarianceField
                      label={t("particleEditor.fields.rotatePerSecond")}
                      hint={t("particleEditor.fields.rotatePerSecondHint")}
                      unit="°"
                      value={config.rotatePerSecond}
                      variance={config.rotatePerSecondVariance}
                      min={-720}
                      max={720}
                      varMax={360}
                      step={1}
                      decimals={1}
                      defaultValue={D.rotatePerSecond}
                      defaultVariance={D.rotatePerSecondVariance}
                      varianceLabel={t("particleEditor.fields.variance")}
                      resetHint={resetHint}
                      onCommit={commitHistory}
                      onChangeValue={(v) => set("rotatePerSecond", v)}
                      onChangeVariance={(v) => set("rotatePerSecondVariance", v)}
                    />
                  </div>
                )}
              </div>
            ) : null}

            {tab === "look" ? (
              <div className="tm-pe-stack" key="look">
                <div className="tm-pe-block">
                  <h3 className="tm-pe-block-title">{t("particleEditor.blocks.color")}</h3>
                  <p className="tm-pe-hint">{t("particleEditor.fields.colorHint")}</p>
                  <ColorField
                    label={t("particleEditor.fields.startColor")}
                    alphaLabel={t("particleEditor.fields.alpha")}
                    r={config.startColorRed}
                    g={config.startColorGreen}
                    b={config.startColorBlue}
                    a={config.startColorAlpha}
                    defaultA={D.startColorAlpha}
                    resetHint={resetHint}
                    onChange={({ r, g, b, a }) =>
                      updateConfig((prev) => ({
                        ...prev,
                        startColorRed: r,
                        startColorGreen: g,
                        startColorBlue: b,
                        startColorAlpha: a,
                      }))
                    }
                    onCommit={commitHistory}
                  />
                  <ColorField
                    label={t("particleEditor.fields.finishColor")}
                    alphaLabel={t("particleEditor.fields.alpha")}
                    r={config.finishColorRed}
                    g={config.finishColorGreen}
                    b={config.finishColorBlue}
                    a={config.finishColorAlpha}
                    defaultA={D.finishColorAlpha}
                    resetHint={resetHint}
                    onChange={({ r, g, b, a }) =>
                      updateConfig((prev) => ({
                        ...prev,
                        finishColorRed: r,
                        finishColorGreen: g,
                        finishColorBlue: b,
                        finishColorAlpha: a,
                      }))
                    }
                    onCommit={commitHistory}
                  />
                  <button
                    type="button"
                    className="tm-pe-disclosure"
                    onClick={() => setShowColorVariance((v) => !v)}
                    aria-expanded={showColorVariance}
                  >
                    {showColorVariance
                      ? t("particleEditor.fields.hideColorVariance")
                      : t("particleEditor.fields.showColorVariance")}
                  </button>
                  {showColorVariance ? (
                    <>
                      <ColorField
                        label={t("particleEditor.fields.startColorVariance")}
                        alphaLabel={t("particleEditor.fields.alpha")}
                        r={config.startColorVarianceRed}
                        g={config.startColorVarianceGreen}
                        b={config.startColorVarianceBlue}
                        a={config.startColorVarianceAlpha}
                        defaultA={D.startColorVarianceAlpha}
                        resetHint={resetHint}
                        onChange={({ r, g, b, a }) =>
                          updateConfig((prev) => ({
                            ...prev,
                            startColorVarianceRed: r,
                            startColorVarianceGreen: g,
                            startColorVarianceBlue: b,
                            startColorVarianceAlpha: a,
                          }))
                        }
                        onCommit={commitHistory}
                      />
                      <ColorField
                        label={t("particleEditor.fields.finishColorVariance")}
                        alphaLabel={t("particleEditor.fields.alpha")}
                        r={config.finishColorVarianceRed}
                        g={config.finishColorVarianceGreen}
                        b={config.finishColorVarianceBlue}
                        a={config.finishColorVarianceAlpha}
                        defaultA={D.finishColorVarianceAlpha}
                        resetHint={resetHint}
                        onChange={({ r, g, b, a }) =>
                          updateConfig((prev) => ({
                            ...prev,
                            finishColorVarianceRed: r,
                            finishColorVarianceGreen: g,
                            finishColorVarianceBlue: b,
                            finishColorVarianceAlpha: a,
                          }))
                        }
                        onCommit={commitHistory}
                      />
                    </>
                  ) : null}
                </div>

                <div className="tm-pe-block">
                  <h3 className="tm-pe-block-title">{t("particleEditor.blocks.sizeSpin")}</h3>
                  <ValueVarianceField
                    label={t("particleEditor.fields.startSize")}
                    hint={t("particleEditor.fields.startSizeHint")}
                    value={config.startParticleSize}
                    variance={config.startParticleSizeVariance}
                    min={0}
                    max={256}
                    step={1}
                    decimals={1}
                    defaultValue={D.startParticleSize}
                    defaultVariance={D.startParticleSizeVariance}
                    varianceLabel={t("particleEditor.fields.variance")}
                    resetHint={resetHint}
                    onCommit={commitHistory}
                    onChangeValue={(v) => set("startParticleSize", v)}
                    onChangeVariance={(v) => set("startParticleSizeVariance", v)}
                  />
                  <ValueVarianceField
                    label={t("particleEditor.fields.finishSize")}
                    hint={t("particleEditor.fields.finishSizeHint")}
                    value={config.finishParticleSize}
                    variance={config.finishParticleSizeVariance}
                    min={-1}
                    max={256}
                    varMax={256}
                    step={1}
                    decimals={1}
                    defaultValue={D.finishParticleSize}
                    defaultVariance={D.finishParticleSizeVariance}
                    varianceLabel={t("particleEditor.fields.variance")}
                    resetHint={resetHint}
                    onCommit={commitHistory}
                    onChangeValue={(v) => set("finishParticleSize", v)}
                    onChangeVariance={(v) => set("finishParticleSizeVariance", v)}
                  />
                  <ValueVarianceField
                    label={t("particleEditor.fields.rotationStart")}
                    unit="°"
                    value={config.rotationStart}
                    variance={config.rotationStartVariance}
                    min={-360}
                    max={360}
                    varMax={360}
                    step={1}
                    decimals={1}
                    defaultValue={D.rotationStart}
                    defaultVariance={D.rotationStartVariance}
                    varianceLabel={t("particleEditor.fields.variance")}
                    resetHint={resetHint}
                    onCommit={commitHistory}
                    onChangeValue={(v) => set("rotationStart", v)}
                    onChangeVariance={(v) => set("rotationStartVariance", v)}
                  />
                  <ValueVarianceField
                    label={t("particleEditor.fields.rotationEnd")}
                    hint={t("particleEditor.fields.rotationHint")}
                    unit="°"
                    value={config.rotationEnd}
                    variance={config.rotationEndVariance}
                    min={-360}
                    max={360}
                    varMax={360}
                    step={1}
                    decimals={1}
                    defaultValue={D.rotationEnd}
                    defaultVariance={D.rotationEndVariance}
                    varianceLabel={t("particleEditor.fields.variance")}
                    resetHint={resetHint}
                    onCommit={commitHistory}
                    onChangeValue={(v) => set("rotationEnd", v)}
                    onChangeVariance={(v) => set("rotationEndVariance", v)}
                  />
                  <Toggle
                    label={t("particleEditor.fields.opacityModifyRgb")}
                    hint={t("particleEditor.fields.opacityModifyRgbHint")}
                    checked={config.opacityModifyRGB}
                    onChange={(v) => {
                      updateConfig((prev) => {
                        const next = { ...prev, opacityModifyRGB: v };
                        commitHistory(buildSnapshot({ config: next }));
                        return next;
                      });
                    }}
                  />
                </div>

                <div className="tm-pe-block">
                  <h3 className="tm-pe-block-title">{t("particleEditor.blocks.blend")}</h3>
                  <p className="tm-pe-hint">{t("particleEditor.fields.blendHint")}</p>
                  <div
                    className="tm-pe-blend-grid"
                    role="group"
                    aria-label={t("particleEditor.fields.blendPresetLabel")}
                  >
                    {BLEND_PRESETS.map((p, i) => {
                      const shortKeys = [
                        "blendAdditive",
                        "blendAlpha",
                        "blendPremultiplied",
                        "blendPureAdd",
                      ] as const;
                      const titleKeys = [
                        "additive",
                        "alpha",
                        "premultiplied",
                        "pureAdd",
                      ] as const;
                      const short = t(`particleEditor.fields.${shortKeys[i] ?? "blendAdditive"}`);
                      const title = t(
                        `particleEditor.blendPresets.${titleKeys[i] ?? "additive"}`,
                        { defaultValue: p.label },
                      );
                      return (
                        <button
                          key={p.label}
                          type="button"
                          title={title}
                          className={`tm-pe-blend-card${blendPresetIndex === i ? " tm-pe-blend-card--active" : ""}`}
                          onClick={() => {
                            updateConfig((prev) => {
                              const next = {
                                ...prev,
                                blendFuncSource: p.src,
                                blendFuncDestination: p.dst,
                              };
                              commitHistory(buildSnapshot({ config: next }));
                              return next;
                            });
                          }}
                        >
                          {short}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="tm-pe-disclosure"
                    onClick={() => setShowAdvancedBlend((v) => !v)}
                    aria-expanded={showAdvancedBlend}
                  >
                    {showAdvancedBlend
                      ? t("particleEditor.fields.hideBlendConstants")
                      : t("particleEditor.fields.showBlendConstants")}
                  </button>
                  {showAdvancedBlend ? (
                    <div className="tm-pe-pair">
                      <SliderField
                        label={t("particleEditor.fields.blendSource")}
                        value={config.blendFuncSource}
                        min={0}
                        max={1024}
                        step={1}
                        decimals={0}
                        defaultValue={D.blendFuncSource}
                        resetHint={resetHint}
                        onCommit={commitHistory}
                        onChange={(v) => set("blendFuncSource", Math.round(v))}
                      />
                      <SliderField
                        label={t("particleEditor.fields.blendDest")}
                        value={config.blendFuncDestination}
                        min={0}
                        max={1024}
                        step={1}
                        decimals={0}
                        defaultValue={D.blendFuncDestination}
                        resetHint={resetHint}
                        onCommit={commitHistory}
                        onChange={(v) => set("blendFuncDestination", Math.round(v))}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {tab === "texture" ? (
              <div className="tm-pe-stack" key="texture">
                <div className="tm-pe-block">
                  <h3 className="tm-pe-block-title">{t("particleEditor.blocks.sprite")}</h3>
                  <div className="tm-pe-texture-card">
                    {textureSrc ? (
                      <img src={textureSrc} alt="" className="tm-pe-texture-img" />
                    ) : (
                      <div className="tm-pe-texture-empty">
                        {t("particleEditor.fields.noTexture")}
                      </div>
                    )}
                    <div className="tm-pe-texture-meta">
                      <span className="tm-pe-field-label">
                        {t("particleEditor.fields.textureFileName")}
                      </span>
                      <span className="tm-pe-texture-name" title={config.textureFileName || undefined}>
                        {config.textureFileName || "—"}
                      </span>
                      <ParticleToolbarTip
                        label={t("particleEditor.fields.replaceTextureTooltip")}
                      >
                        <button
                          type="button"
                          className="tm-icon-editor-toolbar-btn"
                          onClick={() => {
                            void handleReplaceTexture();
                          }}
                          disabled={busy}
                        >
                          <ImagePlus size={14} aria-hidden />
                          <span>{t("particleEditor.fields.replaceTexture")}</span>
                        </button>
                      </ParticleToolbarTip>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
