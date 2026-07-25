import type { AppLocaleResources } from "../../types";

const settings: AppLocaleResources["settings"] = {
  title: "Configuración",
  description:
    "Preferencias globales de apariencia, detección de instalaciones y valores predeterminados de las herramientas.",
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
    subtitle: "Elige el idioma que se usará en toda la aplicación",
    label: "Idioma",
    aria: "Idioma",
  },
  background: {
    label: "Fondo de la aplicación",
    aria: "Fondo de la aplicación",
    random: "Aleatorio",
    defaultMeta: "Predeterminado",
    opacity: "Opacidad del fondo",
    noneFound:
      "Aún no se encontraron imágenes game_bg_* de Geometry Dash; establece una ruta de instalación de GD válida para detectarlas.",
    custom: {
      label: "Fondos personalizados",
      aria: "Fondos personalizados de la aplicación",
      add: "Añadir imagen",
      addTitle: "Elige una imagen de fondo",
      imageFilter: "Imágenes",
      empty:
        "Añade tus propias imágenes: se convierten a escala de grises y se guardan en caché localmente.",
      removeAria: "Eliminar {{name}}",
    },
  },
  performance: {
    title: "Rendimiento",
    subtitle:
      "Cantidad predeterminada de gamesheets simultáneos para las herramientas",
    concurrentGamesheets: "Gamesheets simultáneos predeterminados",
    rangeHint: "1–64",
  },
  cache: {
    title: "Caché y datos",
    subtitle: "Raíz local de archivos del juego y caché de división",
    gameFilesRoot: "Raíz de archivos del juego",
    splitCache: "Caché de división",
    openCacheFolder: "Abrir carpeta de caché",
    resetDefaults: "Restablecer valores predeterminados",
  },
  geometryDash: {
    title: "Geometry Dash",
    subtitle:
      "Instalación de Steam usada para las rutas de Resources original y Geode",
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
    subtitle:
      "Busca en GitHub Releases una versión más reciente de Texture Manager 2",
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
    availableTitle: "La actualización {{version}} está disponible",
    availableMeta: "Tienes la v{{current}}. El reinicio instalará la actualización.",
    waitForOperation: "Termina la operación actual antes de instalar.",
    later: "Más tarde",
    dismiss: "Descartar actualización",
  },
  saveFailed: "No se pudo guardar la preferencia de idioma. {{error}}",
};

export default settings;
