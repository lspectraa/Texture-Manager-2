import type { AppLocaleResources } from "../../types";

const navigation: AppLocaleResources["navigation"] = {
  applicationAria: "Навигация по приложению",
  title: "Навигация",
  expandPanelAria: "Развернуть панель навигации",
  collapsePanelAria: "Свернуть панель навигации",
  showPanel: "Показать навигацию",
  hidePanel: "Скрыть навигацию",
  home: "Главная",
  homeHint: "Панель запуска",
  settings: "Настройки",
  copyrightAria: "Авторские права и сведения о программе",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "Скоро",
  comingSoonTitle: "{{tool}} — скоро",
  homeScreen: {
    eyebrow: "Центр работы с текстурами",
    title: "Над чем вы хотите поработать?",
    lead:
      "Выберите инструмент ниже, чтобы открыть его рабочую область. Инструменты сгруппированы по назначению, чтобы вы могли сразу перейти к нужной задаче.",
    toolsReady: "инструментов готово",
    toolsAvailableAria: "Доступно инструментов: {{count}}",
    comingSoonCount: "+{{count}} скоро",
    cardComingSoon: "Скоро",
  },
  sections: {
    design: {
      title: "Дизайн и эффекты",
      subtitle: "Работа с иконками и эффектами",
    },
    sheets: {
      title: "Обработка атласов",
      subtitle: "Разделение, объединение и изменение размера атласов",
    },
    batch: {
      title: "Пакетные инструменты",
      subtitle: "Массовые изменения текстур-паков",
    },
  },
  tools: {
    iconEditor: {
      label: "Редактор иконок",
      description: "Редактируйте иконки и сразу просматривайте изменения.",
    },
    glowMaker: {
      label: "Создание свечения",
      description: "Добавляйте эффекты свечения вокруг иконок.",
    },
    geodeButtons: {
      label: "Создание кнопок Geode",
      shortLabel: "Кнопки Geode",
      description: "Создавайте кнопки в стиле Geode из своих изображений.",
    },
    trailEditor: {
      label: "Редактор следа",
      description: "Создавайте и редактируйте эффекты следа игрока.",
    },
    splitter: {
      label: "Разделитель",
      description: "Разделяйте атласы текстур на отдельные файлы.",
    },
    merger: {
      label: "Объединитель",
      description: "Объединяйте отдельные файлы обратно в атласы текстур.",
    },
    porter: {
      label: "Конвертер размера",
      description: "Изменяйте размер атласов текстур для разных разрешений.",
    },
    randomizer: {
      label: "Рандомизатор",
      description: "Перемешивайте иконки с помощью повторно используемого сида.",
    },
    convertToNewVersion: {
      label: "Конвертация в новую версию",
      shortLabel: "Новая версия",
      description: "Обновляйте атласы для новейшей версии игры.",
    },
    texturePackInstaller: {
      label: "Установщик текстур-паков",
      shortLabel: "Установщик паков",
      description: "Устанавливайте текстур-паки в папку игры.",
    },
  },
};

export default navigation;
