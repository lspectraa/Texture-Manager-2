import type { AppLocaleResources } from "../../types";

const navigation: AppLocaleResources["navigation"] = {
  applicationAria: "Navegación de la aplicación",
  title: "Navegación",
  expandPanelAria: "Expandir el panel de navegación",
  collapsePanelAria: "Contraer el panel de navegación",
  showPanel: "Mostrar navegación",
  hidePanel: "Ocultar navegación",
  home: "Inicio",
  homeHint: "Todas las herramientas",
  settings: "Configuración",
  copyrightAria: "Derechos de autor y acerca de",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "Pronto",
  comingSoonTitle: "{{tool}} — próximamente",
  homeScreen: {
    eyebrow: "Herramientas de texturas",
    title: "¿En qué te gustaría trabajar?",
    splash: {
      general: [
        "¿En qué te gustaría trabajar?",
        "Elige una herramienta y empieza.",
        "Hojas, iconos, brillo — ¿qué sigue?",
        "Otro pack, otro día.",
        "Vamos a dejar algo bonito.",
      ],
      morning: ["Buenos días. ¿Qué va primero?", "Empezamos — ¿qué herramienta?"],
      afternoon: ["Sesión de tarde. ¿Qué estamos haciendo?"],
      evening: ["Tarde de estudio. ¿Qué hay en la lista?", "¿Una hoja más antes de terminar?"],
      night: ["¿Sesión nocturna de texturas?", "Los iconos pueden esperar… o no."],
      monday: ["Lunes. Empieza con un cambio pequeño."],
      friday: ["Viernes. ¿Un pack más antes del fin de semana?"],
      weekend: ["Proyecto de fin de semana.", "Sin prisa — elige algo divertido."],
    },
    lead: "Elige una herramienta para empezar. Están agrupadas por lo que quieres hacer.",
    toolsReady: "herramientas listas",
    toolsAvailableAria: "{{count}} herramientas disponibles",
    comingSoonCount: "+{{count}} próximamente",
    cardComingSoon: "Próximamente",
    aboutTitle: "Acerca de",
    aboutSubtitle: "Copyright, licencia y enlaces",
    aboutCardLabel: "Copyright y acerca de",
    openPacksFolder: "Abrir carpeta de packs",
    openGameFiles: "Abrir archivos del juego",
    openSaveFolder: "Abrir carpeta de guardado",
    utilitiesAria: "Accesos rápidos a carpetas",
    openPacksFolderFailed: "No se pudo abrir la carpeta de packs. ¿Está instalado Geometry Dash?",
    openGameFilesFailed: "No se pudo abrir la carpeta del juego. ¿Está instalado Geometry Dash?",
    openSaveFolderFailed: "No se pudo abrir la carpeta de guardado.",
  },
  sections: {
    design: {
      title: "Diseño y efectos",
      subtitle: "Iconos, brillo, botones y partículas",
    },
    sheets: {
      title: "Gamesheets",
      subtitle: "Divide, combina, redimensiona y mejora las hojas",
    },
    batch: {
      title: "Herramientas de packs",
      subtitle: "Cambia muchos archivos a la vez",
    },
  },
  tools: {
    iconEditor: {
      label: "Editor de iconos",
      description: "Cambia las partes, colores y posición de un icono.",
    },
    glowMaker: {
      label: "Creador de brillo",
      description: "Añade un brillo alrededor de tus iconos.",
    },
    geodeButtons: {
      label: "Crear botones de Geode",
      shortLabel: "Botones de Geode",
      description: "Crear el gamesheet de botones de menú de Geode",
    },
    particleEditor: {
      label: "Editor de partículas",
      description: "Crea y ajusta efectos de partículas.",
    },
    splitter: {
      label: "Divisor",
      description: "Corta un gamesheet en sprites individuales.",
    },
    merger: {
      label: "Combinador",
      description: "Junta los sprites otra vez en un gamesheet.",
    },
    porter: {
      label: "Adaptador",
      description: "Crea versiones HD, UHD o de baja calidad de una hoja.",
    },
    upscaler: {
      label: "Upscaler",
      description: "Haz los sprites más nítidos y grandes. También puedes actualizarlos al juego más reciente.",
    },
    randomizer: {
      label: "Aleatorizador",
      description: "Mezcla iconos. Guarda el código si quieres la misma mezcla después.",
    },
    convertToNewVersion: {
      label: "Convertir a una versión nueva",
      shortLabel: "Versión nueva",
      description: "Añade sprites que faltan para que el pack funcione en el juego más reciente.",
    },
    texturePackInstaller: {
      label: "Instalador de paquetes de texturas",
      shortLabel: "Instalador de paquetes",
      description: "Añade paquetes de texturas a Geometry Dash.",
    },
  },
  mobile: {
    sectionShortcutAria: "{{section}}, open first tool",
    expandAllToolsAria: "Show all tools",
    closeGridAria: "Close tools",
    allToolsTitle: "All tools",
    backAria: "Back",
    closeDrawerAria: "Close side panel",
    showDrawerAria: "Show {{panel}}",
    hideDrawerAria: "Hide {{panel}}",
    editorSurfacesAria: "Editor views",
    geodeBackToFamilies: "Back to families",
  },
} as const;

export default navigation;
