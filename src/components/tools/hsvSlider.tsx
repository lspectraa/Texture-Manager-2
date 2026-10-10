import type { CSSProperties } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useRangeDoubleReset } from "../../hooks/useRangeDoubleReset";
import type { HsvDelta } from "../../domain/operations";

export type RgbColor = [number, number, number];
export type HsvChannel = keyof HsvDelta;

const TRACK_STOP_COUNT = 13;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function applyValueDeltaRgb(
  r: number,
  g: number,
  b: number,
  valDelta: number,
): [number, number, number] {
  const d = clamp01(Math.abs(valDelta));
  if (valDelta >= 0) {
    return [r + (1 - r) * d, g + (1 - g) * d, b + (1 - b) * d];
  }
  return [r * (1 - d), g * (1 - d), b * (1 - d)];
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const v = max;
  const s = max <= 1e-6 ? 0 : delta / max;
  let h = 0;
  if (delta > 1e-6) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h /= 6;
    if (h < 0) {
      h += 1;
    }
  }
  return [h, s, v];
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const h6 = (((h % 1) + 1) % 1) * 6;
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

export function applyHsvDeltaToRgb(color: RgbColor, hsv: HsvDelta): RgbColor {
  let [h, s, v] = rgbToHsv(...color);
  h = ((h + hsv.hueDeg / 360) % 1 + 1) % 1;
  s = clamp01(s + hsv.satDelta);
  v = clamp01(v);
  return applyValueDeltaRgb(...hsvToRgb(h, s, v), hsv.valDelta);
}

function rgbCss(color: RgbColor): string {
  return `rgb(${color.map((channel) => Math.round(clamp01(channel) * 255)).join(" ")})`;
}

export function buildHsvTrackGradient(
  baseColor: RgbColor,
  selectedHsv: HsvDelta,
  channel: HsvChannel,
  min: number,
  max: number,
): string {
  const stops = Array.from({ length: TRACK_STOP_COUNT }, (_, index) => {
    const position = index / (TRACK_STOP_COUNT - 1);
    const hsv = { ...selectedHsv, [channel]: min + (max - min) * position };
    return `${rgbCss(applyHsvDeltaToRgb(baseColor, hsv))} ${Math.round(position * 100)}%`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

export function sliderTrackStyle(
  gradient: string,
  thumbColor: RgbColor,
): CSSProperties & Record<"--tm-geode-track" | "--tm-geode-thumb", string> {
  return {
    "--tm-geode-track": gradient,
    "--tm-geode-thumb": rgbCss(thumbColor),
  };
}

type FloatStepperProps = {
  value: number;
  step: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
};

export function FloatStepper({ value, step, min, max, disabled = false, onChange }: FloatStepperProps) {
  const clamp = (next: number): number => Math.min(max, Math.max(min, next));
  const decimals = Math.max(0, (String(step).split(".")[1] ?? "").length);
  const roundToStep = (next: number): number => Number(next.toFixed(decimals));
  return (
    <div className="tm-number-input-wrap tm-geode-number-wrap">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
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
          disabled={disabled}
          onClick={() => onChange(clamp(roundToStep(value + step)))}
        >
          <ChevronUp size={11} />
        </button>
        <button
          type="button"
          className="tm-number-step-btn"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => onChange(clamp(roundToStep(value - step)))}
        >
          <ChevronDown size={11} />
        </button>
      </div>
    </div>
  );
}

const SLIDER_CLASS: Record<HsvChannel, string> = {
  hueDeg: "tm-geode-slider tm-geode-slider--hue",
  satDelta: "tm-geode-slider tm-geode-slider--sat",
  valDelta: "tm-geode-slider tm-geode-slider--val",
};

type HsvSliderRowProps = {
  label: string;
  channel: HsvChannel;
  min: number;
  max: number;
  step: number;
  value: number;
  trackStyle: CSSProperties;
  disabled?: boolean;
  onChange: (value: number) => void;
  onReset: () => void;
};

export function HsvSliderRow({
  label,
  channel,
  min,
  max,
  step,
  value,
  trackStyle,
  disabled = false,
  onChange,
  onReset,
}: HsvSliderRowProps) {
  const reset = useRangeDoubleReset(onReset);
  const write = (valueText: string) => {
    onChange(Number(valueText));
  };
  return (
    <div className={`tm-geode-hsv-row${disabled ? " is-disabled" : ""}`}>
      <label className="tm-geode-hsv-label">
        {label}
        <input
          className={SLIDER_CLASS[channel]}
          type="range"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          style={trackStyle}
          disabled={disabled}
          onChange={(event) => write(event.currentTarget.value)}
          onInput={(event) => write(event.currentTarget.value)}
          {...reset}
        />
      </label>
      <div className="tm-geode-hsv-input">
        <FloatStepper
          value={value}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onChange={onChange}
        />
      </div>
    </div>
  );
}
