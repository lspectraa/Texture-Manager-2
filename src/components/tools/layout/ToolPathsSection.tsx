import { FolderInput, FolderOutput } from "lucide-react";
import { useTranslation } from "react-i18next";
import { allocateOutputDir } from "../../../services/tauriMobileFs";
import { isMobileShell } from "../../../utils/platform";
import { PickFolderFn } from "../types";
import { FolderPathField } from "./FolderPathField";
import { ToolSection } from "./ToolSection";

type ToolPathsSectionProps = {
  inputDir: string;
  outputDir: string;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  pickFolder: PickFolderFn;
  pickOutputFolder?: PickFolderFn;
  outputToolId?: string;
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
  pickOutputFolder,
  outputToolId = "batch",
  inputPlaceholder = "C:/path/to/texturepack",
  outputPlaceholder = "C:/path/to/output",
  mirrorOutputOnInputBrowse = true,
}: ToolPathsSectionProps) {
  const { t } = useTranslation("tools");
  const mobile = isMobileShell();

  const resolveOutputFolder: PickFolderFn = (assign) => {
    if (pickOutputFolder) {
      return pickOutputFolder(assign);
    }
    if (mobile) {
      return allocateOutputDir(outputToolId).then((dir) => {
        if (dir.trim()) {
          assign(dir);
        }
      });
    }
    return pickFolder(assign);
  };

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
        onBrowse={(path) => {
          onInputDirChange(path);
          if (outputDir.trim()) {
            return;
          }
          if (mobile) {
            void allocateOutputDir(outputToolId).then((dir) => {
              if (dir.trim()) {
                onOutputDirChange(dir);
              }
            });
            return;
          }
          if (mirrorOutputOnInputBrowse) {
            onOutputDirChange(path);
          }
        }}
      />
      <FolderPathField
        label={t("common.outputDirectory")}
        value={outputDir}
        onChange={onOutputDirChange}
        pickFolder={resolveOutputFolder}
        placeholder={outputPlaceholder}
      />
      <p className="tm-tool-section-note">
        <FolderOutput size={14} aria-hidden />
        {mobile ? t("common.mobileOutputNote") : t("common.outputMirroringNote")}
      </p>
    </ToolSection>
  );
}
