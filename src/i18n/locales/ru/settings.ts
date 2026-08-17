import type { AppLocaleResources } from "../../types";

const settings: AppLocaleResources["settings"] = {
  title: "Настройки",
  description: "Измените вид программы, найдите Geometry Dash и задайте настройки инструментов.",
  statusAria: "Состояние настроек",
  themeChip: "Тема: {{theme}}",
  concurrentChip: "Параллельно: {{count}}",
  gdChip: "GD: {{status}}",
  appearance: {
    title: "Внешний вид",
    subtitle:
      "Выберите оформление — этот же выбор будет доступен при первом запуске",
  },
  theme: "Тема",
  language: {
    title: "Язык",
    subtitle: "Выберите язык интерфейса приложения",
    label: "Язык",
    aria: "Язык",
  },
  background: {
    label: "Фон приложения",
    aria: "Фон приложения",
    random: "Случайный",
    defaultMeta: "По умолчанию",
    opacity: "Прозрачность фона",
    noneFound:
      "Изображения Geometry Dash game_bg_* пока не найдены — укажите правильный путь установки GD, чтобы обнаружить их.",
    custom: {
      label: "Свои фоны",
      aria: "Пользовательские фоны приложения",
      add: "Добавить изображение",
      addTitle: "Выберите фоновое изображение",
      imageFilter: "Изображения",
      empty:
        "Добавьте свои изображения — они переводятся в оттенки серого и кэшируются локально.",
      removeAria: "Удалить {{name}}",
    },
  },
  performance: {
    title: "Производительность",
    subtitle:
      "Количество атласов, обрабатываемых инструментами одновременно по умолчанию",
    concurrentGamesheets: "Одновременно обрабатываемых атласов",
    rangeHint: "1–64",
  },
  cache: {
    title: "Кэш и данные",
    subtitle: "Корневая папка игровых файлов и кэш разделения",
    gameFilesRoot: "Корневая папка игровых файлов",
    splitCache: "Кэш разделения",
    openCacheFolder: "Открыть папку кэша",
    regenerateSpriteIndex: "Пересоздать индекс спрайтов",
    regenerateSpriteIndexHint:
      "Обновляет только листы из sprite-index.json (без полного сканирования Resources).",
    resetDefaults: "Сбросить настройки",
  },
  geometryDash: {
    title: "Geometry Dash",
    subtitle:
      "Установка Steam, используемая для стандартных Resources и путей Geode",
    notFound: "Не найдено",
    manualOverride: "Указано вручную",
    autoDetected: "Обнаружено автоматически",
    overrideActive: "Используется путь, указанный вручную",
    detectedPathAvailable: "Обнаруженный путь доступен",
    noAutoDetect: "Автоматический поиск не дал результатов",
    installLocation: "Расположение установки",
    browseHint:
      "Выберите папку Geometry Dash либо установите игру через Steam и повторите поиск.",
    applyPath: "Применить путь",
    clearOverride: "Сбросить указанный путь",
    redetect: "Найти снова",
  },
  updates: {
    title: "Обновления",
    subtitle:
      "Проверка GitHub Releases на наличие версию Texture Manager 2",
    checkForUpdates: "Проверить обновления",
    checking: "Проверка…",
    upToDate: "У вас установлена последняя версия (v{{version}}).",
    available: "Доступна версия {{version}} (у вас v{{current}}).",
    unsupported:
      "Проверка обновлений доступна только в установленном приложении.",
    checkFailed: "Не удалось проверить обновления. {{error}}",
    installBlocked:
      "Дождитесь завершения текущей операции перед установкой обновления.",
    installing: "Загрузка и установка…",
    downloading: "Загрузка обновления… {{percent}}%",
    installAndRestart: "Установить и перезапустить",
    availableTitle: "Доступно обновление",
    availableMeta:
      "Установите и перезапустите, чтобы перейти с v{{current}} на v{{version}}.",
    waitForOperation:
      "Дождитесь завершения текущей операции перед установкой.",
    later: "Позже",
    dismiss: "Скрыть обновление",
  },
  saveFailed: "Не удалось сохранить языковые настройки. {{error}}",
};

export default settings;
