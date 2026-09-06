import { FolderInput } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isAppSandboxPath } from "../../../utils/pathDisplay";
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
  outputToolId: _outputToolId = "batch",
  inputPlaceholder = "C:/path/to/texturepack",
  outputPlaceholder = "C:/path/to/output",
  mirrorOutputOnInputBrowse = true,
}: ToolPathsSectionProps) {
  const { t } = useTranslation("tools");

  const resolveInputFolder: PickFolderFn = (assign, options) => {
    // Prefer real filesystem paths on Android rather than sandbox imports.
    return pickFolder(assign, {
      ...options,
      importToSandbox: false,
    });
  };

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
        pickFolder={resolveInputFolder}
        placeholder={inputPlaceholder}
        sandboxImported={isAppSandboxPath(inputDir)}
        onBrowse={(path) => {
          onInputDirChange(path);
          if (outputDir.trim()) {
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
        sandboxImported={isAppSandboxPath(outputDir)}
      />
      <p className="tm-tool-section-note">{t("common.outputMirroringNote")}</p>
    </ToolSection>
  );
}
