import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { COPYRIGHT_HOLDER, COPYRIGHT_SYMBOL, COPYRIGHT_YEAR } from "../../config/appMeta";
import {
  initialSectionLeads,
  nextSectionLeads,
  pathSectionKey,
  pathSectionNumber,
  pathSectionOfTool,
  type PathSectionKey,
} from "../../config/pathHome";
import {
  TOOL_NAV_SECTIONS,
  getToolAccent,
  getToolMeta,
  isUpcomingTool,
  type AppToolId,
  type ToolNavSection,
} from "../../config/toolNavigation";
import { useHomeSplashTitle } from "../../hooks/useHomeSplashTitle";
import { useHomeUtilityFolders } from "../../hooks/useHomeUtilityFolders";
import { isDesktopPlatform } from "../../utils/platform";
import {
  CHAMBER_EMBLEM_MARKUP,
  CHAMBER_FRAME_MARKUP,
  PATH_RAIL_MARKUP,
  PATH_TOOL_ICON_MARKUP,
} from "./pathArt";
import { PathWave } from "./PathWave";

type PathHomeProps = {
  /** Tool shown as the live lead (hover / focus preview). */
  previewTool: AppToolId;
  onPreview: (toolId: AppToolId) => void;
  onOpenTool: (toolId: AppToolId) => void;
  onCopyrightClick: () => void;
  /** Play the first-paint entrance (mast surface, staggered card rise). */
  entering: boolean;
  /** Update / translation notices, shown in the band above the mast. */
  notices?: ReactNode;
};

/**
 * PC "Path" home (SPEC §5.2): mast with wordmark, waved heading and folder shortcuts;
 * three section cards on a decorated rail. Hover or focus previews a tool in its card;
 * one click enters. Card geometry never changes between idle and live states.
 */
export function PathHome({
  previewTool,
  onPreview,
  onOpenTool,
  onCopyrightClick,
  entering,
  notices,
}: PathHomeProps) {
  const { t } = useTranslation("navigation");
  const { title, fading } = useHomeSplashTitle();
  const { openUtilityFolder, utilityBusy, utilityError } = useHomeUtilityFolders();
  const showUtilities = isDesktopPlatform();
  const liveSection = pathSectionOfTool(previewTool);
  const [leads, setLeads] = useState(() => initialSectionLeads(previewTool));

  useEffect(() => {
    setLeads((previous) => nextSectionLeads(previous, previewTool));
  }, [previewTool]);

  return (
    <div
      className={`tm-path-home${entering ? " is-entering" : ""}`}
      data-live={liveSection}
      data-tool-acc={getToolAccent(previewTool)}
    >
      {notices ? <div className="tm-path-topbar">{notices}</div> : null}
      <div className="tm-path-view">
        <div className="tm-path-chambers">
          <header className="tm-path-mast">
            <div className="tm-path-mast-copy">
              <p className="tm-path-wordmark">
                {t("common:productName")}
                <button
                  type="button"
                  className="tm-path-wordmark-copy"
                  onClick={onCopyrightClick}
                  aria-haspopup="dialog"
                  aria-label={t("copyrightAria")}
                >
                  <span className="tm-path-wordmark-sym" aria-hidden="true">
                    {COPYRIGHT_SYMBOL}
                  </span>
                  {t("homeScreen.wordmarkCopyright", {
                    year: COPYRIGHT_YEAR,
                    holder: COPYRIGHT_HOLDER,
                  })}
                </button>
              </p>
              <h1 className={`tm-path-display${fading ? " is-fading" : ""}`}>
                {title}
                <PathWave />
              </h1>
              {showUtilities ? (
                <div
                  className="tm-path-actions"
                  role="group"
                  aria-label={t("homeScreen.utilitiesAria")}
                >
                  <button
                    type="button"
                    className="tm-path-act"
                    disabled={utilityBusy}
                    onClick={() => void openUtilityFolder("packs")}
                  >
                    {t("homeScreen.openPacksFolder")}
                  </button>
                  <button
                    type="button"
                    className="tm-path-act"
                    disabled={utilityBusy}
                    onClick={() => void openUtilityFolder("game")}
                  >
                    {t("homeScreen.openGameFiles")}
                  </button>
                  <button
                    type="button"
                    className="tm-path-act"
                    disabled={utilityBusy}
                    onClick={() => void openUtilityFolder("save")}
                  >
                    {t("homeScreen.openSaveFolder")}
                  </button>
                  {utilityError ? (
                    <p className="tm-path-actions-error" role="status">
                      {utilityError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <p className="tm-path-lead">{t("homeScreen.pathLead")}</p>
          </header>

          <div className="tm-path-stage">
            <div className="tm-path-floor" aria-hidden="true" />
            {/* Static decorative rail markup from the locked mock (no user data). */}
            <div
              className="tm-path-decor"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: PATH_RAIL_MARKUP }}
            />
            {TOOL_NAV_SECTIONS.map((section, index) => {
              const key = pathSectionKey(section);
              return (
                <PathChamber
                  key={section.id}
                  section={section}
                  slot={key}
                  number={pathSectionNumber(index)}
                  live={key === liveSection}
                  leadTool={leads[key]}
                  previewTool={previewTool}
                  onPreview={onPreview}
                  onOpenTool={onOpenTool}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

type PathChamberProps = {
  section: ToolNavSection;
  slot: PathSectionKey;
  number: string;
  live: boolean;
  leadTool: AppToolId;
  previewTool: AppToolId;
  onPreview: (toolId: AppToolId) => void;
  onOpenTool: (toolId: AppToolId) => void;
};

function PathChamber({
  section,
  slot,
  number,
  live,
  leadTool,
  previewTool,
  onPreview,
  onOpenTool,
}: PathChamberProps) {
  const { t } = useTranslation("navigation");
  const lead = getToolMeta(leadTool) ?? section.tools[0];
  const headingId = `tm-path-sec-${slot}`;

  return (
    <div className={`tm-chamber-wrap ${slot} tm-acc-${section.accent}${live ? " is-live" : ""}`}>
      <div className="tm-chamber-rim" aria-hidden="true" />
      <div className="tm-chamber-slot">
        <section className="tm-chamber" aria-labelledby={headingId}>
          <div
            className="tm-ch-frame"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: CHAMBER_FRAME_MARKUP }}
          />
          <div
            className="tm-ch-orn"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: CHAMBER_EMBLEM_MARKUP[slot] }}
          />
          <div className="tm-ch-k">
            <h2 className="tm-path-kicker" id={headingId}>
              {t(section.title)}
            </h2>
            <span className="tm-ch-no">
              {t("homeScreen.sectionIndex", { index: number, count: section.tools.length })}
            </span>
          </div>
          <div className="tm-ch-stack">
            {lead ? (
              <div
                className="tm-ch-body"
                onClick={live && !isUpcomingTool(lead.id) ? () => onOpenTool(lead.id) : undefined}
              >
                <div className="tm-path-display tm-ch-lead-name">{t(lead.label)}</div>
                <p className="tm-ch-lead-desc">{t(lead.description)}</p>
              </div>
            ) : null}
            <div className="tm-tcards" role="list">
              {section.tools.map((tool) => {
                const upcoming = isUpcomingTool(tool.id);
                const label = t(tool.label);
                return (
                  <div role="listitem" key={tool.id} className="tm-tcard-slot">
                    <button
                      type="button"
                      className={`tm-tcard${tool.id === previewTool ? " is-on" : ""}`}
                      title={label}
                      disabled={upcoming}
                      aria-current={tool.id === previewTool ? "true" : undefined}
                      onPointerEnter={() => onPreview(tool.id)}
                      onFocus={() => onPreview(tool.id)}
                      onClick={() => {
                        if (!upcoming) {
                          onOpenTool(tool.id);
                        }
                      }}
                    >
                      <span className="tm-tcard-ico" aria-hidden="true">
                        <svg
                          viewBox="0 0 24 24"
                          dangerouslySetInnerHTML={{ __html: PATH_TOOL_ICON_MARKUP[tool.id] }}
                        />
                      </span>
                      <span className="tm-tcard-name">{label}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
