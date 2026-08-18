import type { AppLocaleResources } from "../../types";

const navigation: AppLocaleResources["navigation"] = {
  applicationAria: "Навигация по приложению",
  title: "Навигация",
  expandPanelAria: "Развернуть панель навигации",
  collapsePanelAria: "Свернуть панель навигации",
  showPanel: "Показать навигацию",
  hidePanel: "Скрыть навигацию",
  home: "Главная",
  homeHint: "Все инструменты",
  settings: "Настройки",
  copyrightAria: "Авторские права и сведения о программе",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "Скоро",
  comingSoonTitle: "{{tool}} — скоро",
  homeScreen: {
    eyebrow: "Инструменты для текстур",
    title: "Над чем вы хотите поработать?",
    splash: {
      general: [
        "Над чем вы хотите поработать?",
        "Выберите инструмент и начинайте.",
        "Листы, иконки, свечение — что дальше?",
        "Ещё один пак, ещё один день.",
        "Давайте сделаем что-то красивое.",
      ],
      morning: ["Доброе утро. С чего начнём?", "Новый день — какой инструмент?"],
      afternoon: ["Дневная сессия. Что делаем?"],
      evening: ["Вечер в студии. Что в списке?", "Ещё один лист на сегодня?"],
      night: ["Ночной забег по текстурам?", "Иконки могут подождать… или нет."],
      monday: ["Понедельник. Начните с маленькой правки."],
      friday: ["Пятница. Пак до выходных?"],
      weekend: ["Проект на выходные.", "Без спешки — выберите что-то приятное."],
    },
    lead: "Выберите инструмент, чтобы начать. Они сгруппированы по тому, что вы хотите сделать.",
    toolsReady: "инструментов готово",
    toolsAvailableAria: "Доступно инструментов: {{count}}",
    comingSoonCount: "+{{count}} скоро",
    cardComingSoon: "Скоро",
  },
  sections: {
    design: {
      title: "Дизайн и эффекты",
      subtitle: "Иконки, свечение, кнопки и частицы",
    },
    sheets: {
      title: "Gamesheets",
      subtitle: "Разделяйте, собирайте, меняйте размер и улучшайте листы",
    },
    batch: {
      title: "Инструменты для паков",
      subtitle: "Меняйте много файлов сразу",
    },
  },
  tools: {
    iconEditor: {
      label: "Редактор иконок",
      description: "Меняйте части, цвета и положение иконки.",
    },
    glowMaker: {
      label: "Создание свечения",
      description: "Добавьте свечение вокруг иконок.",
    },
    geodeButtons: {
      label: "Создание кнопок Geode",
      shortLabel: "Кнопки Geode",
      description: "Создать gamesheet кнопок меню Geode",
    },
    particleEditor: {
      label: "Редактор частиц",
      description: "Создавайте и настраивайте эффекты частиц.",
    },
    splitter: {
      label: "Разделитель",
      description: "Разрежьте gamesheet на отдельные спрайты.",
    },
    merger: {
      label: "Объединитель",
      description: "Соберите спрайты обратно в gamesheet.",
    },
    porter: {
      label: "Конвертер размера",
      description: "Сделайте HD, UHD или низкокачественную версию листа.",
    },
    upscaler: {
      label: "Upscaler",
      description: "Сделайте спрайты чётче и больше. Можно также обновить их под новую версию игры.",
    },
    randomizer: {
      label: "Рандомизатор",
      description: "Перемешайте иконки. Сохраните код, если нужна та же смесь позже.",
    },
    convertToNewVersion: {
      label: "Конвертация в новую версию",
      shortLabel: "Новая версия",
      description: "Добавьте недостающие спрайты, чтобы пак работал в новой версии игры.",
    },
    texturePackInstaller: {
      label: "Установщик текстур-паков",
      shortLabel: "Установщик паков",
      description: "Добавьте текстур-паки в Geometry Dash.",
    },
  },
};

export default navigation;
