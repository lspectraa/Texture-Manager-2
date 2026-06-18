import { Palette, SlidersHorizontal } from "lucide-react";
import { PickFolderFn } from "./types";
import {
  ToolCheckboxField,
  ToolNumberField,
  ToolPage,
  ToolPageHeader,
  ToolPathsSection,
  ToolSection,
} from "./layout";

type GlowMakerToolPanelProps = {
  inputDir: string;
  outputDir: string;
  thickness: number;
  tolerance: number;
  rainbowGlow: boolean;
  compositeLayers: boolean;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onThicknessChange: (value: number) => void;
  onToleranceChange: (value: number) => void;
  onRainbowGlowChange: (value: boolean) => void;
  onCompositeLayersChange: (value: boolean) => void;
  pickFolder: PickFolderFn;
};

export function GlowMakerToolPanel({
  inputDir,
  outputDir,
  thickness,
  tolerance,
  rainbowGlow,
  compositeLayers,
  onInputDirChange,
  onOutputDirChange,
  onThicknessChange,
  onToleranceChange,
  onRainbowGlowChange,
  onCompositeLayersChange,
  pickFolder,
}: GlowMakerToolPanelProps) {
  return (
    <ToolPage accent="cyan">
      <ToolPageHeader toolId="glowMaker" />
      <ToolPathsSection
        inputDir={inputDir}
        outputDir={outputDir}
        onInputDirChange={onInputDirChange}
        onOutputDirChange={onOutputDirChange}
        pickFolder={pickFolder}
      />
      <ToolSection
        title="Glow Parameters"
        subtitle="Adjust stroke width and alpha filtering thresholds"
        icon={SlidersHorizontal}
        columns={2}
      >
        <ToolNumberField
          label="Glow thickness"
          hint="1–128"
          value={thickness}
          min={1}
          max={128}
          onChange={onThicknessChange}
        />
        <ToolNumberField
          label="Outline alpha minimum"
          hint="0–255"
          value={tolerance}
          min={0}
          max={255}
          onChange={onToleranceChange}
        />
      </ToolSection>
      <ToolSection
        title="Generation Mode"
        subtitle="Choose compositing and color spectrum behavior"
        icon={Palette}
        columns={2}
      >
        <ToolCheckboxField
          label="Composite icon layers before glow (primary + secondary + extra)"
          checked={compositeLayers}
          onChange={onCompositeLayersChange}
        />
        <ToolCheckboxField
          label="Rainbow glow (extended spectrum, cyan → purple → reddish-violet)"
          checked={rainbowGlow}
          onChange={onRainbowGlowChange}
        />
      </ToolSection>
    </ToolPage>
  );
}
