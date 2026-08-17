import type { AppLocaleResources } from "../../types";

const common: AppLocaleResources["common"] = {
  browse: "Обзор",
  cancel: "Отмена",
  close: "Закрыть",
  remove: "Удалить",
  download: "Скачать",
  copied: "Скопировано",
  save: "Сохранить",
  saved: "Сохранено",
  unsaved: "Не сохранено",
  saving: "Сохранение…",
  rename: "Переименовать",
  saveCopy: "Сохранить копию",
  none: "Нет",
  optional: "Необязательно",
  selectFile: "Выбрать файл",
  selectFolder: "Выбрать папку",
  light: "Светлая",
  dark: "Тёмная",
  back: "Назад",
  next: "Далее",
  finish: "Завершить",
  available: "Доступно",
  comingSoon: "Скоро",
  productName: "Texture Manager 2",
  about: {
    title: "О программе",
    closeAria: "Закрыть окно «О программе»",
    copyright: "© {{year}} {{holder}}.",
    description:
      "Программа для текстур-паков Geometry Dash — редактируйте иконки, разделяйте и собирайте листы и не только.",
    licenseHeading: "Лицензия",
    licenseName: "GNU GPLv3 (или более поздняя)",
    licenseSummary:
      "Свободное ПО: вы можете распространять и изменять его на условиях GNU General Public License. Гарантии отсутствуют.",
    licenseLink: "Посмотреть полную лицензию",
    licenseHint: "Открывает LICENSE на GitHub",
    thirdPartyHeading: "Сторонние апскейлеры",
    thirdPartyName: "Waifu2x, Real-ESRGAN, ncnn",
    thirdPartySummary:
      "В программе есть дополнительные инструменты увеличения. У них свои лицензии, а полные уведомления идут вместе с приложением.",
    thirdPartyWaifu2x:
      "Waifu2x CUNet — MIT. Оригинал: nagadomi; порт ncnn-Vulkan: nihui.",
    thirdPartyRealesrgan:
      "Real-ESRGAN AnimeVideo v3 — BSD-3-Clause (Xintao Wang). Порт ncnn-Vulkan — MIT (Xintao Wang / nihui).",
    thirdPartyNcnn: "ncnn — BSD-3-Clause. Copyright (C) 2017 Tencent.",
    thirdPartyLink: "Показать уведомления третьих сторон",
    thirdPartyHint: "Открывает NOTICE на GitHub",
    version: "Версия",
    github: "Проект на GitHub",
    githubHint: "Исходный код и сообщения об ошибках",
    youtube: "Канал YouTube",
    youtubeHint: "Текстур-паки и руководства",
    discord: "Сервер Discord",
    discordHint: "Сообщество и поддержка",
  },
  translationQuality: {
    bannerTitle: "Перевод может содержать неточности",
    bannerBody:
      "Этот язык был переведён с помощью автоматических средств. Если вы заметили ошибку, сообщите о ней, чтобы мы могли улучшить перевод.",
    settingsHint:
      "Перевод может содержать неточности — сообщайте об ошибках.",
    reportAction: "Сообщить о проблеме с переводом",
  },
};

export default common;
