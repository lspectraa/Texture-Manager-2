import { useEffect, useId } from "react";
import { Code2, ExternalLink, MessageCircle, Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  APP_LINKS,
  APP_VERSION,
  COPYRIGHT_HOLDER,
  COPYRIGHT_YEAR,
} from "../config/appMeta";
import { openExternalUrl } from "../utils/openExternalUrl";
import { GlassFrost } from "./GlassFrost";

type CopyrightDialogProps = {
  open: boolean;
  onClose: () => void;
};

const LINK_ITEMS = [
  {
    id: "github",
    labelKey: "about.github",
    hintKey: "about.githubHint",
    url: APP_LINKS.github,
    icon: Code2,
  },
  {
    id: "youtube",
    labelKey: "about.youtube",
    hintKey: "about.youtubeHint",
    url: APP_LINKS.youtube,
    icon: Play,
  },
  {
    id: "discord",
    labelKey: "about.discord",
    hintKey: "about.discordHint",
    url: APP_LINKS.discord,
    icon: MessageCircle,
  },
] as const;

export function CopyrightDialog({ open, onClose }: CopyrightDialogProps) {
  const { t } = useTranslation("common");
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="tm-app-dialog-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="tm-copyright-dialog tm-glass-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <GlassFrost />
        <div className="tm-copyright-dialog-head">
          <div className="tm-copyright-dialog-title-wrap">
            <p className="tm-copyright-dialog-eyebrow">{t("productName")}</p>
            <h2 id={titleId} className="tm-copyright-dialog-title">
              {t("about.title")}
            </h2>
          </div>
          <button
            type="button"
            className="tm-copyright-dialog-close"
            onClick={onClose}
            aria-label={t("about.closeAria")}
          >
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <p className="tm-copyright-dialog-notice">
          {t("about.copyright", {
            year: COPYRIGHT_YEAR,
            holder: COPYRIGHT_HOLDER,
          })}
        </p>
        <p className="tm-copyright-dialog-copy">
          {t("about.description")}
        </p>

        <div className="tm-copyright-dialog-links">
          {LINK_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className="tm-copyright-dialog-link"
                onClick={() => {
                  void openExternalUrl(item.url);
                }}
              >
                <span className="tm-copyright-dialog-link-icon" aria-hidden>
                  <Icon size={17} strokeWidth={1.85} />
                </span>
                <span className="tm-copyright-dialog-link-copy">
                  <span className="tm-copyright-dialog-link-label">
                    {t(item.labelKey)}
                  </span>
                  <span className="tm-copyright-dialog-link-hint">
                    {t(item.hintKey)}
                  </span>
                </span>
                <ExternalLink
                  className="tm-copyright-dialog-link-external"
                  size={14}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>

        <div className="tm-copyright-dialog-footer">
          <span className="tm-copyright-dialog-version-label">
            {t("about.version")}
          </span>
          <span className="tm-copyright-dialog-version-value">v{APP_VERSION}</span>
        </div>
      </div>
    </div>
  );
}
