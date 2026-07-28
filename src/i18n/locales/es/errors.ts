import type { AppLocaleResources } from "../../types";

const errors: AppLocaleResources["errors"] = {
  defaults: {
    loadFailed:
      "No se pudieron cargar los valores predeterminados de la fase desde el backend.",
    unexpectedLoadFailure:
      "Ocurrió un error inesperado al cargar los valores predeterminados.",
  },
  runtime: {
    folderPickerUnavailable:
      "El selector de carpetas está disponible en el entorno de ejecución de Tauri.",
    filePickerUnavailable:
      "El selector de archivos solo está disponible en el entorno de ejecución de Tauri.",
  },
  validation: {
    splitterPathsRequired:
      "El Divisor requiere los directorios de entrada y salida.",
    porterPathsRequired:
      "El Adaptador requiere los directorios de entrada y salida.",
    mergerPathsRequired:
      "El Combinador requiere los directorios de entrada y salida.",
    glowMakerPathsRequired:
      "El Creador de brillo requiere los directorios de entrada y salida.",
    convertPathsRequired:
      "Convertir a una versión nueva requiere los directorios de entrada y salida.",
    convertVersionRequired:
      "Convertir a una versión nueva requiere una versión anterior del juego.",
    randomizerPathsRequired:
      "El Aleatorizador requiere los directorios de entrada y salida.",
    geodeButtonsPathsRequired:
      "Crear botones de Geode requiere los directorios de entrada y salida.",
    operationRequestMissing: "No se creó ninguna solicitud de operación.",
  },
  operation: {
    cancelled: "Operación cancelada.",
    backendExecutionFailed:
      "No se pudo ejecutar la operación mediante el backend. {{error}}",
  },
  geodeButtons: {
    gameFilesNotFound:
      "No se pudieron resolver los archivos de juego de geode.loader. Establece TM_GEOMETRY_DASH_DIR o instala Geometry Dash + Geode mediante Steam.",
    resolveDefaultInputFailed:
      "No se pudo resolver la entrada predeterminada.",
    blankSheetNotFound:
      "No se pudo encontrar BlankSheet automáticamente en geode.loader (ni en el directorio de entrada seleccionado).",
    autoSelectPlistFailed: "No se pudo seleccionar el plist automáticamente.",
    readTargetFramesFailed:
      "No se pudieron leer los fotogramas de destino.",
    imageLoadFailed: "no se pudo cargar la imagen",
  },
  iconEditor: {
    decodeFrameFailed:
      "No se pudo decodificar la imagen del fotograma extraído.",
    allocateCanvasFailed:
      "No se pudo asignar el lienzo para el fotograma extraído.",
    loadSheetFailed: "No se pudo cargar la hoja de iconos.",
    runtimeUnavailable:
      "El editor de iconos solo está disponible en el entorno de ejecución de Tauri.",
    savePlistFailed: "No se pudieron guardar los cambios del plist.",
    renameSheetFailed:
      "No se pudo cambiar el nombre de los archivos de la hoja.",
    swapNamesFailed: "No se pudieron intercambiar los nombres de las hojas.",
    saveCopyFailed: "No se pudo guardar la copia de la hoja.",
    textureImportUnavailable:
      "La importación de texturas solo está disponible en el entorno de ejecución de Tauri.",
    inferStemFailed:
      "No se pudo deducir la raíz del icono a partir del plist. Se esperaban nombres de fotogramas como {type}_{number}_001, {type}_{number}_2_001, {type}_{number}_3_001, {type}_{number}_glow_001 o {type}_{number}_extra_001.",
    robotExtraUnsupported:
      "Extra solo es compatible con la cabeza del robot.",
    spiderExtraUnsupported:
      "Extra solo es compatible con el cuerpo de la araña (parte 01).",
    importTextureFailed: "No se pudo importar la textura.",
    noVisibleLayers:
      "No hay capas visibles del icono disponibles para exportar.",
    noVisibleLayersDetail:
      "Asigna al menos un fotograma (por ejemplo, primario) antes de descargar.",
    stageUnavailable:
      "No se pudo acceder al escenario del icono para exportarlo.",
    stageUnavailableDetail:
      "La referencia del elemento del escenario era nula al preparar la descarga.",
    noRenderedLayers:
      "No hay capas renderizadas del icono disponibles para exportar.",
    noRenderedLayersDetail:
      "Los límites DOM de la capa estaban vacíos al preparar el PNG del icono.",
    exportPngFailed: "No se pudo exportar el PNG del icono.",
    cause: "Causa: {{cause}}",
  },
};

export default errors;
