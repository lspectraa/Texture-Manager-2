import type { AppLocaleResources } from "../../types";

const iconEditor: AppLocaleResources["iconEditor"] = {
  roles: {
    glow: "Brillo",
    secondary: "Secundario",
    primary: "Primario",
    extra: "Extra",
    capsule: "Cápsula",
  },
  robotParts: {
    head: "Cabeza",
    body: "Cuerpo",
    leg: "Pierna",
    foot: "Pie",
  },
  spiderParts: {
    body: "Cuerpo",
    frontLegs: "Patas delanteras",
    backLegs: "Patas traseras",
    back: "Parte posterior",
  },
  toolbar: {
    reloadTooltip: "Volver a cargar el gamesheet actual desde el disco",
    reloadAria: "Volver a cargar la hoja",
    openTooltip: "Abrir hoja plist",
    openAria: "Abrir hoja",
    renameTooltip: "Cambiar el nombre de los archivos plist y atlas",
    renameAria: "Cambiar el nombre de la hoja",
    saveCopyTooltip:
      "Guardar una copia con el nombre nuevo y la configuración actual",
    saveCopyAria: "Guardar copia",
    downloadTooltip: "Descargar la vista previa del icono actual como PNG",
    downloadAria: "Descargar PNG",
    download: "Descargar PNG",
    undo: "Deshacer",
    undoTooltip: "Deshacer",
    undoShortcut: "Ctrl+Z",
    redo: "Rehacer",
    redoTooltip: "Rehacer",
    redoShortcut: "Ctrl+Shift+Z",
    saveShortcut: "Ctrl+S",
    zoomOut: "Alejar",
    zoomIn: "Acercar",
    resetZoom: "Restablecer zoom",
    resetZoomTooltip:
      "Restablecer el zoom al valor predeterminado de visualización ({{percent}}% con esta altura de ventana)",
    hideGlow: "Ocultar brillo",
    hideGlowTooltip:
      "Ocultar las capas de brillo en la vista previa del icono",
    hideBorder: "Ocultar borde",
    hideBorderTooltip:
      "Ocultar los bordes de selección de las capas del icono",
  },
  saveStatus: {
    save: "Guardar",
    saved: "Guardado",
    unsaved: "Sin guardar",
    saving: "Guardando…",
    saveOffsets: "Guardar cambios de desplazamiento del plist",
    savingChanges: "Guardando cambios en el plist…",
    saveUnsaved: "Guardar cambios sin guardar",
    allSaved: "Todos los cambios están guardados",
  },
  viewport: {
    panAndZoomHelp:
      "Desplázate para mover la vista. Usa Ctrl+rueda para acercar o alejar. Arrastra con el botón central para mover la vista.",
  },
  frames: {
    panelAria: "Asignación de roles de fotogramas",
    title: "Fotogramas",
    subtitle: "Asigna fotogramas a las capas",
    layerFrame: "Fotograma de la capa",
    none: "Ninguno",
    importAria: "Importar fotograma {{role}}",
    clearExtraTooltip: "Borrar la asignación del fotograma extra",
    expandPanelAria: "Expandir el panel de fotogramas",
    collapsePanelAria: "Contraer el panel de fotogramas",
    showPanel: "Mostrar fotogramas",
    hidePanel: "Ocultar fotogramas",
    visualSelectorAria: "Selector visual de fotogramas",
  },
  plist: {
    panelAria: "Propiedades plist del fotograma",
    title: "Plist",
    subtitle: "Propiedades y desplazamientos del fotograma",
    expandPanelAria: "Expandir el panel plist",
    collapsePanelAria: "Contraer el panel plist",
    showPanel: "Mostrar plist",
    hidePanel: "Ocultar plist",
    roleTabsAria: "Rol del plist",
    noFrameSelected: "Ningún fotograma seleccionado",
    noFrameSelectedHint:
      "Elige un fotograma para este rol y consulta los valores del plist.",
    frameUnavailable: "Datos del fotograma no disponibles",
    frameUnavailableHint:
      "No se pudieron cargar los datos del plist de {{frameName}}.",
    activeFrame: "Fotograma activo",
    rotateCounterClockwiseAria:
      "Girar el sprite 90 grados en sentido antihorario",
    rotateCounterClockwiseTooltip: "Girar 90° en sentido antihorario",
    rotateClockwiseAria: "Girar el sprite 90 grados en sentido horario",
    rotateClockwiseTooltip: "Girar 90° en sentido horario",
    trimInsets: "Márgenes de recorte",
    left: "Izquierda",
    top: "Superior",
    right: "Derecha",
    bottom: "Inferior",
    spriteOffset: "Desplazamiento del sprite",
    decreaseOffsetByOne:
      "Reducir en 1 el desplazamiento {{axis}} del sprite",
    decreaseOffsetByHalf:
      "Reducir en 0.5 el desplazamiento {{axis}} del sprite",
    offsetAxis: "Desplazamiento {{axis}} del sprite",
    increaseOffsetByHalf:
      "Aumentar en 0.5 el desplazamiento {{axis}} del sprite",
    increaseOffsetByOne:
      "Aumentar en 1 el desplazamiento {{axis}} del sprite",
    mergedOffset: "Desplazamiento combinado",
    mergedOffsetTooltip:
      "Desplazamiento tras combinar cuando el desplazamiento previo es {0,0}",
    plistOffset: "Desplazamiento del plist",
    atlas: "Atlas",
    spriteSize: "spriteSize",
    spriteSourceSize: "spriteSourceSize",
    textureRect: "textureRect",
  },
  dialogs: {
    selectPlistSheet: "Seleccionar hoja plist",
    selectReplacementTexture: "Seleccionar textura de reemplazo para {{role}}",
    saveIconPng: "Guardar PNG del icono",
    renameConflictAria: "Conflicto al cambiar el nombre",
    nameAlreadyInUse: "El nombre ya está en uso",
    renameConflictDescription:
      "{{targetName}} ya existe. Intercambia los nombres para que la hoja actual se convierta en {{targetName}} y la hoja existente se convierta en {{currentName}}, o cancela el cambio de nombre.",
    swapNames: "Intercambiar nombres",
    errorDetailsAria: "Detalles del error del editor de iconos",
    errorDetailsTitle: "Detalles del error",
    openErrorDetails: "Abrir información detallada del error",
  },
};

export default iconEditor;
