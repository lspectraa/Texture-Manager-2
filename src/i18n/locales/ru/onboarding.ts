import type { AppLocaleResources } from "../../types";

const onboarding: AppLocaleResources["onboarding"] = {
  steps: {
    language: "Выберите язык",
    theme: "Выберите оформление",
    geometryDash: "Подтвердите расположение Geometry Dash",
  },
  languageAria: "Язык",
  languageHint: "По мере добавления переводов здесь будут появляться новые языки.",
  progressAria: "Ход настройки",
  stepAria: "Шаг {{number}}: {{id}}",
  pickYourStyle: "Выберите оформление",
  gd: {
    notFound: "Не найдено",
    manualOverride: "Указано вручную",
    autoDetected: "Обнаружено автоматически",
    overrideActive: "Используется путь, указанный вручную",
    noInstallYet: "Установка пока не найдена",
    installLocation: "Расположение установки",
    applyPath: "Применить путь",
    redetect: "Найти снова",
    notFoundWarning:
      "Geometry Dash не найдена. Вы можете завершить настройку сейчас и указать путь установки позже в настройках.",
    looksGood:
      "Всё в порядке — этот путь будет использоваться для игровых файлов и инструментов.",
  },
};

export default onboarding;
