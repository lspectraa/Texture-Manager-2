import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AppToolId, getToolMeta } from "../../../config/toolNavigation";

type ToolPageHeaderProps = {
  toolId: AppToolId;
  description?: ReactNode;
};

export function ToolPageHeader({ toolId, description }: ToolPageHeaderProps) {
  const { t } = useTranslation("navigation");
  const meta = getToolMeta(toolId);
  if (!meta) {
    return null;
  }

  const ToolIcon = meta.icon;

  return (
    <header className="tm-tool-page-header">
      <div className="tm-tool-page-header-main">
        <span className="tm-tool-page-header-icon" aria-hidden>
          <ToolIcon size={24} strokeWidth={1.75} />
        </span>
        <div className="tm-tool-page-header-copy">
          <h2 className="tm-tool-page-title">{t(meta.label)}</h2>
          <p className="tm-tool-page-description">
            {description ?? t(meta.description)}
          </p>
        </div>
      </div>
    </header>
  );
}
