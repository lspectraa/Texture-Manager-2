import type { AppLocaleResources } from "../../types";

const tools: AppLocaleResources["tools"] = {
  common: {
    sourceAndOutput: "Origen y salida",
    sourceAndOutputDescription:
      "Elige de dónde leerá la operación y dónde guardará los resultados",
    inputDirectory: "Directorio de entrada",
    outputDirectory: "Directorio de salida",
    outputMirroringNote:
      "La salida permanece separada, a menos que selecciones la entrada mientras la ruta de salida esté vacía.",
    runOperation: "Ejecutar operación",
    running: "Ejecutando…",
    range1To64: "1–64",
  },
  splitter: {
    performance: "Rendimiento",
    performanceDescription:
      "Controla cuántos gamesheets se procesan en paralelo",
    concurrentGamesheets: "Gamesheets simultáneos",
  },
  porter: {
    settings: "Configuración de adaptación",
    settingsDescription:
      "Elige el nivel de salida y los límites de procesamiento en paralelo",
    lowGraphics: "Adaptar a gráficos bajos",
    concurrentGamesheetsAndTextures:
      "Gamesheets y texturas simultáneos",
  },
  merger: {
    options: "Opciones de combinación",
    optionsDescription:
      "Ajusta el comportamiento y el rendimiento de la combinación",
    includeOutsidePlist:
      "Incluir archivos fuera del plist (opción compatible con la fase 2)",
    concurrentFolders: "Carpetas de combinación simultáneas",
  },
  randomizer: {
    section: "Aleatorización",
    sectionDescription:
      "Usa una semilla fija para reproducir la misma mezcla más adelante",
    seed: "Semilla",
    seedPlaceholder: "Déjalo en blanco para usar una semilla aleatoria",
  },
  convertToNewVersion: {
    versionTarget: "Versión de destino",
    versionTargetDescription:
      "Elige la versión de destino del juego y la cantidad de procesos simultáneos",
    previousGameVersion: "Versión anterior del juego",
    concurrentGamesheets: "Gamesheets simultáneos",
  },
  glowMaker: {
    parameters: "Parámetros de brillo",
    parametersDescription:
      "Ajusta el grosor del trazo y los umbrales de filtrado alfa",
    thickness: "Grosor del brillo",
    thicknessRange: "1–128",
    outlineAlphaMinimum: "Alfa mínimo del contorno",
    alphaRange: "0–255",
    generationMode: "Modo de generación",
    generationModeDescription:
      "Elige el comportamiento de composición y del espectro de color",
    compositeLayers:
      "Combinar las capas del icono antes del brillo (primaria + secundaria + extra)",
    rainbowGlow:
      "Brillo arcoíris (espectro extendido, cian → morado → violeta rojizo)",
    preview: "Vista previa",
    previewDescription:
      "Vista previa en vivo con un icono UHD aleatorio de tu juego — se actualiza al cambiar los ajustes",
    previewAlt: "Vista previa de muestra del creador de brillo",
    previewLoading: "Generando vista previa…",
    previewError: "Vista previa no disponible",
    refreshPreview: "Nuevo icono aleatorio",
  },
  geodeButtons: {
    sourceDescription:
      "BlankSheet se carga de Steam geode/resources/geode.loader de forma predeterminada; examina para usar un gamesheet personalizado",
    inputGamesheet: "Gamesheet de entrada",
    customPlist: "Plist personalizado",
    cachedBlankSheet: "BlankSheet en caché",
    resolvingBlankSheet: "Resolviendo BlankSheet…",
    buttonFamilies: "Familias de botones",
    buttonFamiliesDescription:
      "Selecciona una familia para previsualizar plantillas y ajustar los deltas HSV",
    groups: {
      menus: "Menús",
      circle: "Círculo",
      editorBase: "Base del editor",
      account: "Cuenta",
    },
    variants: {
      primary: "Primario",
      secondary: "Secundario",
      darkAqua: "Aguamarina oscuro",
      darkPurple: "Morado oscuro",
      gray: "Gris",
      error: "Error",
      info: "Información",
      pink: "Rosa",
    },
    noPreview: "Sin vista previa",
    frames_one: "{{count}} fotograma",
    frames_other: "{{count}} fotogramas",
    templateSet: "conjunto de plantillas",
    usingDefault: "usando el valor predeterminado",
    loadingTargets: "Cargando objetivos…",
    waitingForGamesheet:
      "Esperando a que se cargue el gamesheet para mostrar las vistas previas.",
    adjust: "Ajustar",
    adjustSubtitle: "{{family}} • Variante {{variant}}",
    noFamilySelected: "Ninguna familia seleccionada",
    notAvailable: "N/D",
    templatePng: "PNG de plantilla",
    perFamily: "Por familia",
    selectTemplatePng: "Seleccionar PNG de plantilla",
    selectTemplatePngDialog: "Seleccionar PNG de plantilla",
    selectInputGamesheetDialog: "Seleccionar plist del gamesheet de entrada",
    hsvDelta: "HSV (delta)",
    hueDegrees: "Tono (grados)",
    saturation: "Saturación",
    value: "Valor",
    hsvHelp:
      "Estos deltas se aplican al regenerar fotogramas cuyo sufijo de color corresponde a la variante seleccionada. Haz doble clic en un control deslizante para restablecerlo.",
    previewAlt: "Vista previa de {{family}}",
  },
};

export default tools;
