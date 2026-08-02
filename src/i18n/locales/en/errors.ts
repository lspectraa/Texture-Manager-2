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
  packInstaller: {
    geometryDashRequired:
      "Geometry Dash path not found. Set it in Settings (or install GD + Geode via Steam) before installing packs.",
    runtimeUnavailable: "Pack Installer is available only in the desktop app.",
    discoverFailed: "Failed to discover install units from the selected source.",
    installFailed: "Failed to install the selected pack units.",
    createFailed: "Failed to create the texture pack folder.",
    openFolderFailed: "Failed to open the pack folder.",
    noUnitsSelected: "Select at least one install unit.",
    convertVersionRequired:
      "Choose the pack’s previous game version when Convert to Latest Version is enabled.",
    folderNameRequired: "Enter a folder name for the new pack.",
    invalidDropPng: "Drop a .png file for pack.png, or switch to Install mode for folders/zips.",
    listFailed: "Failed to list installed packs.",
    saveMetadataFailed: "Failed to save pack metadata.",
    operationFailed: "Failed to run the pack operation.",
    noLibraryPackSelected: "Select a pack from the library first.",
    openPacksFolderFailed: "Failed to open the packs folder.",
    deleteFailed: "Failed to delete the pack.",
    splitOutputRequired: "Choose an output folder before splitting the pack.",
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
