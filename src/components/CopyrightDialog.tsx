import { useEffect, useId } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AboutContent } from "./AboutContent";
import { GlassFrost } from "./GlassFrost";

type CopyrightDialogProps = {
  open: boolean;
  onClose: () => void;
};

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

        <div className="tm-copyright-dialog-body">
          <AboutContent />
        </div>
      </div>
    </div>
  );
}
