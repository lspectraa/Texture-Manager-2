import { ArrowRight, Clock3, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppToolId, TOOL_COUNT, TOOL_NAV_SECTIONS, UPCOMING_TOOL_COUNT } from "../config/toolNavigation";
import {
  collectHomeSplashTitles,
  HOME_SPLASH_FADE_MS,
  HOME_SPLASH_INTERVAL_MS,
  homeSplashGroupsForDate,
  type HomeSplashGroup,
} from "../utils/homeSplash";
import { GlassFrost } from "./GlassFrost";
import { TranslationQualityNotice } from "./TranslationQualityNotice";

type HomeScreenProps = {
  onSelectTool: (toolId: AppToolId) => void;
};

function readSplashGroup(t: (key: string, options: { returnObjects: true }) => unknown, group: HomeSplashGroup): string[] {
  const value = t(`homeScreen.splash.${group}`, { returnObjects: true });
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

export function HomeScreen({ onSelectTool }: HomeScreenProps) {
  const { t, i18n } = useTranslation("navigation");
  const titles = useMemo(() => {
    const collected = collectHomeSplashTitles(homeSplashGroupsForDate(new Date()), (group) =>
      readSplashGroup(t, group),
    );
    return collected.length > 0 ? collected : [t("homeScreen.title")];
  }, [i18n.language, t]);
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

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

  return (
    <div className="tm-home">
      <TranslationQualityNotice variant="banner" />
      <header className="tm-home-hero">
        <GlassFrost className="tm-home-hero-frost" />
        <div className="tm-home-hero-copy">
          <p className="tm-home-eyebrow">
            <Sparkles size={14} aria-hidden />
            {t("homeScreen.eyebrow")}
          </p>
          <h2 className={`tm-home-title${fading ? " is-fading" : ""}`}>{titles[index] ?? t("homeScreen.title")}</h2>
          <p className="tm-home-lead">{t("homeScreen.lead")}</p>
        </div>
        <div
          className="tm-home-hero-stats"
          aria-label={t("homeScreen.toolsAvailableAria", { count: TOOL_COUNT })}
        >
          <span className="tm-home-stat-value">{TOOL_COUNT}</span>
          <span className="tm-home-stat-label">{t("homeScreen.toolsReady")}</span>
          {UPCOMING_TOOL_COUNT > 0 ? (
            <span className="tm-home-stat-upcoming">
              {t("homeScreen.comingSoonCount", { count: UPCOMING_TOOL_COUNT })}
            </span>
          ) : null}
        </div>
      </header>

      <div className="tm-home-sections">
        {TOOL_NAV_SECTIONS.map((section) => {
          const SectionIcon = section.icon;
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
                  section.tools.some((tool) => tool.featured)
                    ? "tm-home-card-grid-featured"
                    : ""
                }`}
                role="list"
              >
                {section.tools.map((tool) => {
                  const ToolIcon = tool.icon;
                  const isUpcoming = tool.upcoming === true;
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
                        <ToolIcon size={tool.featured ? 30 : 22} strokeWidth={1.75} />
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
      </div>
    </div>
  );
}
