import { Info } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AboutContent, AboutVersionRow } from "../AboutContent";
import { ToolPage } from "./layout";

function scrollPanelBodyToTop(): void {
  const panelBody = document.querySelector(".tm-panel-body");
  if (panelBody instanceof HTMLElement) {
    panelBody.scrollTop = 0;
  }
  window.scrollTo(0, 0);
}

/** Mobile About view — same copy as the desktop dialog via AboutContent. */
export function AboutToolPanel() {
  const { t } = useTranslation("common");

  useEffect(() => {
    scrollPanelBodyToTop();
    // Re-run after layout in case the previous home scroll position restores late.
    const frame = window.requestAnimationFrame(() => {
      scrollPanelBodyToTop();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <ToolPage accent="sky" wide>
      <header className="tm-tool-page-header tm-about-page-header">
        <div className="tm-tool-page-header-main">
          <span className="tm-tool-page-header-icon" aria-hidden>
            <Info size={24} strokeWidth={1.75} />
          </span>
          <div className="tm-tool-page-header-copy">
            <h2 className="tm-tool-page-title">{t("about.title")}</h2>
            <p className="tm-tool-page-description">{t("about.description")}</p>
          </div>
        </div>
        <AboutVersionRow className="tm-about-page-version" />
      </header>
      <AboutContent hideDescription showVersion={false} />
    </ToolPage>
  );
}
