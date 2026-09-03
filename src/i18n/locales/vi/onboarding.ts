import type { AppLocaleResources } from "../../types";

const onboarding: AppLocaleResources["onboarding"] = {
  steps: {
    language: "Chọn ngôn ngữ",
    theme: "Chọn giao diện",
    geometryDash: "Xác nhận Geometry Dash",
    androidStorage: "Cho phép truy cập bộ nhớ",
  },
  languageAria: "Ngôn ngữ",
  languageHint: "Bạn có thể đổi sau trong Cài đặt.",
  progressAria: "Tiến trình thiết lập",
  stepAria: "Bước {{number}}: {{id}}",
  pickYourStyle: "Chọn giao diện",
  androidStorage: {
    hint:
      "Texture Manager cần quyền Truy cập tất cả tệp để đọc thư mục game của Geode trên bộ nhớ trong.",
    looksGood: "Quyền bộ nhớ ổn — có thể đọc tệp Geode.",
    skipWarning:
      "Bạn có thể hoàn tất thiết lập ngay và cấp quyền sau trong Cài đặt hoặc khi một công cụ cần tệp Geode.",
  },
  gd: {
    notFound: "Không tìm thấy",
    manualOverride: "Ghi đè thủ công",
    autoDetected: "Tự phát hiện",
    overrideActive: "Đang ghi đè",
    noInstallYet: "Chưa tìm thấy bản cài",
    installLocation: "Vị trí cài đặt",
    applyPath: "Áp dụng đường dẫn",
    redetect: "Phát hiện lại",
    notFoundWarning:
      "Không tìm thấy Geometry Dash. Bạn có thể hoàn tất thiết lập ngay và đặt đường dẫn sau trong Cài đặt.",
    looksGood: "Ổn rồi — các công cụ sẽ dùng thư mục này cho tệp game.",
  },
};

export default onboarding;
