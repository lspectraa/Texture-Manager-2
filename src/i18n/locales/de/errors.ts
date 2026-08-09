const errors = {
  defaults: {
    loadFailed: "Phasen-Standardwerte konnten nicht vom Backend geladen werden.",
    unexpectedLoadFailure: "Unerwarteter Fehler beim Laden der Standardwerte.",
  },
  runtime: {
    folderPickerUnavailable: "Die Ordnerauswahl ist in der Tauri-Laufzeit verfügbar.",
    filePickerUnavailable: "Die Dateiauswahl ist nur in der Tauri-Laufzeit verfügbar.",
  },
  validation: {
    splitterPathsRequired: "Splitter benötigt ein Eingabe- und ein Ausgabeverzeichnis.",
    porterPathsRequired: "Porter benötigt ein Eingabe- und ein Ausgabeverzeichnis.",
    mergerPathsRequired: "Merger benötigt ein Eingabe- und ein Ausgabeverzeichnis.",
    glowMakerPathsRequired: "Glow-Maker benötigt ein Eingabe- und ein Ausgabeverzeichnis.",
    convertPathsRequired:
      "„In neue Version konvertieren“ benötigt ein Eingabe- und ein Ausgabeverzeichnis.",
    convertVersionRequired: "„In neue Version konvertieren“ benötigt eine frühere Spielversion.",
    randomizerPathsRequired: "Randomizer benötigt ein Eingabe- und ein Ausgabeverzeichnis.",
    geodeButtonsPathsRequired:
      "„Geode-Buttons erstellen“ benötigt ein Eingabe- und ein Ausgabeverzeichnis.",
    operationRequestMissing: "Es wurde keine Vorgangsanfrage erstellt.",
  },
  operation: {
    cancelled: "Vorgang abgebrochen.",
    backendExecutionFailed: "Vorgang konnte nicht über das Backend ausgeführt werden. {{error}}",
  },
  geodeButtons: {
    gameFilesNotFound:
      "geode.loader-Spieldateien konnten nicht aufgelöst werden. Setze TM_GEOMETRY_DASH_DIR oder installiere Geometry Dash + Geode über Steam.",
    resolveDefaultInputFailed: "Standardeingabe konnte nicht aufgelöst werden.",
    blankSheetNotFound:
      "BlankSheet konnte in geode.loader (oder im gewählten Eingabeverzeichnis) nicht automatisch gefunden werden.",
    autoSelectPlistFailed: "Plist konnte nicht automatisch ausgewählt werden.",
    readTargetFramesFailed: "Ziel-Frames konnten nicht gelesen werden.",
    imageLoadFailed: "Bild konnte nicht geladen werden",
  },
  packInstaller: {
    geometryDashRequired:
      "Geometry-Dash-Pfad nicht gefunden. Lege ihn in den Einstellungen fest (oder installiere GD + Geode über Steam), bevor du Packs installierst.",
    runtimeUnavailable: "Pack Installer is available only in the desktop app.",
    discoverFailed: "Failed to discover install units from the selected source.",
    installFailed: "Failed to install the selected pack units.",
    createFailed: "Failed to create the texture pack folder.",
    openFolderFailed: "Failed to open the pack folder.",
    noUnitsSelected: "Select at least one install unit.",
    convertVersionRequired: "Choose the pack's previous game version when Convert to Latest Version is enabled.",
    folderNameRequired: "Enter a folder name for the new pack.",
    invalidDropPng: "Drop a .png file for pack.png, or switch to Install mode for folders/zips.",
    invalidDropCreate:
      "Drop a pack folder or a .png for pack.png (use Install mode for zip archives).",
    listFailed: "Failed to list installed packs.",
    saveMetadataFailed: "Failed to save pack metadata.",
    operationFailed: "Failed to run the pack operation.",
    noLibraryPackSelected: "Select a pack from the library first.",
    openPacksFolderFailed: "Failed to open the packs folder.",
    deleteFailed: "Failed to delete the pack.",
    splitOutputRequired: "Choose an output folder before splitting the pack.",
  },
  iconEditor: {
    decodeFrameFailed: "Das extrahierte Frame-Bild konnte nicht dekodiert werden.",
    allocateCanvasFailed: "Canvas für das extrahierte Frame konnte nicht angelegt werden.",
    loadSheetFailed: "Icon-Sheet konnte nicht geladen werden.",
    runtimeUnavailable: "Der Icon-Editor ist nur in der Tauri-Laufzeit verfügbar.",
    savePlistFailed: "Plist-Änderungen konnten nicht gespeichert werden.",
    renameSheetFailed: "Sheet-Dateien konnten nicht umbenannt werden.",
    swapNamesFailed: "Sheet-Namen konnten nicht getauscht werden.",
    saveCopyFailed: "Sheet-Kopie konnte nicht gespeichert werden.",
    textureImportUnavailable: "Der Texturimport ist nur in der Tauri-Laufzeit verfügbar.",
    inferStemFailed:
      "Der Icon-Stamm konnte nicht aus dem Plist abgeleitet werden. Erwartet werden Frame-Namen wie {type}_{number}_001, {type}_{number}_2_001, {type}_{number}_3_001, {type}_{number}_glow_001 oder {type}_{number}_extra_001.",
    robotExtraUnsupported: "Extra wird nur am Roboterkopf unterstützt.",
    spiderExtraUnsupported: "Extra wird nur am Spinnenkörper (Teil 01) unterstützt.",
    importTextureFailed: "Textur konnte nicht importiert werden.",
    noVisibleLayers: "Keine sichtbaren Icon-Ebenen zum Exportieren vorhanden.",
    noVisibleLayersDetail:
      "Weise vor dem Herunterladen mindestens ein Frame zu (zum Beispiel „Primär“).",
    stageUnavailable: "Auf die Icon-Bühne konnte für den Export nicht zugegriffen werden.",
    stageUnavailableDetail:
      "Die Referenz auf das Bühnenelement war beim Vorbereiten des Downloads null.",
    noRenderedLayers: "Keine gerenderten Icon-Ebenen zum Exportieren vorhanden.",
    noRenderedLayersDetail:
      "Die DOM-Begrenzungen der Ebenen waren beim Vorbereiten des Icon-PNGs leer.",
    exportPngFailed: "Icon-PNG konnte nicht exportiert werden.",
    cause: "Ursache: {{cause}}",
  },
} as const;

export default errors;
