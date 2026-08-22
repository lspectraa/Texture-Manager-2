import { FolderInput } from "lucide-react";
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

  const resolveOutputFolder: PickFolderFn = (assign, options) => {
    if (pickOutputFolder) {
      return pickOutputFolder(assign, options);
    }
    // Prefer a real user-chosen folder (writable with all-files access on Android).
    return pickFolder(assign, {
      ...options,
      importToSandbox: false,
    });
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
        sandboxImported={mobile && inputDir.trim().length > 0}
        onBrowse={(path) => {
          onInputDirChange(path);
          if (outputDir.trim()) {
            return;
          }
          if (mobile) {
            // Default output into app sandbox so a run can complete without a second pick.
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
        sandboxImported={mobile && outputDir.trim().length > 0}
      />
      {!mobile ? (
        <p className="tm-tool-section-note">{t("common.outputMirroringNote")}</p>
      ) : null}
    </ToolSection>
  );
}
