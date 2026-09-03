import { ArrowRight, Clock3, Folder, FolderOpen, Info, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { COPYRIGHT_HOLDER, COPYRIGHT_YEAR } from "../config/appMeta";
import {
  AppToolId,
  MOBILE_TOOL_COUNT,
  TOOL_COUNT,
  TOOL_NAV_SECTIONS,
  UPCOMING_TOOL_COUNT,
  isToolListedOnMobile,
  isUpcomingTool,
} from "../config/toolNavigation";
import { getGameFilesLayout } from "../services/tauriGeodeButtons";
import { openPathInOs } from "../services/tauriSettings";
import {
  collectHomeSplashTitles,
  HOME_SPLASH_FADE_MS,
  HOME_SPLASH_INTERVAL_MS,
  homeSplashGroupsForDate,
  type HomeSplashGroup,
} from "../utils/homeSplash";
import { redactAbsolutePathsInText } from "../utils/pathDisplay";
import { isDesktopPlatform, isMobileShell } from "../utils/platform";
import { GlassFrost } from "./GlassFrost";
import { TranslationQualityNotice } from "./TranslationQualityNotice";

type HomeScreenProps = {
  onSelectTool: (toolId: AppToolId) => void;
  /** Opens the About / copyright dialog (shown on mobile home footer). */
  onAboutClick?: () => void;
};

type HomeUtilityKind = "packs" | "game" | "save";

function readSplashGroup(t: (key: string, options: { returnObjects: true }) => unknown, group: HomeSplashGroup): string[] {
  const value = t(`homeScreen.splash.${group}`, { returnObjects: true });
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

export function HomeScreen({ onSelectTool, onAboutClick }: HomeScreenProps) {
  const { t, i18n } = useTranslation("navigation");
  const mobileShell = isMobileShell();
  const showDesktopUtilities = isDesktopPlatform();
  const showAbout = Boolean(mobileShell && onAboutClick);
  const visibleToolCount = mobileShell ? MOBILE_TOOL_COUNT : TOOL_COUNT;
  const titles = useMemo(() => {
    const collected = collectHomeSplashTitles(homeSplashGroupsForDate(new Date()), (group) =>
      readSplashGroup(t, group),
    );
    return collected.length > 0 ? collected : [t("homeScreen.title")];
  }, [i18n.language, t]);
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [utilityError, setUtilityError] = useState<string | null>(null);
  const [utilityBusy, setUtilityBusy] = useState(false);

  useEffect(() => {
    setIndex(Math.floor(Math.random() * titles.length));
    setFading(false);
  }, [i18n.language, titles.length]);

  useEffect(() => {
    if (titles.length < 2) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let timeoutId = 0;
    const intervalId = window.setInterval(() => {
      setFading(true);
      timeoutId = window.setTimeout(() => {
        setIndex((current) => (current + 1) % titles.length);
        setFading(false);
      }, HOME_SPLASH_FADE_MS);
    }, HOME_SPLASH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [titles]);

  const openUtilityFolder = useCallback(
    async (kind: HomeUtilityKind) => {
      setUtilityError(null);
      setUtilityBusy(true);
      try {
        const layout = await getGameFilesLayout();
        let path = "";
        let failKey = "homeScreen.openSaveFolderFailed";
        switch (kind) {
          case "packs":
            path = layout.textureLoaderPacksDir;
            failKey = "homeScreen.openPacksFolderFailed";
            break;
          case "game":
            path = layout.geometryDashDir;
            failKey = "homeScreen.openGameFilesFailed";
            break;
          case "save":
            path = layout.geometryDashSaveDir;
            failKey = "homeScreen.openSaveFolderFailed";
            break;
          default: {
            const _exhaustive: never = kind;
            return _exhaustive;
          }
        }
        if (!path.trim()) {
          throw new Error(t(failKey));
        }
        await openPathInOs(path);
      } catch (err: unknown) {
        setUtilityError(
          redactAbsolutePathsInText(
            err instanceof Error ? err.message : t("homeScreen.openSaveFolderFailed"),
          ),
        );
      } finally {
        setUtilityBusy(false);
      }
    },
    [t],
  );

  return (
    <div className={`tm-home${mobileShell ? " tm-home--mobile" : ""}`}>
      <TranslationQualityNotice variant="banner" />
      <header className="tm-home-hero">
        {mobileShell ? null : <GlassFrost className="tm-home-hero-frost" />}
        <div className="tm-home-hero-copy">
          <h2 className={`tm-home-title${fading ? " is-fading" : ""}`}>{titles[index] ?? t("homeScreen.title")}</h2>
          <p className="tm-home-lead">{t("homeScreen.lead")}</p>
          {showDesktopUtilities ? (
            <div className="tm-home-utilities" role="group" aria-label={t("homeScreen.utilitiesAria")}>
              <button
                type="button"
                className="tm-home-utility-btn"
                disabled={utilityBusy}
                onClick={() => {
                  void openUtilityFolder("packs");
                }}
              >
                <FolderOpen size={15} strokeWidth={1.9} aria-hidden />
                {t("homeScreen.openPacksFolder")}
              </button>
              <button
                type="button"
                className="tm-home-utility-btn"
                disabled={utilityBusy}
                onClick={() => {
                  void openUtilityFolder("game");
                }}
              >
                <Folder size={15} strokeWidth={1.9} aria-hidden />
                {t("homeScreen.openGameFiles")}
              </button>
              <button
                type="button"
                className="tm-home-utility-btn"
                disabled={utilityBusy}
                onClick={() => {
                  void openUtilityFolder("save");
                }}
              >
                <Save size={15} strokeWidth={1.9} aria-hidden />
                {t("homeScreen.openSaveFolder")}
              </button>
              {utilityError ? (
                <p className="tm-home-utilities-error" role="status">
                  {utilityError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div
          className="tm-home-hero-stats"
          aria-label={t("homeScreen.toolsAvailableAria", { count: visibleToolCount })}
        >
          <span className="tm-home-stat-value">{visibleToolCount}</span>
          <span className="tm-home-stat-label">{t("homeScreen.toolsReady")}</span>
          {!mobileShell && UPCOMING_TOOL_COUNT > 0 ? (
            <span className="tm-home-stat-upcoming">
              {t("homeScreen.comingSoonCount", { count: UPCOMING_TOOL_COUNT })}
            </span>
          ) : null}
        </div>
      </header>

      <div className="tm-home-sections">
        {TOOL_NAV_SECTIONS.map((section) => {
          const SectionIcon = section.icon;
          const sectionTools = mobileShell
            ? section.tools.filter((tool) => isToolListedOnMobile(tool.id))
            : section.tools;
          if (sectionTools.length === 0) {
            return null;
          }
          return (
            <section
              key={section.id}
              className={`tm-home-section tm-home-section-${section.accent}`}
              aria-labelledby={`home-section-${section.id}`}
            >
              <div className="tm-home-section-head">
                <span className="tm-home-section-icon" aria-hidden>
                  <SectionIcon size={18} strokeWidth={1.85} />
                </span>
                <div>
                  <h3 id={`home-section-${section.id}`} className="tm-home-section-title">
                    {t(section.title)}
                  </h3>
                  <p className="tm-home-section-subtitle">{t(section.subtitle)}</p>
                </div>
              </div>

              <div
                className={`tm-home-card-grid ${
                  sectionTools.some((tool) => tool.featured)
                    ? "tm-home-card-grid-featured"
                    : ""
                }`}
                role="list"
              >
                {sectionTools.map((tool) => {
                  const ToolIcon = tool.icon;
                  const isUpcoming = isUpcomingTool(tool.id);
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      className={`tm-home-card tm-home-card-${section.accent}${
                        tool.featured ? " tm-home-card-featured" : ""
                      }${isUpcoming ? " tm-home-card-upcoming" : ""}`}
                      onClick={() => {
                        if (!isUpcoming) {
                          onSelectTool(tool.id);
                        }
                      }}
                      disabled={isUpcoming}
                      aria-disabled={isUpcoming || undefined}
                      role="listitem"
                    >
                      <GlassFrost className="tm-home-card-frost" />
                      {isUpcoming ? (
                        <span className="tm-home-card-badge">
                          {t("homeScreen.cardComingSoon")}
                        </span>
                      ) : null}
                      <span className="tm-home-card-icon" aria-hidden>
                        <ToolIcon
                          size={mobileShell ? 20 : tool.featured ? 30 : 22}
                          strokeWidth={1.75}
                        />
                      </span>
                      <span className="tm-home-card-body">
                        <span className="tm-home-card-label">{t(tool.label)}</span>
                        <span className="tm-home-card-desc">{t(tool.description)}</span>
                      </span>
                      <span className="tm-home-card-action" aria-hidden>
                        {isUpcoming ? (
                          <Clock3 size={18} strokeWidth={2} />
                        ) : (
                          <ArrowRight size={18} strokeWidth={2} />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {showAbout ? (
          <section
            className="tm-home-section tm-home-section-sky tm-home-section-about"
            aria-labelledby="home-section-about"
          >
            <div className="tm-home-section-head">
              <span className="tm-home-section-icon" aria-hidden>
                <Info size={18} strokeWidth={1.85} />
              </span>
              <div>
                <h3 id="home-section-about" className="tm-home-section-title">
                  {t("homeScreen.aboutTitle")}
                </h3>
                <p className="tm-home-section-subtitle">{t("homeScreen.aboutSubtitle")}</p>
              </div>
            </div>
            <div className="tm-home-card-grid tm-home-card-grid-featured" role="list">
              <button
                type="button"
                className="tm-home-card tm-home-card-sky tm-home-card-featured tm-home-card-about"
                onClick={onAboutClick}
                aria-label={t("copyrightAria")}
                role="listitem"
              >
                <GlassFrost className="tm-home-card-frost" />
                <span className="tm-home-card-icon" aria-hidden>
                  <Info size={20} strokeWidth={1.75} />
                </span>
                <span className="tm-home-card-body">
                  <span className="tm-home-card-label">{t("homeScreen.aboutCardLabel")}</span>
                  <span className="tm-home-card-desc">
                    {t("copyrightTitle", {
                      holder: COPYRIGHT_HOLDER,
                      year: COPYRIGHT_YEAR,
                    })}
                  </span>
                </span>
                <span className="tm-home-card-action" aria-hidden>
                  <ArrowRight size={18} strokeWidth={2} />
                </span>
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
