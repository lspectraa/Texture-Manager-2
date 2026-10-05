import { useRangeDoubleReset } from "../../../hooks/useRangeDoubleReset";
import {
  ALL_BANDS,
  type BandDelta,
  type BandId,
  type ColorRecipe,
} from "../../../domain/menuRecolorColor";

type MenuRecolorBandSlidersProps = {
  recipe: ColorRecipe;
  onChange: (recipe: ColorRecipe) => void;
  labelForBand: (band: BandId) => string;
  hueLabel: string;
  satLabel: string;
  valLabel: string;
};

export function MenuRecolorBandSliders({
  recipe,
  onChange,
  labelForBand,
  hueLabel,
  satLabel,
  valLabel,
}: MenuRecolorBandSlidersProps) {
  const setChannel = (band: BandId, patch: Partial<BandDelta>) => {
    onChange({
      ...recipe,
      points: [],
      bands: {
        ...recipe.bands,
        [band]: { ...recipe.bands[band], ...patch },
      },
    });
  };

  return (
    <div className="tm-menu-recolor-bands">
      {ALL_BANDS.map((band) => (
        <BandRow
          key={band}
          label={labelForBand(band)}
          delta={recipe.bands[band]}
          hueLabel={hueLabel}
          satLabel={satLabel}
          valLabel={valLabel}
          onHue={(hueDeg) => setChannel(band, { hueDeg })}
          onSat={(satDelta) => setChannel(band, { satDelta })}
          onVal={(valDelta) => setChannel(band, { valDelta })}
          onResetHue={() => setChannel(band, { hueDeg: 0 })}
          onResetSat={() => setChannel(band, { satDelta: 0 })}
          onResetVal={() => setChannel(band, { valDelta: 0 })}
        />
      ))}
    </div>
  );
}

type BandRowProps = {
  label: string;
  delta: BandDelta;
  hueLabel: string;
  satLabel: string;
  valLabel: string;
  onHue: (value: number) => void;
  onSat: (value: number) => void;
  onVal: (value: number) => void;
  onResetHue: () => void;
  onResetSat: () => void;
  onResetVal: () => void;
};

function BandRow({
  label,
  delta,
  hueLabel,
  satLabel,
  valLabel,
  onHue,
  onSat,
  onVal,
  onResetHue,
  onResetSat,
  onResetVal,
}: BandRowProps) {
  return (
    <div className="tm-menu-recolor-band">
      <div className="tm-menu-recolor-band-name">{label}</div>
      <ChannelSlider
        label={hueLabel}
        min={-180}
        max={180}
        step={1}
        value={delta.hueDeg}
        onChange={onHue}
        onReset={onResetHue}
      />
      <ChannelSlider
        label={satLabel}
        min={-1}
        max={1}
        step={0.01}
        value={delta.satDelta}
        onChange={onSat}
        onReset={onResetSat}
      />
      <ChannelSlider
        label={valLabel}
        min={-1}
        max={1}
        step={0.01}
        value={delta.valDelta}
        onChange={onVal}
        onReset={onResetVal}
      />
    </div>
  );
}

type ChannelSliderProps = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  onReset: () => void;
};

function ChannelSlider({ label, min, max, step, value, onChange, onReset }: ChannelSliderProps) {
  const reset = useRangeDoubleReset(onReset);
  return (
    <label className="tm-menu-recolor-channel">
      <span>
        {label} <strong>{formatChannel(value, step)}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
        {...reset}
      />
    </label>
  );
}

function formatChannel(value: number, step: number): string {
  if (step >= 1) {
    return String(Math.round(value));
  }
  return value.toFixed(2);
}
