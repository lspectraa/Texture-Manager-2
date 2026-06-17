import { Dices } from "lucide-react";
import { PickFolderFn } from "./types";
import {
  ToolPage,
  ToolPageHeader,
  ToolPathsSection,
  ToolSection,
  ToolTextField,
} from "./layout";

type RandomizerToolPanelProps = {
  inputDir: string;
  outputDir: string;
  seed: string;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onSeedChange: (value: string) => void;
  pickFolder: PickFolderFn;
};

export function RandomizerToolPanel({
  inputDir,
  outputDir,
  seed,
  onInputDirChange,
  onOutputDirChange,
  onSeedChange,
  pickFolder,
}: RandomizerToolPanelProps) {
  return (
    <ToolPage accent="amber">
      <ToolPageHeader toolId="randomizer" />
      <ToolPathsSection
        inputDir={inputDir}
        outputDir={outputDir}
        onInputDirChange={onInputDirChange}
        onOutputDirChange={onOutputDirChange}
        pickFolder={pickFolder}
      />
      <ToolSection
        title="Randomization"
        subtitle="Use a fixed seed to reproduce the same shuffle later"
        icon={Dices}
      >
        <ToolTextField
          label="Seed"
          hint="Optional"
          value={seed}
          onChange={onSeedChange}
          placeholder="Leave blank for random seed"
        />
      </ToolSection>
    </ToolPage>
  );
}
