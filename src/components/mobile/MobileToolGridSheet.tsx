import { House, Settings2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  TOOL_NAV_SECTIONS,
  isToolListedOnMobile,
  isToolUnavailableOnMobile,
} from "../../config/toolNavigation";
import { GlassFrost } from "../GlassFrost";
import type { MobileNavTarget } from "./MobileBottomDock";

type MobileToolGridSheetProps = {
  open: boolean;
  selectedTool: MobileNavTarget;
  onClose: () => void;
  onNavigate: (tool: MobileNavTarget) => void;
};

export function MobileToolGridSheet({
  open,
  selectedTool,
  onClose,
  onNavigate,
}: MobileToolGridSheetProps) {
  const { t } = useTranslation("navigation");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    closeRef.current?.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="tm-mobile-grid-root">
      <button
        type="button"
        className="tm-mobile-grid-backdrop"
        aria-label={t("mobile.closeGridAria")}
        onClick={onClose}
      />
      <section
        className="tm-mobile-grid-sheet tm-glass-card"
        role="dialog"
        aria-modal="true"
        aria-label={t("mobile.allToolsTitle")}
      >
        <GlassFrost />
        <header className="tm-mobile-grid-head">
          <div>
            <p className="tm-mobile-grid-eyebrow">{t("title")}</p>
            <h2 className="tm-mobile-grid-title">{t("mobile.allToolsTitle")}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="tm-mobile-grid-close"
            aria-label={t("mobile.closeGridAria")}
            onClick={onClose}
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="tm-mobile-grid-scroll">
          <div className="tm-mobile-grid-section">
            <button
              type="button"
              className={`tm-mobile-grid-tile${selectedTool === "home" ? " is-active" : ""}`}
              onClick={() => onNavigate("home")}
            >
              <House size={22} strokeWidth={1.85} aria-hidden />
              <span>{t("home")}</span>
            </button>
            <button
              type="button"
              className={`tm-mobile-grid-tile${selectedTool === "settings" ? " is-active" : ""}`}
              onClick={() => onNavigate("settings")}
            >
              <Settings2 size={22} strokeWidth={1.85} aria-hidden />
              <span>{t("settings")}</span>
            </button>
          </div>
          {TOOL_NAV_SECTIONS.map((section) => {
            const SectionIcon = section.icon;
            return (
              <section
                key={section.id}
                className={`tm-mobile-grid-section tm-mobile-grid-section-${section.accent}`}
              >
                <h3 className="tm-mobile-grid-section-title">
                  <SectionIcon size={14} aria-hidden />
                  {t(section.title)}
                </h3>
                <div className="tm-mobile-grid-tiles">
                  {section.tools
                    .filter((tool) => isToolListedOnMobile(tool.id))
                    .map((tool) => {
                    const ToolIcon = tool.icon;
                    const unavailable = isToolUnavailableOnMobile(tool.id);
                    const isActive = selectedTool === tool.id;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        className={`tm-mobile-grid-tile${isActive ? " is-active" : ""}${
                          unavailable ? " is-disabled" : ""
                        }`}
                        disabled={unavailable}
                        onClick={() => {
                          if (!unavailable) {
                            onNavigate(tool.id);
                          }
                        }}
                      >
                        <ToolIcon size={22} strokeWidth={1.85} aria-hidden />
                        <span>{t(tool.shortLabel ?? tool.label)}</span>
                        {unavailable ? (
                          <em className="tm-mobile-grid-soon">
                            {t("comingSoonBadge")}
                          </em>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
