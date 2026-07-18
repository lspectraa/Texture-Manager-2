import { ExternalLink, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { APP_LINKS } from "../config/appMeta";
import {
  languageNeedsTranslationDisclaimer,
  normalizeAppLanguage,
} from "../i18n/languages";
import { openExternalUrl } from "../utils/openExternalUrl";

type TranslationQualityNoticeProps = {
  variant: "banner" | "inline";
};

export function TranslationQualityNotice({
  variant,
}: TranslationQualityNoticeProps) {
  const { t, i18n } = useTranslation("common");
  const language = normalizeAppLanguage(i18n.language);

  if (!languageNeedsTranslationDisclaimer(language)) {
    return null;
  }

  return (
    <div
      className={`tm-translation-quality tm-translation-quality--${variant}`}
      role={variant === "banner" ? "status" : undefined}
    >
      <Languages size={16} strokeWidth={1.9} aria-hidden />
      <div className="tm-translation-quality-copy">
        {variant === "banner" ? (
          <>
            <strong>{t("translationQuality.bannerTitle")}</strong>
            <span>{t("translationQuality.bannerBody")}</span>
          </>
        ) : (
          <span>{t("translationQuality.settingsHint")}</span>
        )}
      </div>
      <button
        type="button"
        className="tm-settings-action-btn"
        onClick={() => void openExternalUrl(APP_LINKS.translationIssue)}
      >
        {t("translationQuality.reportAction")}
        <ExternalLink size={13} aria-hidden />
      </button>
    </div>
  );
}
