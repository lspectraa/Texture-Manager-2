import type { AppLocaleResources } from "../../types";

const reports: AppLocaleResources["reports"] = {
  panelTitle: "Resultado de la ejecución",
  expandPanelAria: "Expandir el panel de resultados de la ejecución",
  collapsePanelAria: "Contraer el panel de resultados de la ejecución",
  showPanel: "Mostrar resultados de la ejecución",
  hidePanel: "Ocultar resultados de la ejecución",
  status: {
    running: "En ejecución",
    complete: "Completado",
    warnings: "Advertencias",
    runFailed: "La ejecución falló",
    errorsFound: "Se encontraron errores",
    ready: "Listo",
  },
  progress: {
    aria: "Operación en curso",
    cancelling: "Cancelando…",
    completed: "Completada",
    completedWithWarnings: "Completada con advertencias",
    completedWithErrors: "Completada con errores",
    working: "Procesando…",
    gamesheet: "Gamesheet",
    sprites_one: "{{completed}} / {{total}} sprite",
    sprites_other: "{{completed}} / {{total}} sprites",
    plists_one: "{{completed}} / {{total}} plist",
    plists_other: "{{completed}} / {{total}} plists",
    preparing: "Preparando la operación…",
    cancel: "Cancelar",
  },
  alerts: {
    defaultsLoadError: "Error al cargar los valores predeterminados",
    runError: "Error de ejecución",
  },
  empty: {
    title: "Aún no se ejecutó ninguna operación",
    hint:
      "Ejecuta una herramienta para ver aquí los resultados, los tiempos y los problemas.",
  },
  summary: {
    processed: "Procesados",
    elapsed: "Tiempo transcurrido",
    output: "Salida",
  },
  issues: {
    title: "Problemas",
    noIssues: "No se reportaron problemas",
    copyCsv: "Copiar CSV",
    copied: "Copiado",
    copyCsvTooltip: "Copiar los problemas como CSV",
    copyCsvAria: "Copiar los problemas como CSV",
    download: "Descargar",
    downloadCsvTooltip: "Descargar los problemas como CSV",
    downloadCsvAria: "Descargar los problemas como CSV",
    occurrence: "x{{count}}",
  },
  severity: {
    error: "error",
    warning: "advertencia",
  },
};

export default reports;
