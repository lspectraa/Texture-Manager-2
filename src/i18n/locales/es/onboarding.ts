import type { AppLocaleResources } from "../../types";

const onboarding: AppLocaleResources["onboarding"] = {
  steps: {
    language: "Elige tu idioma",
    theme: "Elige tu estilo",
    geometryDash: "Confirma Geometry Dash",
    androidStorage: "Allow storage access",
  },
  languageAria: "Idioma",
  languageHint:
    "Aparecerán más idiomas aquí a medida que se agreguen traducciones.",
  progressAria: "Progreso de la configuración",
  stepAria: "Paso {{number}}: {{id}}",
  pickYourStyle: "Elige tu estilo",
  androidStorage: {
    hint:
      "Texture Manager needs All files access to read Geode’s game folder on internal storage.",
    looksGood: "Storage access looks good — Geode files can be read.",
    skipWarning:
      "You can finish setup now and grant access later from Settings or when a tool needs Geode files.",
    permissionGranted: "Acceso a todos los archivos concedido.",
    skipFinish: "Finalizar sin acceso al almacenamiento",
    recheck: "Comprobar de nuevo",
  },
  gd: {
    notFound: "No encontrado",
    manualOverride: "Configuración manual",
    autoDetected: "Detectado automáticamente",
    overrideActive: "Configuración manual activa",
    noInstallYet: "Aún no se encontró una instalación",
    installLocation: "Ubicación de instalación",
    applyPath: "Aplicar ruta",
    redetect: "Volver a detectar",
    notFoundWarning:
      "No se encontró Geometry Dash. Puedes finalizar la configuración ahora y establecer la ruta de instalación más tarde en Configuración.",
    looksGood:
      "Todo está listo: esta ruta se usará para los archivos y las herramientas del juego.",
  },
};

export default onboarding;
