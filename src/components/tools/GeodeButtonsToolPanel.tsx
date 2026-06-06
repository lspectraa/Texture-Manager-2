import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, FileImage, FolderOpen, Palette } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import type {
  GeodeButtonsOptions,
  GeodeButtonsVariant,
  GeodeButtonsVariantRule,
  HsvDelta,
} from "../../domain/operations";
import { isTauriRuntime } from "../../services/tauriOperations";
import {
  autoSelectGeodeButtonsPlist,
  getGeodeButtonsDefaultInputDir,
  getGeodeButtonsTargetIndex,
  getGeodeButtonsTemplatePreviewDataUrl,
  GeodeButtonsTargetGroup,
} from "../../services/tauriGeodeButtons";
import { PickFolderFn } from "./types";

type GeodeButtonsToolPanelProps = {
  inputDir: string;
  outputDir: string;
  options: GeodeButtonsOptions;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onOptionsChange: (next: GeodeButtonsOptions) => void;
  pickFolder: PickFolderFn;
};

const VARIANTS: ReadonlyArray<{ id: GeodeButtonsVariant; label: string; suffix: string }> = [
  { id: "primary", label: "Primary", suffix: "Green" },
  { id: "secondary", label: "Secondary", suffix: "Cyan" },
  { id: "darkAqua", label: "Dark Aqua", suffix: "DarkAqua" },
  { id: "darkPurple", label: "Dark Purple", suffix: "DarkPurple" },
  { id: "gray", label: "Gray", suffix: "Gray" },
  { id: "error", label: "Error", suffix: "Red" },
  { id: "info", label: "Info", suffix: "Blue" },
  { id: "pink", label: "Pink", suffix: "Pink" },
];

const defaultHsv = (): HsvDelta => ({ hueDeg: 0, satDelta: 0, valDelta: 0 });

function getVariantRule(rules: GeodeButtonsVariantRule[], variant: GeodeButtonsVariant): HsvDelta {
  return rules.find((rule) => rule.variant === variant)?.hsv ?? defaultHsv();
}

function parseVariantFromFamilyId(familyId: string | null): GeodeButtonsVariant | null {
  if (!familyId) return null;
  const slug = familyId.split(":")[1] ?? "";
  if (slug === "primary" || slug === "secondary" || slug === "gray" || slug === "error" || slug === "info" || slug === "pink") {
    return slug;
  }
  if (slug === "darkAqua" || slug === "darkPurple") {
    return slug;
  }
  return null;
}

function resolveAdjustVariant(familyId: string | null): GeodeButtonsVariant {
  const parsed = parseVariantFromFamilyId(familyId);
  return parsed ?? "primary";
}

function resolveFamilyHsv(
  options: GeodeButtonsOptions,
  familyId: string,
  variant: GeodeButtonsVariant,
): HsvDelta {
  const familyMap = options.familyVariantRules?.[familyId];
  if (familyMap && familyMap[variant]) {
    return familyMap[variant];
  }
  return getVariantRule(options.variantRules, variant);
}

function resolveGroupHsv(options: GeodeButtonsOptions, familyId: string): HsvDelta {
  return resolveFamilyHsv(options, familyId, resolveAdjustVariant(familyId));
}

type FamilyGroupId = "uiChrome" | "circle" | "editorBase" | "account";
const VARIANT_ORDER: Record<GeodeButtonsVariant, number> = {
  primary: 0,
  secondary: 1,
  darkAqua: 2,
  darkPurple: 3,
  gray: 4,
  info: 5,
  pink: 6,
  error: 7,
};

function parseFamilyMeta(familyId: string): { baseType: string; variant: GeodeButtonsVariant | null } {
  const [baseType, rawVariant] = familyId.split(":");
  const variant =
    rawVariant === "primary" ||
    rawVariant === "secondary" ||
    rawVariant === "darkAqua" ||
    rawVariant === "darkPurple" ||
    rawVariant === "gray" ||
    rawVariant === "error" ||
    rawVariant === "info" ||
    rawVariant === "pink"
      ? rawVariant
      : null;
  return { baseType: baseType ?? familyId, variant };
}

function resolveGroup(baseType: string): FamilyGroupId {
  if (baseType === "category" || baseType === "cross" || baseType === "tabs" || baseType === "iconSelect") return "uiChrome";
  if (baseType === "circle") return "circle";
  if (baseType === "editorBase") return "editorBase";
  return "account";
}

function groupLabel(groupId: FamilyGroupId): string {
  switch (groupId) {
    case "uiChrome":
      return "Menus";
    case "circle":
      return "Circle";
    case "editorBase":
      return "Editor Base";
    case "account":
      return "Account";
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function applyValueDeltaRgb(r: number, g: number, b: number, valDelta: number): [number, number, number] {
  const d = clamp01(Math.abs(valDelta));
  if (valDelta >= 0) {
    // Photoshop-like brightness: +1.0 pushes every channel to white.
    return [r + (1 - r) * d, g + (1 - g) * d, b + (1 - b) * d];
  }
  // -1.0 pushes every channel to black.
  return [r * (1 - d), g * (1 - d), b * (1 - d)];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const v = max;
  const s = max <= 1e-6 ? 0 : delta / max;
  let h = 0;
  if (delta > 1e-6) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, s, v];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const h6 = ((h % 1) + 1) % 1 * 6;
  const i = Math.floor(h6);
  const f = h6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

/** Normalize paths from the OS / file URLs so Rust and the asset protocol see a consistent path. */
function normalizeFilesystemPath(path: string): string {
  let s = path.trim();
  if (s.toLowerCase().startsWith("file://")) {
    s = s.slice("file://".length);
    if (s.startsWith("/") && /^\/[a-zA-Z]:\//.test(s)) {
      s = s.slice(1);
    }
    try {
      s = decodeURIComponent(s);
    } catch {
      /* keep s */
    }
  }
  return s;
}

async function resolvePreviewImageSrc(path: string): Promise<string> {
  if (!path.trim()) {
    return path;
  }
  if (path.startsWith("data:")) {
    return path;
  }
  const normalizedFs = normalizeFilesystemPath(path);
  if (isTauriRuntime()) {
    const fromBackend = await getGeodeButtonsTemplatePreviewDataUrl(normalizedFs);
    if (fromBackend) {
      return fromBackend;
    }
  }
  const normalized = normalizedFs.replace(/\\/g, "/");
  return isTauriRuntime() ? convertFileSrc(normalized) : normalized;
}

/** Disk template images decoded once; HSV preview only redraws from this bitmap. */
const geodeTemplateImageByPath = new Map<string, HTMLImageElement>();
const geodeTemplateImageInflight = new Map<string, Promise<HTMLImageElement | null>>();

function invalidateDiskTemplateCache(path: string): void {
  const key = normalizeFilesystemPath(path);
  if (!key.trim()) return;
  geodeTemplateImageByPath.delete(key);
  geodeTemplateImageInflight.delete(key);
}

async function getOrLoadDiskTemplateImage(path: string): Promise<HTMLImageElement | null> {
  const key = normalizeFilesystemPath(path);
  if (!key.trim()) {
    return null;
  }
  const cached = geodeTemplateImageByPath.get(key);
  if (cached?.complete && cached.naturalWidth > 0) {
    return cached;
  }
  let inflight = geodeTemplateImageInflight.get(key);
  if (!inflight) {
    inflight = (async (): Promise<HTMLImageElement | null> => {
      try {
        const url = await resolvePreviewImageSrc(key);
        const img = await loadImageElement(url);
        geodeTemplateImageByPath.set(key, img);
        return img;
      } catch {
        return null;
      } finally {
        geodeTemplateImageInflight.delete(key);
      }
    })();
    geodeTemplateImageInflight.set(key, inflight);
  }
  return inflight;
}

async function decodeImageToCanvasDataUrl(img: HTMLImageElement, hsv: HsvDelta): Promise<string | null> {
  const size = 104;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const scale = Math.min(size / Math.max(1, img.width), size / Math.max(1, img.height));
  const dw = Math.max(1, Math.round(img.width * scale));
  const dh = Math.max(1, Math.round(img.height * scale));
  const ox = Math.floor((size - dw) / 2);
  const oy = Math.floor((size - dh) / 2);
  ctx.drawImage(img, ox, oy, dw, dh);
  const data = ctx.getImageData(0, 0, size, size);
  const hueDelta = hsv.hueDeg / 360;
  const pixels = data.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a === 0) continue;
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;
    let [h, s, v] = rgbToHsv(r, g, b);
    h = ((h + hueDelta) % 1 + 1) % 1;
    if (s <= 1e-6 && hsv.satDelta > 0) {
      s = 0;
    } else {
      s = clamp01(s + hsv.satDelta);
    }
    v = clamp01(v);
    const [nr, ng, nb] = hsvToRgb(h, s, v);
    const [vr, vg, vb] = applyValueDeltaRgb(clamp01(nr), clamp01(ng), clamp01(nb), hsv.valDelta);
    pixels[i] = Math.round(clamp01(vr) * 255);
    pixels[i + 1] = Math.round(clamp01(vg) * 255);
    pixels[i + 2] = Math.round(clamp01(vb) * 255);
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL("image/png");
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("failed to load image"));
  });
  return img;
}

async function generatePreviewDataUrl(templatePath: string, hsv: HsvDelta): Promise<string | null> {
  if (!templatePath.trim()) return null;
  try {
    let img: HTMLImageElement | null = null;
    if (templatePath.startsWith("data:")) {
      img = await loadImageElement(templatePath);
    } else {
      img = await getOrLoadDiskTemplateImage(templatePath);
    }
    if (!img) return null;
    return await decodeImageToCanvasDataUrl(img, hsv);
  } catch {
    return null;
  }
}

async function previewForGroupSource(
  familyTemplatePath: string,
  basePreview: string,
  hsv: HsvDelta,
): Promise<string | null> {
  if (familyTemplatePath.trim()) {
    const fromTemplate = await generatePreviewDataUrl(familyTemplatePath, hsv);
    if (fromTemplate) return fromTemplate;
  }
  if (basePreview.trim()) {
    return generatePreviewDataUrl(basePreview, hsv);
  }
  return null;
}

type FloatStepperProps = {
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

function FloatStepper({ value, step, min, max, onChange }: FloatStepperProps) {
  const clamp = (v: number): number => Math.min(max, Math.max(min, v));
  const decimals = Math.max(0, (String(step).split(".")[1] ?? "").length);
  const roundToStep = (v: number): number => Number(v.toFixed(decimals));
  return (
    <div className="tm-number-input-wrap tm-geode-number-wrap">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number.parseFloat(event.target.value);
          if (Number.isFinite(next)) {
            onChange(clamp(roundToStep(next)));
          }
        }}
      />
      <div className="tm-number-stepper" aria-hidden="true">
        <button
          type="button"
          className="tm-number-step-btn"
          tabIndex={-1}
          onClick={() => onChange(clamp(roundToStep(value + step)))}
        >
          <ChevronUp size={11} />
        </button>
        <button
          type="button"
          className="tm-number-step-btn"
          tabIndex={-1}
          onClick={() => onChange(clamp(roundToStep(value - step)))}
        >
          <ChevronDown size={11} />
        </button>
      </div>
    </div>
  );
}

export function GeodeButtonsToolPanel({
  inputDir,
  outputDir,
  options,
  onInputDirChange,
  onOutputDirChange,
  onOptionsChange,
  pickFolder,
}: GeodeButtonsToolPanelProps) {
  const [plistPath, setPlistPath] = useState<string>("");
  const [targets, setTargets] = useState<GeodeButtonsTargetGroup[] | null>(null);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [previewByFamily, setPreviewByFamily] = useState<Record<string, string>>({});
  const [basePreviewByFamily, setBasePreviewByFamily] = useState<Record<string, string>>({});
  const prevFamilyTemplatesRef = useRef<Record<string, string>>(options.templates.familyTemplates);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const selectedFamily = useMemo(
    () => targets?.find((g) => g.id === selectedFamilyId) ?? null,
    [targets, selectedFamilyId],
  );

  const groupedTargets = useMemo(() => {
    const source = targets ?? [];
    const grouped: Record<FamilyGroupId, GeodeButtonsTargetGroup[]> = {
      uiChrome: [],
      circle: [],
      editorBase: [],
      account: [],
    };
    for (const group of source) {
      const meta = parseFamilyMeta(group.id);
      grouped[resolveGroup(meta.baseType)].push(group);
    }
    const sortItems = (items: GeodeButtonsTargetGroup[]): GeodeButtonsTargetGroup[] =>
      items.slice().sort((a, b) => {
        const ma = parseFamilyMeta(a.id);
        const mb = parseFamilyMeta(b.id);
        const va = ma.variant ? VARIANT_ORDER[ma.variant] : Number.MAX_SAFE_INTEGER;
        const vb = mb.variant ? VARIANT_ORDER[mb.variant] : Number.MAX_SAFE_INTEGER;
        if (va !== vb) return va - vb;
        return a.label.localeCompare(b.label);
      });
    return [
      { id: "uiChrome" as const, label: groupLabel("uiChrome"), items: sortItems(grouped.uiChrome) },
      { id: "circle" as const, label: groupLabel("circle"), items: sortItems(grouped.circle) },
      { id: "editorBase" as const, label: groupLabel("editorBase"), items: sortItems(grouped.editorBase) },
      { id: "account" as const, label: groupLabel("account"), items: sortItems(grouped.account) },
    ].filter((group) => group.items.length > 0);
  }, [targets]);

  const selectedVariant = useMemo(() => parseVariantFromFamilyId(selectedFamilyId), [selectedFamilyId]);
  const selectedAdjustVariant = useMemo(
    () => resolveAdjustVariant(selectedFamilyId),
    [selectedFamilyId],
  );
  const selectedHsv = useMemo(() => {
    if (!selectedFamilyId) return defaultHsv();
    return resolveFamilyHsv(options, selectedFamilyId, selectedAdjustVariant);
  }, [options, selectedFamilyId, selectedAdjustVariant]);

  const selectedTemplatePath = useMemo(() => {
    if (!selectedFamilyId) return "";
    return options.templates.familyTemplates[selectedFamilyId] ?? "";
  }, [options.templates.familyTemplates, selectedFamilyId]);

  const pickTemplate = useCallback(
    async (assign: (path: string) => void) => {
      setTargetsError(null);
      if (!isTauriRuntime()) {
        setTargetsError("File picker is only available in Tauri runtime.");
        return;
      }
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Select template png",
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (typeof selected === "string" && selected.trim()) {
        assign(selected);
      }
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    getGeodeButtonsDefaultInputDir()
      .then((resolved) => {
        if (!alive) return;
        if (resolved?.trim()) {
          onInputDirChange(resolved);
        } else {
          setTargetsError(
            "Could not resolve game files directory. Place BlankSheet gamesheets under your TextureManager2/game-files/current folder.",
          );
        }
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setTargetsError(err instanceof Error ? err.message : "Failed to resolve default input.");
      });
    return () => {
      alive = false;
    };
  }, [onInputDirChange]);

  useEffect(() => {
    if (!inputDir.trim()) {
      setPlistPath("");
      return;
    }
    let alive = true;
    autoSelectGeodeButtonsPlist(inputDir)
      .then((resolved) => {
        if (!alive) return;
        if (resolved) {
          setPlistPath(resolved);
          const slash = Math.max(resolved.lastIndexOf("/"), resolved.lastIndexOf("\\"));
          const fileName = slash >= 0 ? resolved.slice(slash + 1) : resolved;
          const stem = fileName.replace(/\.plist$/i, "");
          if (stem.trim() && options.sheetStem !== stem) {
            onOptionsChange({ ...options, sheetStem: stem });
          }
        } else {
          setTargetsError("Could not auto-find BlankSheet plist in input directory.");
          setPlistPath("");
        }
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setTargetsError(err instanceof Error ? err.message : "Failed to auto-select plist.");
      });
    return () => {
      alive = false;
    };
  }, [inputDir, onOptionsChange, options, options.sheetStem]);

  useEffect(() => {
    if (!plistPath.trim()) {
      setTargets(null);
      setSelectedFamilyId(null);
      return;
    }
    let alive = true;
    setTargets(null);
    setTargetsError(null);
    getGeodeButtonsTargetIndex(plistPath)
      .then((groups) => {
        if (!alive) return;
        setTargets(groups);
        setSelectedFamilyId((prev) => prev ?? groups[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setTargetsError(err instanceof Error ? err.message : "Failed to read target frames.");
      });
    return () => {
      alive = false;
    };
  }, [plistPath]);

  useEffect(() => {
    if (!targets || targets.length === 0) {
      setBasePreviewByFamily({});
      return;
    }
    const next: Record<string, string> = {};
    for (const group of targets) {
      if (group.previewPngDataUrl) {
        next[group.id] = group.previewPngDataUrl;
      }
    }
    setBasePreviewByFamily(next);
  }, [targets]);

  useEffect(() => {
    if (!targets || targets.length === 0) {
      setPreviewByFamily({});
      return;
    }
    let alive = true;
    const run = async (): Promise<void> => {
      const results = await Promise.all(
        targets.map(async (group): Promise<[string, string | null]> => {
          const familyTemplatePath = optionsRef.current.templates.familyTemplates[group.id] ?? "";
          const basePreview = basePreviewByFamily[group.id] ?? "";
          const hsv = resolveGroupHsv(optionsRef.current, group.id);
          const preview = await previewForGroupSource(familyTemplatePath, basePreview, hsv);
          return [group.id, preview];
        }),
      );
      if (!alive) return;
      const next: Record<string, string> = {};
      for (const [groupId, preview] of results) {
        if (preview) {
          next[groupId] = preview;
        }
      }
      setPreviewByFamily(next);
    };
    run().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [targets, basePreviewByFamily]);

  // Refresh only grid cards whose template path changed; keep each card's HSV adjustments.
  useEffect(() => {
    if (!targets || targets.length === 0) {
      return;
    }
    const prev = prevFamilyTemplatesRef.current;
    const curr = options.templates.familyTemplates;
    const changedIds: string[] = [];
    const ids = new Set([...Object.keys(prev), ...Object.keys(curr)]);
    for (const id of ids) {
      if ((prev[id] ?? "") !== (curr[id] ?? "")) {
        changedIds.push(id);
      }
    }
    prevFamilyTemplatesRef.current = curr;
    if (changedIds.length === 0) {
      return;
    }

    let alive = true;
    const run = async (): Promise<void> => {
      for (const familyId of changedIds) {
        const newPath = curr[familyId] ?? "";
        const oldPath = prev[familyId] ?? "";
        if (oldPath) {
          invalidateDiskTemplateCache(oldPath);
        }
        if (newPath) {
          invalidateDiskTemplateCache(newPath);
        }
        const basePreview = basePreviewByFamily[familyId] ?? "";
        const hsv = resolveGroupHsv(optionsRef.current, familyId);
        const preview = await previewForGroupSource(newPath, basePreview, hsv);
        if (!alive || !preview) {
          continue;
        }
        setPreviewByFamily((existing) => ({ ...existing, [familyId]: preview }));
      }
    };
    run().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [options.templates.familyTemplates, targets, basePreviewByFamily]);

  useEffect(() => {
    if (!targets || targets.length === 0 || !selectedFamilyId) {
      return;
    }
    const selectedGroup = targets.find((group) => group.id === selectedFamilyId);
    if (!selectedGroup) {
      return;
    }
    let alive = true;
    const run = async (): Promise<void> => {
      const basePreview = basePreviewByFamily[selectedGroup.id] ?? "";
      const preview = await previewForGroupSource(selectedTemplatePath, basePreview, selectedHsv);
      if (!alive || !preview) return;
      setPreviewByFamily((prev) => ({ ...prev, [selectedGroup.id]: preview }));
    };
    run().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [targets, selectedFamilyId, selectedHsv, selectedTemplatePath, basePreviewByFamily]);

  const setHsvField = useCallback(
    (partial: Partial<HsvDelta>) => {
      if (!selectedFamilyId) return;
      const next = { ...selectedHsv, ...partial };
      const existingFamilyMap = options.familyVariantRules ?? {};
      const currentForFamily = existingFamilyMap[selectedFamilyId] ?? {};
      onOptionsChange({
        ...options,
        familyVariantRules: {
          ...existingFamilyMap,
          [selectedFamilyId]: {
            ...currentForFamily,
            [selectedAdjustVariant]: next,
          },
        },
      });
    },
    [onOptionsChange, options, selectedAdjustVariant, selectedFamilyId, selectedHsv],
  );

  const currentTemplatePath = useMemo(() => {
    if (!selectedFamilyId) return "";
    return options.templates.familyTemplates[selectedFamilyId] ?? "";
  }, [options.templates.familyTemplates, selectedFamilyId]);

  const setFamilyTemplatePath = useCallback(
    (familyId: string, path: string) => {
      const normalized = normalizeFilesystemPath(path);
      const prevPath = options.templates.familyTemplates[familyId];
      if (prevPath) {
        invalidateDiskTemplateCache(prevPath);
      }
      invalidateDiskTemplateCache(normalized);
      onOptionsChange({
        ...options,
        templates: {
          ...options.templates,
          familyTemplates: {
            ...options.templates.familyTemplates,
            [familyId]: normalized,
          },
        },
      });
    },
    [onOptionsChange, options],
  );

  return (
    <>
      <h2 className="tm-tool-title">
        <Palette size={19} />
        Create Geode Buttons
      </h2>
      <p className="desc tm-explainer">
        Upload base templates, tune HSV rules, and regenerate the Geode BlankSheet variants in one
        go.
      </p>
      <div className="tm-info-chips">
        <span className="chip">HSV variants</span>
        <span className="chip">In-memory split</span>
        <span className="chip">Re-merge sheet</span>
      </div>

      <div className="tm-form-row">
        <label>
          Output directory
          <div className="tm-folder-input">
            <input
              value={outputDir}
              onChange={(event) => onOutputDirChange(event.target.value)}
              placeholder="C:/path/to/output"
            />
            <button type="button" onClick={() => pickFolder(onOutputDirChange)}>
              <FolderOpen size={15} />
              Browse
            </button>
          </div>
        </label>
      </div>

      {targetsError ? <p className="tm-inline-error">{targetsError}</p> : null}

      <div className="tm-geode-layout">
        <div className="tm-geode-grid">
          {groupedTargets.map((section) => (
            <div key={section.id} className="tm-geode-family-section">
              <div className="tm-geode-family-section-title">{section.label}</div>
              <div className="tm-geode-family-grid">
                {section.items.map((group) => {
                  const isSelected = group.id === selectedFamilyId;
                  const hasTemplate = Boolean(options.templates.familyTemplates[group.id]);
                  const previewSrc = previewByFamily[group.id] ?? "";
                  return (
                    <button
                      key={group.id}
                      type="button"
                      className={`tm-geode-family-card ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedFamilyId(group.id)}
                    >
                      <div className="tm-geode-family-preview">
                        {previewSrc ? (
                          <img className="tm-geode-family-thumb" src={previewSrc} alt={`${group.label} preview`} />
                        ) : (
                          <span className="tm-geode-cell-missing">No preview</span>
                        )}
                      </div>
                      <div className="tm-geode-family-title">{group.label}</div>
                      <div className="tm-geode-family-meta">
                        {group.frames.length} frames •{" "}
                        <span className={hasTemplate ? "ok" : "missing"}>
                          {hasTemplate ? "template set" : "using default"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {targets === null ? (
            <div className="tm-geode-grid-empty">
              {plistPath.trim() ? "Loading targets…" : "Pick input directory to load previews."}
            </div>
          ) : null}
        </div>

        <div className="tm-geode-panel">
          <h3 className="tm-geode-panel-title">Adjust</h3>
          <div className="tm-geode-panel-sub">
            <div>
              <strong>Family</strong>: {selectedFamily?.label ?? "—"}
            </div>
            <div>
              <strong>Variant</strong>:{" "}
              {selectedVariant
                ? VARIANTS.find((v) => v.id === selectedVariant)?.label ?? selectedVariant
                : "N/A"}
            </div>
          </div>

          <div className="tm-geode-panel-block">
            <div className="tm-geode-block-title">Template</div>
            <div className="tm-folder-input">
              <input value={currentTemplatePath} readOnly placeholder="Select template png" />
              <button
                type="button"
                onClick={() => {
                  const familyId = selectedFamilyId ?? "";
                  if (!familyId) return;
                  pickTemplate((path) => setFamilyTemplatePath(familyId, path));
                }}
              >
                <FileImage size={15} />
                Browse
              </button>
            </div>
          </div>

          <div className="tm-geode-panel-block">
            <div className="tm-geode-block-title">HSV (delta)</div>

            <div className="tm-geode-hsv-row">
              <label className="tm-geode-hsv-label">
                Hue (deg)
                <input
                  className="tm-geode-slider"
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={selectedHsv.hueDeg}
                  onChange={(e) => setHsvField({ hueDeg: Number(e.target.value) })}
                  onInput={(e) => setHsvField({ hueDeg: Number((e.target as HTMLInputElement).value) })}
                  onDoubleClick={() => setHsvField({ hueDeg: 0 })}
                />
              </label>
              <div className="tm-geode-hsv-input">
                <FloatStepper
                  value={selectedHsv.hueDeg}
                  step={1}
                  min={-180}
                  max={180}
                  onChange={(value) => setHsvField({ hueDeg: value })}
                />
              </div>
            </div>

            <div className="tm-geode-hsv-row">
              <label className="tm-geode-hsv-label">
                Saturation
                <input
                  className="tm-geode-slider"
                  type="range"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={selectedHsv.satDelta}
                  onChange={(e) => setHsvField({ satDelta: Number(e.target.value) })}
                  onInput={(e) => setHsvField({ satDelta: Number((e.target as HTMLInputElement).value) })}
                  onDoubleClick={() => setHsvField({ satDelta: 0 })}
                />
              </label>
              <div className="tm-geode-hsv-input">
                <FloatStepper
                  value={selectedHsv.satDelta}
                  step={0.01}
                  min={-1}
                  max={1}
                  onChange={(value) => setHsvField({ satDelta: value })}
                />
              </div>
            </div>

            <div className="tm-geode-hsv-row">
              <label className="tm-geode-hsv-label">
                Value
                <input
                  className="tm-geode-slider"
                  type="range"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={selectedHsv.valDelta}
                  onChange={(e) => setHsvField({ valDelta: Number(e.target.value) })}
                  onInput={(e) => setHsvField({ valDelta: Number((e.target as HTMLInputElement).value) })}
                  onDoubleClick={() => setHsvField({ valDelta: 0 })}
                />
              </label>
              <div className="tm-geode-hsv-input">
                <FloatStepper
                  value={selectedHsv.valDelta}
                  step={0.01}
                  min={-1}
                  max={1}
                  onChange={(value) => setHsvField({ valDelta: value })}
                />
              </div>
            </div>

            <div className="tm-geode-panel-note">
              These deltas apply when regenerating frames whose color suffix maps to the selected
              variant.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

