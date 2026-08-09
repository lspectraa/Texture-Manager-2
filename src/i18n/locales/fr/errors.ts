const errors = {
  defaults: {
    loadFailed: "Impossible de charger les valeurs par défaut depuis le backend.",
    unexpectedLoadFailure: "Erreur inattendue lors du chargement des valeurs par défaut.",
  },
  runtime: {
    folderPickerUnavailable: "Le sélecteur de dossier est disponible dans le runtime Tauri.",
    filePickerUnavailable:
      "Le sélecteur de fichier est disponible uniquement dans le runtime Tauri.",
  },
  validation: {
    splitterPathsRequired: "Le Découpeur nécessite un dossier d’entrée et un dossier de sortie.",
    porterPathsRequired: "Le Portage nécessite un dossier d’entrée et un dossier de sortie.",
    mergerPathsRequired: "Le Fusionneur nécessite un dossier d’entrée et un dossier de sortie.",
    glowMakerPathsRequired:
      "Le Créateur de glow nécessite un dossier d’entrée et un dossier de sortie.",
    convertPathsRequired:
      "« Convertir vers une nouvelle version » nécessite un dossier d’entrée et un dossier de sortie.",
    convertVersionRequired:
      "« Convertir vers une nouvelle version » nécessite une version précédente du jeu.",
    randomizerPathsRequired:
      "Le Randomiseur nécessite un dossier d’entrée et un dossier de sortie.",
    geodeButtonsPathsRequired:
      "« Créer des boutons Geode » nécessite un dossier d’entrée et un dossier de sortie.",
    operationRequestMissing: "Aucune requête d’opération n’a été construite.",
  },
  operation: {
    cancelled: "Opération annulée.",
    backendExecutionFailed: "Échec de l’exécution de l’opération via le backend. {{error}}",
  },
  geodeButtons: {
    gameFilesNotFound:
      "Impossible de résoudre les fichiers de geode.loader. Définissez TM_GEOMETRY_DASH_DIR ou installez Geometry Dash + Geode via Steam.",
    resolveDefaultInputFailed: "Impossible de résoudre l’entrée par défaut.",
    blankSheetNotFound:
      "Impossible de trouver automatiquement BlankSheet dans geode.loader (ni dans le dossier d’entrée sélectionné).",
    autoSelectPlistFailed: "Impossible de sélectionner automatiquement le plist.",
    readTargetFramesFailed: "Impossible de lire les frames cibles.",
    imageLoadFailed: "échec du chargement de l’image",
  },
  packInstaller: {
    geometryDashRequired:
      "Chemin Geometry Dash introuvable. Définissez-le dans Réglages (ou installez GD + Geode via Steam) avant d'installer des packs.",
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
    decodeFrameFailed: "Impossible de décoder l’image du frame extrait.",
    allocateCanvasFailed: "Impossible d’allouer le canvas pour le frame extrait.",
    loadSheetFailed: "Impossible de charger la sheet d’icônes.",
    runtimeUnavailable: "L’éditeur d’icônes est disponible uniquement dans le runtime Tauri.",
    savePlistFailed: "Impossible d’enregistrer les modifications du plist.",
    renameSheetFailed: "Impossible de renommer les fichiers de la sheet.",
    swapNamesFailed: "Impossible d’échanger les noms des sheets.",
    saveCopyFailed: "Impossible d’enregistrer la copie de la sheet.",
    textureImportUnavailable:
      "L’import de textures est disponible uniquement dans le runtime Tauri.",
    inferStemFailed:
      "Impossible de déduire la racine de l’icône depuis le plist. Noms de frame attendus : {type}_{number}_001, {type}_{number}_2_001, {type}_{number}_3_001, {type}_{number}_glow_001 ou {type}_{number}_extra_001.",
    robotExtraUnsupported: "Extra n’est pris en charge que sur la tête du robot.",
    spiderExtraUnsupported: "Extra n’est pris en charge que sur le corps de l’araignée (partie 01).",
    importTextureFailed: "Impossible d’importer la texture.",
    noVisibleLayers: "Aucune couche d’icône visible à exporter.",
    noVisibleLayersDetail:
      "Attribuez au moins un frame (par exemple, primaire) avant de télécharger.",
    stageUnavailable: "Impossible d’accéder à la scène de l’icône pour l’export.",
    stageUnavailableDetail:
      "La référence de l’élément de scène était nulle lors de la préparation du téléchargement.",
    noRenderedLayers: "Aucune couche d’icône rendue à exporter.",
    noRenderedLayersDetail:
      "Les limites DOM des couches étaient vides lors de la préparation du PNG.",
    exportPngFailed: "Impossible d’exporter le PNG de l’icône.",
    cause: "Cause : {{cause}}",
  },
} as const;

export default errors;
