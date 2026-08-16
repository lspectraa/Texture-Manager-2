import type { AppLocaleResources } from "../../types";

const reports: AppLocaleResources["reports"] = {
  panelTitle: "Результат выполнения",
  expandPanelAria: "Развернуть панель результатов выполнения",
  collapsePanelAria: "Свернуть панель результатов выполнения",
  showPanel: "Показать результаты выполнения",
  hidePanel: "Скрыть результаты выполнения",
  status: {
    running: "Выполняется",
    complete: "Завершено",
    warnings: "Предупреждения",
    runFailed: "Выполнение не удалось",
    errorsFound: "Обнаружены ошибки",
    ready: "Готово",
  },
  progress: {
    aria: "Операция выполняется",
    cancelling: "Отмена…",
    completed: "Завершено",
    completedWithWarnings: "Завершено с предупреждениями",
    completedWithErrors: "Завершено с ошибками",
    working: "Выполняется…",
    gamesheet: "Атлас",
    sprites_one: "{{completed}} / {{total}} спрайт",
    sprites_other: "{{completed}} / {{total}} спрайтов",
    plists_one: "{{completed}} / {{total}} plist",
    plists_other: "{{completed}} / {{total}} plist",
    preparing: "Подготовка операции…",
    remaining: "Ост. времени (оценка): {{time}}",
    remainingEstimating: "Ост. времени (оценка): расчёт…",
    cancel: "Отмена",
  },
  alerts: {
    defaultsLoadError: "Ошибка загрузки настроек по умолчанию",
    runError: "Ошибка выполнения",
  },
  empty: {
    title: "Операции ещё не запускались",
    hint: "Запустите инструмент, чтобы увидеть здесь результаты, время выполнения и проблемы.",
  },
  summary: {
    processed: "Обработано",
    elapsed: "Затрачено времени",
    output: "Результат",
    aiUpscaled: "ИИ апскейл",
    fromCache: "Из кэша",
  },
  issues: {
    title: "Проблемы",
    noIssues: "Проблем не обнаружено",
    copyCsv: "Копировать CSV",
    copied: "Скопировано",
    copyCsvTooltip: "Копировать проблемы в формате CSV",
    copyCsvAria: "Копировать проблемы в формате CSV",
    download: "Скачать",
    downloadCsvTooltip: "Скачать проблемы в формате CSV",
    downloadCsvAria: "Скачать проблемы в формате CSV",
    occurrence: "×{{count}}",
  },
  severity: {
    error: "ошибка",
    warning: "предупреждение",
    info: "info",
  },
};

export default reports;
