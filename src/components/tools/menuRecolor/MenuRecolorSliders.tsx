import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  CHROMATIC_BANDS,
  clampBandRadiusSide,
  defaultBandRadiusDeg,
  hsvToRgb,
  type BandDelta,
  type ColorRecipe,
} from "../../../domain/menuRecolorColor";
import { useRangeDoubleReset } from "../../../hooks/useRangeDoubleReset";
import {
  applyHsvDeltaToRgb,
  buildHsvTrackGradient,
  sliderTrackStyle,
  type HsvChannel,
  type RgbColor,
} from "../hsvSlider";

/** Lightroom Color Mixer bands. Neutral and gold stay in the recipe, not in this editor. */
const MIXER_BANDS = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"] as const;
type MixerBand = (typeof MIXER_BANDS)[number];

const BAND_SWATCH: Record<MixerBand, string> = {
  red: "#e23d3d",
  orange: "#f08a2c",
  yellow: "#e6c43a",
  green: "#3cbf5a",
  aqua: "#2ec4c4",
  blue: "#3d78ef",
  purple: "#8a4ad4",
  magenta: "#e0459a",
};

type MenuRecolorChannelsProps = {
  recipe: ColorRecipe;
  onRecipeChange: (recipe: ColorRecipe) => void;
  selectedCount: number;
};

export function MenuRecolorChannels({
  recipe,
  onRecipeChange,
  selectedCount,
}: MenuRecolorChannelsProps) {
  const { t } = useTranslation("tools");
  const [band, setBand] = useState<MixerBand>("red");
  const delta = recipe.bands[band];
  const base = useMemo(() => bandBaseColor(band), [band]);
  const tracks = useMemo(() => bandTracks(base, delta), [base, delta]);

  const setChannel = (patch: Partial<BandDelta>) => {
    onRecipeChange({
      ...recipe,
      points: [],
      bands: {
        ...recipe.bands,
        [band]: { ...recipe.bands[band], ...patch },
      },
    });
  };

  return (
    <div className="tm-menu-recolor-channels">
      {selectedCount > 0 ? (
        <p className="tm-tool-section-note">
          {selectedCount === 1
            ? t("menuRecolor.editingCustom")
            : t("menuRecolor.selectionMany", { count: selectedCount })}
        </p>
      ) : null}
      <div className="tm-menu-recolor-band-picker" role="listbox" aria-label={t("menuRecolor.bands")}>
            {MIXER_BANDS.map((id) => (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={id === band}
                className={`tm-menu-recolor-swatch${id === band ? " is-selected" : ""}`}
                title={t(`menuRecolor.band${bandLabelKey(id)}`)}
                onClick={() => setBand(id)}
              >
                <span className="tm-menu-recolor-swatch-disc" style={{ background: BAND_SWATCH[id] }} />
                <span className="tm-menu-recolor-swatch-mark" />
              </button>
            ))}
          </div>
          <MixerSlider
            label={t("menuRecolor.hue")}
            channel="hueDeg"
            min={-180}
            max={180}
            step={1}
            value={delta.hueDeg}
            readout={formatSignedNumber(delta.hueDeg)}
            trackStyle={tracks.hue}
            onChange={(hueDeg) => setChannel({ hueDeg })}
            onReset={() => setChannel({ hueDeg: 0 })}
          />
          <MixerSlider
            label={t("menuRecolor.saturation")}
            channel="satDelta"
            min={-1}
            max={1}
            step={0.01}
            value={delta.satDelta}
            readout={formatSignedPercent(delta.satDelta)}
            trackStyle={tracks.saturation}
            onChange={(satDelta) => setChannel({ satDelta })}
            onReset={() => setChannel({ satDelta: 0 })}
          />
          <MixerSlider
            label={t("menuRecolor.luminance")}
            channel="valDelta"
            min={-1}
            max={1}
            step={0.01}
            value={delta.valDelta}
            readout={formatSignedPercent(delta.valDelta)}
            trackStyle={tracks.value}
            onChange={(valDelta) => setChannel({ valDelta })}
            onReset={() => setChannel({ valDelta: 0 })}
          />
          <BandSizeControl
            band={band}
            delta={delta}
            lowerLabel={t("menuRecolor.bandSizeLower")}
            higherLabel={t("menuRecolor.bandSizeHigher")}
            onChange={setChannel}
          />
    </div>
  );
}

type MixerSliderProps = {
  label: string;
  channel: HsvChannel;
  sliderClass?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  readout: string;
  trackStyle: CSSProperties;
  onChange: (value: number) => void;
  onReset: () => void;
};

function MixerSlider({
  label,
  channel,
  sliderClass,
  min,
  max,
  step,
  value,
  readout,
  trackStyle,
  onChange,
  onReset,
}: MixerSliderProps) {
  const reset = useRangeDoubleReset(onReset);
  const resolvedClass =
    sliderClass ??
    (channel === "hueDeg"
      ? "tm-geode-slider tm-geode-slider--hue"
      : channel === "satDelta"
        ? "tm-geode-slider tm-geode-slider--sat"
        : "tm-geode-slider tm-geode-slider--val");
  return (
    <label className="tm-menu-recolor-mixer-row">
      <span className="tm-menu-recolor-mixer-head">
        <span>{label}</span>
        <span className="tm-menu-recolor-mixer-value">{readout}</span>
      </span>
      <input
        className={resolvedClass}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        style={trackStyle}
        aria-valuetext={readout}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        onInput={(event) => onChange(Number(event.currentTarget.value))}
        {...reset}
      />
    </label>
  );
}

function BandSizeControl({
  band,
  delta,
  lowerLabel,
  higherLabel,
  onChange,
}: {
  band: MixerBand;
  delta: BandDelta;
  lowerLabel: string;
  higherLabel: string;
  onChange: (patch: Partial<BandDelta>) => void;
}) {
  const center = CHROMATIC_BANDS.find(([id]) => id === band)?.[1] ?? 0;
  const fallback = defaultBandRadiusDeg(band);
  const low = clampBandRadiusSide(band, delta.radiusLowDeg, delta.radiusDeg ?? fallback);
  const high = clampBandRadiusSide(band, delta.radiusHighDeg, delta.radiusDeg ?? fallback);
  const span = Math.max(1, low + high);
  const centerAt = (low / span) * 100;
  const [tr, tg, tb] = hsvToRgb((((center % 360) + 360) % 360) / 360, 0.82, 0.55);
  return (
    <div className="tm-menu-recolor-band-size">
      <div
        className="tm-menu-recolor-band-spectrum"
        style={{ background: hueGradient(center - low, center + high) }}
      >
        <span className="tm-menu-recolor-band-spectrum-center" style={{ left: `${centerAt}%` }} />
      </div>
      <MixerSlider
        label={lowerLabel}
        channel="satDelta"
        sliderClass="tm-geode-slider"
        min={8}
        max={90}
        step={1}
        value={low}
        readout={`${Math.round(low)}°`}
        trackStyle={sliderTrackStyle(hueGradient(center - low, center), [tr, tg, tb])}
        onChange={(radiusLowDeg) => onChange({ radiusLowDeg })}
        onReset={() => onChange({ radiusLowDeg: fallback })}
      />
      <MixerSlider
        label={higherLabel}
        channel="satDelta"
        sliderClass="tm-geode-slider"
        min={8}
        max={90}
        step={1}
        value={high}
        readout={`${Math.round(high)}°`}
        trackStyle={sliderTrackStyle(hueGradient(center, center + high), [tr, tg, tb])}
        onChange={(radiusHighDeg) => onChange({ radiusHighDeg })}
        onReset={() => onChange({ radiusHighDeg: fallback })}
      />
    </div>
  );
}

function hueGradient(fromDeg: number, toDeg: number): string {
  const steps = 10;
  const stops: string[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const deg = fromDeg + ((toDeg - fromDeg) * index) / steps;
    const wrapped = ((deg % 360) + 360) % 360;
    stops.push(`hsl(${wrapped.toFixed(1)} 82% 52%) ${(index / steps) * 100}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function bandLabelKey(band: MixerBand): string {
  switch (band) {
    case "red":
      return "Red";
    case "orange":
      return "Orange";
    case "yellow":
      return "Yellow";
    case "green":
      return "Green";
    case "aqua":
      return "Aqua";
    case "blue":
      return "Blue";
    case "purple":
      return "Purple";
    case "magenta":
      return "Magenta";
    default: {
      const neverBand: never = band;
      return neverBand;
    }
  }
}

function bandBaseColor(band: MixerBand): RgbColor {
  const center = CHROMATIC_BANDS.find(([id]) => id === band)?.[1] ?? 0;
  const [r, g, b] = hsvToRgb(center / 360, 0.78, 0.84);
  return [r, g, b];
}

function bandTracks(base: RgbColor, delta: BandDelta) {
  const hsv = { hueDeg: delta.hueDeg, satDelta: delta.satDelta, valDelta: delta.valDelta };
  const thumb = applyHsvDeltaToRgb(base, hsv);
  return {
    hue: sliderTrackStyle(buildHsvTrackGradient(base, hsv, "hueDeg", -180, 180), thumb),
    saturation: sliderTrackStyle(buildHsvTrackGradient(base, hsv, "satDelta", -1, 1), thumb),
    value: sliderTrackStyle(buildHsvTrackGradient(base, hsv, "valDelta", -1, 1), thumb),
  };
}

function formatSignedNumber(value: number): string {
  const rounded = Math.round(value);
  if (rounded > 0) {
    return `+${rounded}`;
  }
  return String(rounded);
}

function formatSignedPercent(value: number): string {
  return formatSignedNumber(value * 100);
}
