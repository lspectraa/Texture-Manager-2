import { FolderInput, FolderOutput } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PickFolderFn } from "../types";
import { FolderPathField } from "./FolderPathField";
import { ToolSection } from "./ToolSection";

type ToolPathsSectionProps = {
  inputDir: string;
  outputDir: string;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  pickFolder: PickFolderFn;
  inputPlaceholder?: string;
  outputPlaceholder?: string;
  mirrorOutputOnInputBrowse?: boolean;
};

export function ToolPathsSection({
  inputDir,
  outputDir,
  onInputDirChange,
  onOutputDirChange,
  pickFolder,
  inputPlaceholder = "C:/path/to/texturepack",
  outputPlaceholder = "C:/path/to/output",
  mirrorOutputOnInputBrowse = true,
}: ToolPathsSectionProps) {
  const { t } = useTranslation("tools");

  return (
    <ToolSection
      title={t("common.sourceAndOutput")}
      subtitle={t("common.sourceAndOutputDescription")}
      icon={FolderInput}
      columns={2}
    >
      <FolderPathField
        label={t("common.inputDirectory")}
        value={inputDir}
        onChange={onInputDirChange}
        pickFolder={pickFolder}
        placeholder={inputPlaceholder}
        onBrowse={
          mirrorOutputOnInputBrowse
            ? (path) => {
                onInputDirChange(path);
                if (!outputDir.trim()) {
                  onOutputDirChange(path);
                }
              }
            : undefined
        }
      />
      <FolderPathField
        label={t("common.outputDirectory")}
        value={outputDir}
        onChange={onOutputDirChange}
        pickFolder={pickFolder}
        placeholder={outputPlaceholder}
      />
      <p className="tm-tool-section-note">
        <FolderOutput size={14} aria-hidden />
        {t("common.outputMirroringNote")}
      </p>
    </ToolSection>
  );
}
