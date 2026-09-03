import type { AppLocaleResources } from "../../types";

const errors: AppLocaleResources["errors"] = {
  defaults: {
    loadFailed: "Không tải được mặc định giai đoạn từ backend.",
    unexpectedLoadFailure: "Lỗi không mong muốn khi tải mặc định.",
  },
  runtime: {
    folderPickerUnavailable: "Trình chọn thư mục có sẵn trong runtime Tauri.",
    filePickerUnavailable: "Trình chọn tệp chỉ có trong runtime Tauri.",
    importFailed: "Không nhập được các tệp đã chọn vào ứng dụng.",
    upscalerAndroidUnavailable: "Phóng nét không khả dụng trên Android.",
  },
  validation: {
    splitterPathsRequired: "Tách sheet cần cả thư mục đầu vào và đầu ra.",
    porterPathsRequired: "Chuyển độ họa cần cả thư mục đầu vào và đầu ra.",
    upscalerPathsRequired: "Phóng nét cần cả thư mục đầu vào và đầu ra.",
    upscalerVersionRequired:
      "Phóng nét kèm chuyển bản mới nhất cần phiên bản game trước đó.",
    mergerPathsRequired: "Gộp sheet cần cả thư mục đầu vào và đầu ra.",
    glowMakerPathsRequired: "Tạo glow cần cả thư mục đầu vào và đầu ra.",
    convertPathsRequired:
      "Chuyển sang phiên bản mới cần cả thư mục đầu vào và đầu ra.",
    convertVersionRequired: "Chuyển sang phiên bản mới cần phiên bản game trước đó.",
    randomizerPathsRequired: "Xáo trộn cần cả thư mục đầu vào và đầu ra.",
    geodeButtonsPathsRequired: "Tạo nút Geode cần cả thư mục đầu vào và đầu ra.",
    operationRequestMissing: "Chưa tạo yêu cầu thao tác.",
  },
  operation: {
    cancelled: "Đã hủy thao tác.",
    backendExecutionFailed: "Không thực thi được thao tác qua backend. {{error}}",
  },
  geodeButtons: {
    gameFilesNotFound:
      "Không tìm được tệp game geode.loader. Đặt TM_GEOMETRY_DASH_DIR hoặc cài Geometry Dash + Geode qua Steam.",
    gameFilesNotFoundMobile:
      "Không tìm được geode.loader trong Android/media/com.geode.launcher/game/geode. Cấp quyền truy cập tất cả tệp, rồi quay lại màn hình này.",
    resolveDefaultInputFailed: "Không xác định được đầu vào mặc định.",
    blankSheetNotFound:
      "Không tự tìm được BlankSheet trong geode.loader (hoặc thư mục đầu vào đã chọn).",
    autoSelectPlistFailed: "Không tự chọn được plist.",
    readTargetFramesFailed: "Không đọc được khung đích.",
    imageLoadFailed: "không tải được ảnh",
  },
  packInstaller: {
    geometryDashRequired:
      "Không tìm thấy đường dẫn Geometry Dash. Đặt trong Cài đặt (hoặc cài GD + Geode qua Steam) trước khi cài pack.",
    geodeRequiredMobile:
      "Không tìm thấy thư mục Geode trên bộ nhớ trong của máy. Cài Geometry Dash với Geode Launcher, rồi quay lại màn hình này.",
    geodeCheckingAccess: "Đang kiểm tra quyền bộ nhớ…",
    geodeInternalStorageHint:
      "Đang tìm trên bộ nhớ trong tại {{path}}. Quyền truy cập tất cả tệp nằm trong Cài đặt Android → Quyền ứng dụng đặc biệt (không phải danh sách quyền ứng dụng thông thường).",
    allFilesAccessRequired:
      "Android chặn đọc bộ nhớ trong. Nhấn Cấp quyền truy cập tất cả tệp (Quyền ứng dụng đặc biệt), cho phép Texture Manager 2, rồi quay lại đây.",
    grantAllFilesAccess: "Cấp quyền truy cập tất cả tệp",
    allFilesAccessRequestFailed: "Không mở được trang cài đặt quyền truy cập tất cả tệp của Android.",
    runtimeUnavailable: "Cài pack chỉ có trong ứng dụng máy tính.",
    discoverFailed: "Không phát hiện được đơn vị cài từ nguồn đã chọn.",
    installFailed: "Không cài được các đơn vị pack đã chọn.",
    createFailed: "Không tạo được thư mục texture pack.",
    openFolderFailed: "Không mở được thư mục pack.",
    noUnitsSelected: "Chọn ít nhất một đơn vị cài.",
    convertVersionRequired:
      "Chọn phiên bản game trước đó của pack khi bật Chuyển sang phiên bản mới nhất.",
    folderNameRequired: "Nhập tên thư mục cho pack mới.",
    invalidDropPng: "Thả tệp .png cho pack.png, hoặc chuyển sang chế độ Cài để dùng thư mục/zip.",
    invalidDropCreate:
      "Thả thư mục pack hoặc tệp .png cho pack.png (dùng chế độ Cài cho kho lưu zip).",
    listFailed: "Không liệt kê được pack đã cài.",
    saveMetadataFailed: "Không lưu được metadata pack.",
    appliedLoadFailed: "Không tải được thứ tự pack đang áp dụng.",
    appliedSaveFailed: "Không lưu được thứ tự pack đang áp dụng.",
    operationFailed: "Không chạy được thao tác pack.",
    noLibraryPackSelected: "Hãy chọn một pack từ thư viện trước.",
    openPacksFolderFailed: "Không mở được thư mục packs.",
    deleteFailed: "Không xóa được pack.",
    splitOutputRequired: "Chọn thư mục đầu ra trước khi tách pack.",
    metadataInvalid: "pack.json thiếu trường bắt buộc (textureldr, name, id, version, author).",
    metadataNoPackJson: "Pack này không có tệp pack.json.",
  },
  iconEditor: {
    decodeFrameFailed: "Không giải mã được ảnh khung đã trích.",
    allocateCanvasFailed: "Không cấp phát được canvas cho khung đã trích.",
    loadSheetFailed: "Không tải được sheet icon.",
    runtimeUnavailable: "Trình chỉnh sửa icon chỉ có trong runtime Tauri.",
    savePlistFailed: "Không lưu được thay đổi plist.",
    renameSheetFailed: "Không đổi tên được tệp sheet.",
    swapNamesFailed: "Không hoán đổi được tên sheet.",
    saveCopyFailed: "Không lưu được bản sao sheet.",
    textureImportUnavailable: "Nhập texture chỉ có trong runtime Tauri.",
    inferStemFailed:
      "Không suy ra được stem icon từ plist. Cần tên khung dạng {type}_{number}_001, {type}_{number}_2_001, {type}_{number}_3_001, {type}_{number}_glow_001, hoặc {type}_{number}_extra_001.",
    robotExtraUnsupported: "Extra chỉ hỗ trợ trên đầu robot.",
    spiderExtraUnsupported: "Extra chỉ hỗ trợ trên thân nhện (phần 01).",
    importTextureFailed: "Không nhập được texture.",
    noVisibleLayers: "Không có lớp icon hiện để xuất.",
    noVisibleLayersDetail: "Gán ít nhất một khung (ví dụ primary) trước khi tải xuống.",
    stageUnavailable: "Không truy cập được sân khấu icon để xuất.",
    stageUnavailableDetail: "Tham chiếu phần tử sân khấu là null khi chuẩn bị tải xuống.",
    noRenderedLayers: "Không có lớp icon đã vẽ để xuất.",
    noRenderedLayersDetail: "Kích thước DOM của lớp trống khi chuẩn bị PNG icon.",
    exportPngFailed: "Không xuất được PNG icon.",
    cause: "Nguyên nhân: {{cause}}",
  },
};

export default errors;
