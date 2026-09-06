import {
  Code2,
  Cpu,
  ExternalLink,
  MessageCircle,
  Play,
  Scale,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  APP_LINKS,
  APP_LICENSE_SPDX,
  APP_VERSION,
  COPYRIGHT_HOLDER,
  COPYRIGHT_YEAR,
} from "../config/appMeta";
import { openExternalUrl } from "../utils/openExternalUrl";
import { ToolSection } from "./tools/layout";

export const ABOUT_LINK_ITEMS = [
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

type AboutExternalLinkProps = {
  label: string;
  hint: string;
  url: string;
  icon?: LucideIcon;
};

function AboutExternalLink({ label, hint, url, icon: Icon }: AboutExternalLinkProps) {
  return (
    <button
      type="button"
      className={`tm-about-link${Icon ? "" : " tm-about-link--plain"}`}
      onClick={() => {
        void openExternalUrl(url);
      }}
    >
      {Icon ? (
        <span className="tm-about-link-icon" aria-hidden>
          <Icon size={17} strokeWidth={1.85} />
        </span>
      ) : null}
      <span className="tm-about-link-copy">
        <span className="tm-about-link-label">{label}</span>
        <span className="tm-about-link-hint">{hint}</span>
      </span>
      <ExternalLink
        className="tm-about-link-external"
        size={14}
        strokeWidth={2}
        aria-hidden
      />
    </button>
  );
}

type AboutContentProps = {
  /** Omit the long description when the parent page header already shows it. */
  hideDescription?: boolean;
  /** When false, omit the version row (parent shows it elsewhere). Default true. */
  showVersion?: boolean;
};

export function AboutVersionRow({ className }: { className?: string }) {
  const { t } = useTranslation("common");
  return (
    <div className={className ?? "tm-about-footer"}>
      <span className="tm-about-version-label">{t("about.version")}</span>
      <span className="tm-about-version-value">v{APP_VERSION}</span>
    </div>
  );
}

/** Shared about / copyright body for the desktop dialog and mobile tool page. */
export function AboutContent({
  hideDescription = false,
  showVersion = true,
}: AboutContentProps) {
  const { t } = useTranslation("common");

  return (
    <div className="tm-about-content">
      <p className="tm-about-notice">
        {t("about.copyright", {
          year: COPYRIGHT_YEAR,
          holder: COPYRIGHT_HOLDER,
        })}
      </p>
      {hideDescription ? null : (
        <p className="tm-about-copy">{t("about.description")}</p>
      )}

      <div className="tm-about-sections">
        <ToolSection
          title={t("about.licenseHeading")}
          subtitle={t("about.licenseName")}
          icon={Scale}
          className="tm-about-section"
        >
          <span className="tm-about-spdx">{APP_LICENSE_SPDX}</span>
          <p className="tm-about-summary">{t("about.licenseSummary")}</p>
          <AboutExternalLink
            label={t("about.licenseLink")}
            hint={t("about.licenseHint")}
            url={APP_LINKS.license}
          />
        </ToolSection>

        <ToolSection
          title={t("about.thirdPartyHeading")}
          subtitle={t("about.thirdPartyName")}
          icon={Cpu}
          className="tm-about-section"
        >
          <span className="tm-about-spdx">MIT / BSD-3</span>
          <p className="tm-about-summary">{t("about.thirdPartySummary")}</p>
          <ul className="tm-about-third-party-list">
            <li>{t("about.thirdPartyWaifu2x")}</li>
            <li>{t("about.thirdPartyRealesrgan")}</li>
            <li>{t("about.thirdPartyNcnn")}</li>
          </ul>
          <AboutExternalLink
            label={t("about.thirdPartyLink")}
            hint={t("about.thirdPartyHint")}
            url={APP_LINKS.thirdPartyNotice}
          />
        </ToolSection>

        <ToolSection
          title={t("about.linksHeading")}
          subtitle={t("about.linksSubtitle")}
          className="tm-about-section"
        >
          <div className="tm-about-links">
            {ABOUT_LINK_ITEMS.map((item) => (
              <AboutExternalLink
                key={item.id}
                label={t(item.labelKey)}
                hint={t(item.hintKey)}
                url={item.url}
                icon={item.icon}
              />
            ))}
          </div>
        </ToolSection>
      </div>

      {showVersion ? <AboutVersionRow /> : null}
    </div>
  );
}
