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
