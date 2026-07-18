import type { AppLocaleResources } from "../../types";

const navigation: AppLocaleResources["navigation"] = {
  applicationAria: "Navegación de la aplicación",
  title: "Navegación",
  expandPanelAria: "Expandir el panel de navegación",
  collapsePanelAria: "Contraer el panel de navegación",
  showPanel: "Mostrar navegación",
  hidePanel: "Ocultar navegación",
  home: "Inicio",
  homeHint: "Lanzador",
  settings: "Configuración",
  copyrightAria: "Derechos de autor y acerca de",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "Pronto",
  comingSoonTitle: "{{tool}} — próximamente",
  homeScreen: {
    eyebrow: "Centro de flujos de trabajo de texturas",
    title: "¿En qué te gustaría trabajar?",
    lead:
      "Elige una herramienta para abrir su espacio de trabajo. Las herramientas están agrupadas por flujo de trabajo para que puedas ir directamente a la tarea que necesitas.",
    toolsReady: "herramientas listas",
    toolsAvailableAria: "{{count}} herramientas disponibles",
    comingSoonCount: "+{{count}} próximamente",
    cardComingSoon: "Próximamente",
  },
  sections: {
    design: {
      title: "Diseño y efectos",
      subtitle: "Trabaja con iconos y efectos",
    },
    sheets: {
      title: "Flujo de gamesheets",
      subtitle: "Divide, combina y redimensiona gamesheets",
    },
    batch: {
      title: "Utilidades por lotes",
      subtitle: "Cambios masivos en paquetes de texturas",
    },
  },
  tools: {
    iconEditor: {
      label: "Editor de iconos",
      description: "Edita iconos y ve los cambios en tiempo real.",
    },
    glowMaker: {
      label: "Creador de brillo",
      description: "Agrega efectos de brillo alrededor de tus iconos.",
    },
    geodeButtons: {
      label: "Crear botones de Geode",
      shortLabel: "Botones de Geode",
      description: "Crea botones con estilo Geode a partir de tus imágenes.",
    },
    trailEditor: {
      label: "Editor de estelas",
      description: "Crea y edita efectos de estela del jugador.",
    },
    splitter: {
      label: "Divisor",
      description: "Divide las hojas de texturas en archivos separados.",
    },
    merger: {
      label: "Combinador",
      description: "Vuelve a combinar archivos separados en hojas de texturas.",
    },
    porter: {
      label: "Adaptador",
      description: "Redimensiona hojas de texturas para distintos tamaños.",
    },
    randomizer: {
      label: "Aleatorizador",
      description: "Mezcla iconos con una semilla que puedes reutilizar.",
    },
    convertToNewVersion: {
      label: "Convertir a una versión nueva",
      shortLabel: "Versión nueva",
      description: "Actualiza las hojas para la versión más reciente del juego.",
    },
    texturePackInstaller: {
      label: "Instalador de paquetes de texturas",
      shortLabel: "Instalador de paquetes",
      description: "Instala paquetes de texturas en la carpeta del juego.",
    },
  },
};

export default navigation;
