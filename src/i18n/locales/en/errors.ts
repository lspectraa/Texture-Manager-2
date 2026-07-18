const errors = {
  defaults: {
    loadFailed: "Failed to load phase defaults from backend.",
    unexpectedLoadFailure: "Unexpected error while loading defaults.",
  },
  runtime: {
    folderPickerUnavailable: "Folder picker is available in Tauri runtime.",
    filePickerUnavailable: "File picker is only available in Tauri runtime.",
  },
  validation: {
    splitterPathsRequired: "Splitter requires both input and output directories.",
    porterPathsRequired: "Porter requires both input and output directories.",
    mergerPathsRequired: "Merger requires both input and output directories.",
    glowMakerPathsRequired:
      "Glow Maker requires both input and output directories.",
    convertPathsRequired:
      "Convert to New Version requires both input and output directories.",
    convertVersionRequired:
      "Convert to New Version requires a previous game version.",
    randomizerPathsRequired:
      "Randomizer requires both input and output directories.",
    geodeButtonsPathsRequired:
      "Create Geode Buttons requires both input and output directories.",
    operationRequestMissing: "No operation request was built.",
  },
  operation: {
    cancelled: "Operation cancelled.",
    backendExecutionFailed:
      "Failed to execute operation through backend. {{error}}",
  },
  geodeButtons: {
    gameFilesNotFound:
      "Could not resolve geode.loader game files. Set TM_GEOMETRY_DASH_DIR or install Geometry Dash + Geode via Steam.",
    resolveDefaultInputFailed: "Failed to resolve default input.",
    blankSheetNotFound:
      "Could not auto-find BlankSheet in geode.loader (or the selected input directory).",
    autoSelectPlistFailed: "Failed to auto-select plist.",
    readTargetFramesFailed: "Failed to read target frames.",
    imageLoadFailed: "failed to load image",
  },
  iconEditor: {
    decodeFrameFailed: "Failed to decode extracted frame image.",
    allocateCanvasFailed: "Failed to allocate canvas for extracted frame.",
    loadSheetFailed: "Failed to load icon sheet.",
    runtimeUnavailable: "Icon editor is available only in Tauri runtime.",
    savePlistFailed: "Failed to save plist changes.",
    renameSheetFailed: "Failed to rename sheet files.",
    swapNamesFailed: "Failed to swap sheet names.",
    saveCopyFailed: "Failed to save sheet copy.",
    textureImportUnavailable:
      "Texture import is available only in Tauri runtime.",
    inferStemFailed:
      "Could not infer icon stem from plist. Expected frame names like {type}_{number}_001, {type}_{number}_2_001, {type}_{number}_3_001, {type}_{number}_glow_001, or {type}_{number}_extra_001.",
    robotExtraUnsupported: "Extra is only supported on robot head.",
    spiderExtraUnsupported:
      "Extra is only supported on spider body (part 01).",
    importTextureFailed: "Failed to import texture.",
    noVisibleLayers: "No visible icon layers available to export.",
    noVisibleLayersDetail:
      "Assign at least one frame (for example, primary) before downloading.",
    stageUnavailable: "Failed to access icon stage for export.",
    stageUnavailableDetail:
      "Stage element ref was null while preparing download.",
    noRenderedLayers: "No rendered icon layers available to export.",
    noRenderedLayersDetail:
      "Layer DOM bounds were empty while preparing icon PNG.",
    exportPngFailed: "Failed to export icon PNG.",
    cause: "Cause: {{cause}}",
  },
} as const;

export default errors;
