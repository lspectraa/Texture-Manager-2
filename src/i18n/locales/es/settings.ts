import type { AppLocaleResources } from "../../types";

const settings: AppLocaleResources["settings"] = {
  title: "Configuración",
  description: "Cambia el aspecto de la app, encuentra Geometry Dash y define los ajustes de las herramientas.",
  statusAria: "Estado de la configuración",
  themeChip: "Tema {{theme}}",
  concurrentChip: "{{count}} simultáneos",
  gdChip: "GD {{status}}",
  appearance: {
    title: "Apariencia",
    subtitle:
      "Elige una apariencia; este mismo selector se usará durante la configuración inicial",
  },
  theme: "Tema",
  language: {
    title: "Idioma",
    subtitle: "Idioma de la app",
    label: "Idioma",
    aria: "Idioma",
  },
  background: {
    label: "Fondo de la aplicación",
    aria: "Fondo de la aplicación",
    random: "Aleatorio",
    defaultMeta: "Predeterminado",
    opacity: "Opacidad del fondo",
    noneFound: "Aún no hay fondos del juego. Elige tu carpeta de Geometry Dash para cargarlos.",
    custom: {
      label: "Fondos personalizados",
      aria: "Fondos personalizados de la aplicación",
      add: "Añadir imagen",
      addTitle: "Elige una imagen de fondo",
      imageFilter: "Imágenes",
      empty: "Añade tus propias imágenes. Se guardan aquí en escala de grises.",
      removeAria: "Eliminar {{name}}",
    },
  },
  performance: {
    title: "Rendimiento",
    subtitle: "Cuántas hojas trabajan las herramientas a la vez",
    concurrentGamesheets: "Hojas a la vez",
    rangeHint: "1–64",
  },
  cache: {
    title: "Caché y datos",
    subtitle: "Dónde se guardan los archivos del juego en caché",
    gameFilesRoot: "Carpeta de archivos del juego",
    splitCache: "Caché de división",
    openCacheFolder: "Abrir carpeta de caché",
    regenerateSpriteIndex: "Regenerar índice de sprites",
    regenerateSpriteIndexHint:
      "Reconstruye la lista de hojas que ya indexaste. No recorre toda la carpeta del juego.",
    resetDefaults: "Restablecer valores predeterminados",
  },
  geometryDash: {
    title: "Geometry Dash",
    subtitle: "La carpeta de Geometry Dash usada para archivos del juego y Geode",
    notFound: "No encontrado",
    manualOverride: "Configuración manual",
    autoDetected: "Detectado automáticamente",
    overrideActive: "Configuración manual activa",
    detectedPathAvailable: "Ruta detectada disponible",
    noAutoDetect: "Sin resultado de detección automática",
    installLocation: "Ubicación de instalación",
    browseHint:
      "Busca la carpeta de Geometry Dash o instálalo mediante Steam y vuelve a detectarlo.",
    applyPath: "Aplicar ruta",
    clearOverride: "Borrar configuración manual",
    redetect: "Volver a detectar",
  },
  updates: {
    title: "Actualizaciones",
    subtitle: "Comprueba si hay una versión más reciente",
    checkForUpdates: "Buscar actualizaciones",
    checking: "Buscando…",
    upToDate: "Tienes la versión más reciente (v{{version}}).",
    available: "La versión {{version}} está disponible (tienes la v{{current}}).",
    unsupported:
      "La comprobación de actualizaciones requiere la aplicación de escritorio instalada.",
    checkFailed: "No se pudieron buscar actualizaciones. {{error}}",
    installBlocked:
      "Termina la operación actual antes de instalar una actualización.",
    installing: "Descargando e instalando…",
    downloading: "Descargando actualización… {{percent}}%",
    installAndRestart: "Instalar y reiniciar",
    availableTitle: "Actualización disponible",
    availableMeta: "Instala y reinicia para pasar de v{{current}} a v{{version}}.",
    waitForOperation: "Termina la operación actual antes de instalar.",
    later: "Más tarde",
    dismiss: "Descartar actualización",
  },
  saveFailed: "No se pudo guardar la preferencia de idioma. {{error}}",
};

export default settings;
