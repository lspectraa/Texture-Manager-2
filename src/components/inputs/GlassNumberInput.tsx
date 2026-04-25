import { ChevronDown, ChevronUp } from "lucide-react";

type GlassNumberInputProps = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

export function GlassNumberInput({ value, min, max, onChange }: GlassNumberInputProps) {
  const clamp = (next: number): number => Math.min(max, Math.max(min, next));

  return (
    <div className="tm-number-input-wrap">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          if (Number.isFinite(next)) {
            onChange(clamp(next));
          }
        }}
      />
      <div className="tm-number-stepper" aria-hidden="true">
        <button
          type="button"
          className="tm-number-step-btn"
          tabIndex={-1}
          onClick={() => onChange(clamp(value + 1))}
        >
          <ChevronUp size={11} />
        </button>
        <button
          type="button"
          className="tm-number-step-btn"
          tabIndex={-1}
          onClick={() => onChange(clamp(value - 1))}
        >
          <ChevronDown size={11} />
        </button>
      </div>
    </div>
  );
}
