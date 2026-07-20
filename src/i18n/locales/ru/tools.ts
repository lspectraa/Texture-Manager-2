import type { AppLocaleResources } from "../../types";

const tools: AppLocaleResources["tools"] = {
  common: {
    sourceAndOutput: "Источник и результат",
    sourceAndOutputDescription:
      "Выберите, откуда операция будет читать данные и куда записывать результаты",
    inputDirectory: "Входная папка",
    outputDirectory: "Выходная папка",
    outputMirroringNote:
      "Результаты сохраняются отдельно, если только вы не выберете входную папку при пустом поле выходного пути.",
    runOperation: "Запустить операцию",
    running: "Выполняется…",
    range1To64: "1–64",
  },
  splitter: {
    performance: "Производительность",
    performanceDescription:
      "Укажите, сколько атласов будет обрабатываться параллельно",
    concurrentGamesheets: "Одновременно обрабатываемых атласов",
  },
  porter: {
    settings: "Настройки переноса",
    settingsDescription:
      "Выберите целевое разрешение и пределы параллельной обработки",
    lowGraphics: "Перенести в низкое разрешение",
    concurrentGamesheetsAndTextures:
      "Одновременно обрабатываемых атласов и текстур",
  },
  merger: {
    options: "Параметры объединения",
    optionsDescription:
      "Настройте поведение и производительность объединения",
    includeOutsidePlist:
      "Включать файлы вне plist (флаг совместимости с фазой 2)",
    concurrentFolders: "Одновременно объединяемых папок",
  },
  randomizer: {
    section: "Рандомизация",
    sectionDescription:
      "Используйте фиксированный сид, чтобы позже повторить то же перемешивание",
    seed: "Сид",
    seedPlaceholder: "Оставьте пустым для случайного сида",
  },
  convertToNewVersion: {
    versionTarget: "Целевая версия",
    versionTargetDescription:
      "Выберите целевую версию игры и количество параллельных операций",
    previousGameVersion: "Предыдущая версия игры",
    concurrentGamesheets: "Одновременно обрабатываемых атласов",
  },
  glowMaker: {
    parameters: "Параметры свечения",
    parametersDescription:
      "Настройте толщину контура и пороговые значения альфа-фильтрации",
    thickness: "Толщина свечения",
    thicknessRange: "1–128",
    outlineAlphaMinimum: "Минимальная альфа контура",
    alphaRange: "0–255",
    generationMode: "Режим создания",
    generationModeDescription:
      "Выберите способ наложения и поведение цветового спектра",
    compositeLayers:
      "Объединять слои иконки перед созданием свечения (основной + дополнительный + extra)",
    rainbowGlow:
      "Радужное свечение (расширенный спектр, голубой → фиолетовый → красно-фиолетовый)",
    preview: "Предпросмотр",
    previewDescription:
      "Живой предпросмотр со случайной UHD-иконкой из игры — обновляется при изменении настроек",
    previewAlt: "Образец предпросмотра создания свечения",
    previewLoading: "Создание предпросмотра…",
    previewError: "Предпросмотр недоступен",
    refreshPreview: "Новая случайная иконка",
  },
  geodeButtons: {
    sourceDescription:
      "По умолчанию BlankSheet загружается из Steam geode/resources/geode.loader; выберите файл, чтобы использовать другой атлас",
    inputGamesheet: "Входной атлас",
    customPlist: "Пользовательский plist",
    cachedBlankSheet: "Кэшированный BlankSheet",
    resolvingBlankSheet: "Поиск BlankSheet…",
    buttonFamilies: "Семейства кнопок",
    buttonFamiliesDescription:
      "Выберите семейство для просмотра шаблонов и настройки смещений HSV",
    groups: {
      menus: "Меню",
      circle: "Круглые",
      editorBase: "Основные редактора",
      account: "Учётная запись",
    },
    variants: {
      primary: "Основной",
      secondary: "Дополнительный",
      darkAqua: "Тёмно-бирюзовый",
      darkPurple: "Тёмно-фиолетовый",
      gray: "Серый",
      error: "Ошибка",
      info: "Информация",
      pink: "Розовый",
    },
    noPreview: "Предпросмотр недоступен",
    frames_one: "{{count}} кадр",
    frames_other: "{{count}} кадров",
    templateSet: "набор шаблонов",
    usingDefault: "используется значение по умолчанию",
    loadingTargets: "Загрузка целей…",
    waitingForGamesheet: "Ожидание загрузки атласа для предпросмотра.",
    adjust: "Настроить",
    adjustSubtitle: "{{family}} • Вариант {{variant}}",
    noFamilySelected: "Семейство не выбрано",
    notAvailable: "Н/Д",
    templatePng: "Шаблон PNG",
    perFamily: "Для каждого семейства",
    selectTemplatePng: "Выбрать шаблон PNG",
    selectTemplatePngDialog: "Выберите шаблон PNG",
    selectInputGamesheetDialog: "Выберите plist входного атласа",
    hsvDelta: "HSV (смещение)",
    hueDegrees: "Тон (град.)",
    saturation: "Насыщенность",
    value: "Яркость",
    hsvHelp:
      "Эти смещения применяются при повторном создании кадров, цветовой суффикс которых соответствует выбранному варианту. Дважды щёлкните ползунок, чтобы сбросить его.",
    previewAlt: "Предпросмотр {{family}}",
  },
};

export default tools;
