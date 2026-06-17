import { useEffect, useRef, useState } from "react";
import { ToolField } from "./ToolField";

type ToolSelectFieldProps = {
  label: string;
  hint?: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
};

export function ToolSelectField({ label, hint, value, options, onChange }: ToolSelectFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <ToolField label={label} hint={hint}>
      <div className="tm-tool-select-wrap" ref={menuRef}>
        <button
          type="button"
          className={`tm-tool-select-btn${isOpen ? " open" : ""}`}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <span>{value}</span>
          <span className="tm-tool-select-caret" aria-hidden="true">
            ▾
          </span>
        </button>
        {isOpen ? (
          <div className="tm-tool-select-menu" role="listbox" aria-label={label}>
            {options.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={option === value}
                className={`tm-tool-select-option${option === value ? " active" : ""}`}
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </ToolField>
  );
}
