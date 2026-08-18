import { useTranslation } from "react-i18next";
import type { GlowGenSettings } from "../../utils/iconEditorGeneratedGlow";

type IconEditorGeneratedGlowControlsProps = {
  settings: GlowGenSettings;
  hasPrimary: boolean;
  isGenerating: boolean;
  error: string | null;
  onEnabledChange: (enabled: boolean) => void;
  onThicknessChange: (thickness: number) => void;
  onCompositeChange: (compositeLayers: boolean) => void;
};

export function IconEditorGeneratedGlowControls({
  settings,
  hasPrimary,
  isGenerating,
  error,
  onEnabledChange,
  onThicknessChange,
  onCompositeChange,
}: IconEditorGeneratedGlowControlsProps) {
  const { t } = useTranslation("iconEditor");

  return (
    <section className="tm-icon-editor-plist-section" aria-labelledby="plist-generated-glow-title">
      <h4 id="plist-generated-glow-title" className="tm-icon-editor-plist-section-title">
        {t("generatedGlow.title")}
      </h4>
      <label className="checkbox tm-icon-editor-generated-glow-enable">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        {t("generatedGlow.enable")}
      </label>
      <p className="tm-icon-editor-generated-glow-hint">{t("generatedGlow.enableHint")}</p>
      {!hasPrimary ? (
        <p className="tm-icon-editor-generated-glow-warning">{t("generatedGlow.needsPrimary")}</p>
      ) : null}
      {settings.enabled ? (
        <div className="tm-icon-editor-generated-glow-fields">
          <label className="tm-icon-editor-generated-glow-field">
            <span>{t("generatedGlow.thickness")}</span>
            <input
              type="number"
              min={1}
              max={128}
              value={settings.thickness}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next)) {
                  return;
                }
                onThicknessChange(Math.min(128, Math.max(1, Math.round(next))));
              }}
            />
          </label>
          <label className="checkbox tm-icon-editor-generated-glow-enable">
            <input
              type="checkbox"
              checked={settings.compositeLayers}
              onChange={(event) => onCompositeChange(event.target.checked)}
            />
            {t("generatedGlow.composite")}
          </label>
          <p className="tm-icon-editor-generated-glow-hint">{t("generatedGlow.compositeHint")}</p>
          {isGenerating ? (
            <p className="tm-icon-editor-generated-glow-status">{t("generatedGlow.generating")}</p>
          ) : null}
          {error ? <p className="tm-icon-editor-generated-glow-warning">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
