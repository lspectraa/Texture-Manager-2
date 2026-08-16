import type { AppLocaleResources } from "../../types";

const common: AppLocaleResources["common"] = {
  browse: "Examinar",
  cancel: "Cancelar",
  close: "Cerrar",
  remove: "Eliminar",
  download: "Descargar",
  copied: "Copiado",
  save: "Guardar",
  saved: "Guardado",
  unsaved: "Sin guardar",
  saving: "Guardando…",
  rename: "Cambiar nombre",
  saveCopy: "Guardar copia",
  none: "Ninguno",
  optional: "Opcional",
  selectFile: "Seleccionar archivo",
  selectFolder: "Seleccionar carpeta",
  light: "Claro",
  dark: "Oscuro",
  back: "Atrás",
  next: "Siguiente",
  finish: "Finalizar",
  available: "Disponible",
  comingSoon: "Próximamente",
  productName: "Texture Manager 2",
  about: {
    title: "Acerca de",
    closeAria: "Cerrar el cuadro de diálogo Acerca de",
    copyright: "© {{year}} {{holder}}.",
    description:
      "Creado para flujos de trabajo de texturas de Geometry Dash: divide, combina, adapta y edita gamesheets con un conjunto de herramientas de escritorio especializado.",
    licenseHeading: "Licencia",
    licenseName: "GNU GPLv3 (o posterior)",
    licenseSummary:
      "Software libre: puedes redistribuirlo y modificarlo bajo la Licencia Pública General de GNU. No hay garantía.",
    licenseLink: "Ver licencia completa",
    licenseHint: "Abre LICENSE en GitHub",
    thirdPartyHeading: "Escaladores de terceros",
    thirdPartyName: "Waifu2x, Real-ESRGAN, ncnn",
    thirdPartySummary:
      "Esta aplicación incluye binarios de inferencia y pesos de modelos. Conservan sus licencias MIT y BSD-3-Clause; los avisos completos se entregan con la aplicación.",
    thirdPartyWaifu2x:
      "Waifu2x CUNet — MIT. Original de nagadomi; puerto ncnn-Vulkan de nihui.",
    thirdPartyRealesrgan:
      "Real-ESRGAN AnimeVideo v3 — BSD-3-Clause (Xintao Wang). Puerto ncnn-Vulkan — MIT (Xintao Wang / nihui).",
    thirdPartyNcnn: "ncnn — BSD-3-Clause. Copyright (C) 2017 Tencent.",
    thirdPartyLink: "Ver avisos de terceros",
    thirdPartyHint: "Abre NOTICE en GitHub",
    version: "Versión",
    github: "Proyecto en GitHub",
    githubHint: "Código fuente e incidencias",
    youtube: "Canal de YouTube",
    youtubeHint: "Paquetes de texturas y tutoriales",
    discord: "Servidor de Discord",
    discordHint: "Comunidad y soporte",
  },
  translationQuality: {
    bannerTitle: "Las traducciones pueden contener errores",
    bannerBody:
      "Este idioma se tradujo con ayuda automatizada. Si encuentras un error, repórtalo para que podamos mejorar.",
    settingsHint:
      "Las traducciones pueden contener errores; repórtalos, por favor.",
    reportAction: "Reportar un problema de traducción",
  },
};

export default common;
