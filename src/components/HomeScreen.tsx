import { ArrowRight, Clock3, Sparkles } from "lucide-react";
import { AppToolId, TOOL_COUNT, TOOL_NAV_SECTIONS, UPCOMING_TOOL_COUNT } from "../config/toolNavigation";

type HomeScreenProps = {
  onSelectTool: (toolId: AppToolId) => void;
};

export function HomeScreen({ onSelectTool }: HomeScreenProps) {
  return (
    <div className="tm-home">
      <header className="tm-home-hero">
        <div className="tm-home-hero-copy">
          <p className="tm-home-eyebrow">
            <Sparkles size={14} aria-hidden />
            Texture workflow hub
          </p>
          <h2 className="tm-home-title">What would you like to work on?</h2>
          <p className="tm-home-lead">
            Pick a tool below to open its workspace. Tools are grouped by workflow so you can jump
            straight to the task at hand.
          </p>
        </div>
        <div className="tm-home-hero-stats" aria-label={`${TOOL_COUNT} tools available`}>
          <span className="tm-home-stat-value">{TOOL_COUNT}</span>
          <span className="tm-home-stat-label">tools ready</span>
          {UPCOMING_TOOL_COUNT > 0 ? (
            <span className="tm-home-stat-upcoming">
              +{UPCOMING_TOOL_COUNT} coming soon
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
                    {section.title}
                  </h3>
                  <p className="tm-home-section-subtitle">{section.subtitle}</p>
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
                      {isUpcoming ? (
                        <span className="tm-home-card-badge">Coming soon</span>
                      ) : null}
                      <span className="tm-home-card-icon" aria-hidden>
                        <ToolIcon size={tool.featured ? 30 : 22} strokeWidth={1.75} />
                      </span>
                      <span className="tm-home-card-body">
                        <span className="tm-home-card-label">{tool.label}</span>
                        <span className="tm-home-card-desc">{tool.description}</span>
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
