import type { AppLocaleResources } from "../../types";

const errors: AppLocaleResources["errors"] = {
  defaults: {
    loadFailed: "Не удалось загрузить стандартные параметры фазы из бэкенда.",
    unexpectedLoadFailure:
      "Непредвиденная ошибка при загрузке параметров по умолчанию.",
  },
  runtime: {
    folderPickerUnavailable:
      "Выбор папки доступен в среде выполнения Tauri.",
    filePickerUnavailable:
      "Выбор файла доступен только в среде выполнения Tauri.",
  },
  validation: {
    splitterPathsRequired:
      "Для разделения необходимо указать входную и выходную папки.",
    porterPathsRequired:
      "Для переноса необходимо указать входную и выходную папки.",
    mergerPathsRequired:
      "Для объединения необходимо указать входную и выходную папки.",
    glowMakerPathsRequired:
      "Для создания свечения необходимо указать входную и выходную папки.",
    convertPathsRequired:
      "Для конвертации в новую версию необходимо указать входную и выходную папки.",
    convertVersionRequired:
      "Для конвертации в новую версию необходимо указать предыдущую версию игры.",
    randomizerPathsRequired:
      "Для рандомизации необходимо указать входную и выходную папки.",
    geodeButtonsPathsRequired:
      "Для создания кнопок Geode необходимо указать входную и выходную папки.",
    operationRequestMissing: "Запрос на выполнение операции не был создан.",
  },
  operation: {
    cancelled: "Операция отменена.",
    backendExecutionFailed:
      "Не удалось выполнить операцию через бэкенд. {{error}}",
  },
  geodeButtons: {
    gameFilesNotFound:
      "Не удалось найти игровые файлы geode.loader. Задайте TM_GEOMETRY_DASH_DIR или установите Geometry Dash и Geode через Steam.",
    resolveDefaultInputFailed:
      "Не удалось определить источник по умолчанию.",
    blankSheetNotFound:
      "Не удалось автоматически найти BlankSheet в geode.loader (или в выбранной входной папке).",
    autoSelectPlistFailed: "Не удалось автоматически выбрать plist.",
    readTargetFramesFailed: "Не удалось прочитать целевые кадры.",
    imageLoadFailed: "не удалось загрузить изображение",
  },
  packInstaller: {
    geometryDashRequired:
      "Путь к Geometry Dash не найден. Укажите его в Настройках (или установите GD + Geode через Steam) перед установкой паков.",
    runtimeUnavailable: "Pack Installer is available only in the desktop app.",
    discoverFailed: "Failed to discover install units from the selected source.",
    installFailed: "Failed to install the selected pack units.",
    createFailed: "Failed to create the texture pack folder.",
    openFolderFailed: "Failed to open the pack folder.",
    noUnitsSelected: "Select at least one install unit.",
    convertVersionRequired: "Choose the pack's previous game version when Convert to Latest Version is enabled.",
    folderNameRequired: "Enter a folder name for the new pack.",
    invalidDropPng: "Drop a .png file for pack.png, or switch to Install mode for folders/zips.",
    invalidDropCreate:
      "Drop a pack folder or a .png for pack.png (use Install mode for zip archives).",
    listFailed: "Failed to list installed packs.",
    saveMetadataFailed: "Failed to save pack metadata.",
    operationFailed: "Failed to run the pack operation.",
    noLibraryPackSelected: "Select a pack from the library first.",
    openPacksFolderFailed: "Failed to open the packs folder.",
    deleteFailed: "Failed to delete the pack.",
    splitOutputRequired: "Choose an output folder before splitting the pack.",
  },
  iconEditor: {
    decodeFrameFailed:
      "Не удалось декодировать изображение извлечённого кадра.",
    allocateCanvasFailed:
      "Не удалось выделить холст для извлечённого кадра.",
    loadSheetFailed: "Не удалось загрузить атлас иконок.",
    runtimeUnavailable:
      "Редактор иконок доступен только в среде выполнения Tauri.",
    savePlistFailed: "Не удалось сохранить изменения plist.",
    renameSheetFailed: "Не удалось переименовать файлы атласа.",
    swapNamesFailed: "Не удалось поменять имена атласов.",
    saveCopyFailed: "Не удалось сохранить копию атласа.",
    textureImportUnavailable:
      "Импорт текстур доступен только в среде выполнения Tauri.",
    inferStemFailed:
      "Не удалось определить основу имени иконки из plist. Ожидались имена кадров вида {type}_{number}_001, {type}_{number}_2_001, {type}_{number}_3_001, {type}_{number}_glow_001 или {type}_{number}_extra_001.",
    robotExtraUnsupported:
      "Дополнительный слой поддерживается только для головы робота.",
    spiderExtraUnsupported:
      "Дополнительный слой поддерживается только для корпуса паука (часть 01).",
    importTextureFailed: "Не удалось импортировать текстуру.",
    noVisibleLayers:
      "Нет видимых слоёв иконки, доступных для экспорта.",
    noVisibleLayersDetail:
      "Перед скачиванием назначьте хотя бы один кадр (например, основной).",
    stageUnavailable:
      "Не удалось получить доступ к сцене иконки для экспорта.",
    stageUnavailableDetail:
      "При подготовке скачивания ссылка на элемент сцены имела значение null.",
    noRenderedLayers:
      "Нет отрисованных слоёв иконки, доступных для экспорта.",
    noRenderedLayersDetail:
      "При подготовке PNG иконки границы DOM слоёв оказались пустыми.",
    exportPngFailed: "Не удалось экспортировать PNG иконки.",
    cause: "Причина: {{cause}}",
  },
};

export default errors;
