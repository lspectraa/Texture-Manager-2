import type { AppLocaleResources } from "../../types";

const navigation: AppLocaleResources["navigation"] = {
  applicationAria: "Điều hướng ứng dụng",
  title: "Điều hướng",
  expandPanelAria: "Mở rộng bảng điều hướng",
  collapsePanelAria: "Thu gọn bảng điều hướng",
  showPanel: "Hiện điều hướng",
  hidePanel: "Ẩn điều hướng",
  home: "Trang chủ",
  homeHint: "Tất cả công cụ",
  settings: "Cài đặt",
  copyrightAria: "Bản quyền và giới thiệu",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "Sắp có",
  comingSoonTitle: "{{tool}} — sắp ra mắt",
  homeScreen: {
    eyebrow: "Công cụ texture",
    title: "Bạn muốn làm gì?",
    splash: {
      general: [
        "Bạn muốn làm gì?",
        "Chọn một công cụ và bắt đầu.",
        "Sheet, icon, glow — tiếp theo là gì?",
        "Pack khác, ngày khác.",
        "Làm cho mọi thứ trông đẹp hơn nào.",
        "Sẵn sàng rồi — chọn một công cụ.",
        "Icon, hạt, hay cả gamesheet?",
        "Sửa nhẹ hay cả pack?",
        "Phòng lab texture đã mở.",
        "Hôm nay mình đánh bóng gì?",
        "Tách, gộp, glow — tùy bạn.",
        "Đến lúc đụng vào vài pixel.",
      ],
      morning: [
        "Chào buổi sáng. Làm gì trước?",
        "Khởi đầu mới — công cụ nào?",
        "Cà phê sẵn rồi. Mình sửa gì?",
        "Buổi sáng chỉnh một pack?",
      ],
      afternoon: [
        "Phiên buổi chiều. Mình làm gì?",
        "Giữa ngày — công cụ nào?",
        "Sửa nhanh hay làm sâu?",
      ],
      evening: [
        "Buổi tối trong studio. Danh sách có gì?",
        "Thêm một sheet nữa trước khi xong?",
        "Thư giãn với một việc texture nhỏ?",
        "Giờ vàng để chỉnh glow.",
      ],
      night: [
        "Chạy texture khuya?",
        "Icon có thể đợi… hoặc không.",
        "Giờ yên tĩnh, hạt thì ồn ào.",
        "Xuất thêm lần nữa trước khi ngủ?",
      ],
      monday: [
        "Thứ Hai. Khởi động nhẹ với một chỉnh nhỏ.",
        "Tuần mới — bắt đầu với một sprite?",
      ],
      friday: [
        "Thứ Sáu. Xong một pack trước cuối tuần?",
        "Nước rút — xuất sheet đó?",
      ],
      weekend: [
        "Cuối tuần làm project.",
        "Không vội — chọn thứ vui vẻ.",
        "Năng lượng side project — hôm nay làm gì?",
        "Phẫu thuật sheet thứ Bảy?",
      ],
    },
    lead: "Chọn một công cụ để bắt đầu. Chúng được nhóm theo việc bạn muốn làm.",
    toolsReady: "công cụ sẵn sàng",
    toolsAvailableAria: "{{count}} công cụ có sẵn",
    comingSoonCount: "+{{count}} sắp ra mắt",
    cardComingSoon: "Sắp ra mắt",
    aboutTitle: "Giới thiệu",
    aboutSubtitle: "Bản quyền, giấy phép và liên kết",
    aboutCardLabel: "Bản quyền & giới thiệu",
    openPacksFolder: "Mở thư mục packs",
    openGameFiles: "Mở tệp game",
    openSaveFolder: "Mở thư mục save",
    utilitiesAria: "Phím tắt thư mục nhanh",
    openPacksFolderFailed: "Không mở được thư mục packs. Geometry Dash đã được cài chưa?",
    openGameFilesFailed: "Không mở được thư mục game. Geometry Dash đã được cài chưa?",
    openSaveFolderFailed: "Không mở được thư mục save.",
  },
  sections: {
    design: {
      title: "Thiết kế & hiệu ứng",
      subtitle: "Icon, glow, nút và hạt",
    },
    sheets: {
      title: "Gamesheet",
      subtitle: "Tách, gộp, đổi kích thước và làm nét sheet",
    },
    batch: {
      title: "Công cụ pack",
      subtitle: "Thay đổi nhiều tệp cùng lúc",
    },
  },
  tools: {
    iconEditor: {
      label: "Chỉnh sửa icon",
      description: "Đổi bộ phận, màu sắc và vị trí của icon.",
    },
    glowMaker: {
      label: "Tạo glow",
      description: "Thêm glow quanh icon của bạn.",
    },
    geodeButtons: {
      label: "Tạo nút Geode",
      shortLabel: "Nút Geode",
      description: "Tạo gamesheet nút menu Geode",
    },
    particleEditor: {
      label: "Chỉnh sửa hạt",
      description: "Tạo và tinh chỉnh hiệu ứng hạt.",
    },
    splitter: {
      label: "Tách sheet",
      description: "Cắt gamesheet thành từng sprite.",
    },
    merger: {
      label: "Gộp sheet",
      description: "Ghép sprite lại thành gamesheet.",
    },
    porter: {
      label: "Chuyển độ họa",
      description: "Tạo bản HD, UHD hoặc chất lượng thấp của một sheet.",
    },
    upscaler: {
      label: "Phóng nét",
      description: "Làm sprite sắc nét và lớn hơn. Bạn cũng có thể cập nhật chúng cho game mới nhất.",
    },
    randomizer: {
      label: "Xáo trộn",
      description: "Xáo icon. Lưu mã nếu muốn dùng lại cùng một mix.",
    },
    convertToNewVersion: {
      label: "Chuyển sang phiên bản mới",
      shortLabel: "Phiên bản mới",
      description: "Thêm sprite còn thiếu để pack chạy trên game mới nhất.",
    },
    texturePackInstaller: {
      label: "Cài texture pack",
      shortLabel: "Cài pack",
      description: "Thêm texture pack vào Geometry Dash.",
    },
  },
  mobile: {
    sectionShortcutAria: "{{section}}, mở công cụ đầu tiên",
    expandAllToolsAria: "Hiện tất cả công cụ",
    closeGridAria: "Đóng công cụ",
    allToolsTitle: "Tất cả công cụ",
    backAria: "Quay lại",
    closeDrawerAria: "Đóng bảng bên",
    showDrawerAria: "{{panel}}: hiện",
    hideDrawerAria: "{{panel}}: ẩn",
    editorSurfacesAria: "Giao diện trình chỉnh sửa",
    geodeBackToFamilies: "Quay lại nhóm",
  },
};

export default navigation;
