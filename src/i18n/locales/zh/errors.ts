const errors = {
  defaults: {
    loadFailed: "无法从后端加载阶段默认值。",
    unexpectedLoadFailure: "加载默认值时出现意外错误。",
  },
  runtime: {
    folderPickerUnavailable: "文件夹选择器在 Tauri 运行时中可用。",
    filePickerUnavailable: "文件选择器仅在 Tauri 运行时中可用。",
  },
  validation: {
    splitterPathsRequired: "拆分器需要同时指定输入和输出目录。",
    porterPathsRequired: "移植器需要同时指定输入和输出目录。",
    mergerPathsRequired: "合并器需要同时指定输入和输出目录。",
    glowMakerPathsRequired: "光晕生成器需要同时指定输入和输出目录。",
    convertPathsRequired: "转换到新版本需要同时指定输入和输出目录。",
    convertVersionRequired: "转换到新版本需要指定此前的游戏版本。",
    randomizerPathsRequired: "随机器需要同时指定输入和输出目录。",
    geodeButtonsPathsRequired: "创建 Geode 按钮需要同时指定输入和输出目录。",
    operationRequestMissing: "没有构建任何操作请求。",
  },
  operation: {
    cancelled: "操作已取消。",
    backendExecutionFailed: "通过后端执行操作失败。{{error}}",
  },
  geodeButtons: {
    gameFilesNotFound:
      "无法定位 geode.loader 的游戏文件。请设置 TM_GEOMETRY_DASH_DIR，或通过 Steam 安装 Geometry Dash 与 Geode。",
    resolveDefaultInputFailed: "无法解析默认输入。",
    blankSheetNotFound:
      "无法在 geode.loader（或所选输入目录）中自动找到 BlankSheet。",
    autoSelectPlistFailed: "无法自动选择 plist。",
    readTargetFramesFailed: "无法读取目标帧。",
    imageLoadFailed: "图片加载失败",
  },
  packInstaller: {
    geometryDashRequired:
      "未找到 Geometry Dash 路径。请先在设置中指定（或通过 Steam 安装 GD + Geode）再安装材质包。",
    runtimeUnavailable: "Pack Installer is available only in the desktop app.",
    discoverFailed: "Failed to discover install units from the selected source.",
    installFailed: "Failed to install the selected pack units.",
    createFailed: "Failed to create the texture pack folder.",
    openFolderFailed: "Failed to open the pack folder.",
    noUnitsSelected: "Select at least one install unit.",
    convertVersionRequired: "Choose the pack's previous game version when Convert to Latest Version is enabled.",
    folderNameRequired: "Enter a folder name for the new pack.",
    invalidDropPng: "Drop a .png file for pack.png, or switch to Install mode for folders/zips.",
  },
  iconEditor: {
    decodeFrameFailed: "无法解码提取出的帧图像。",
    allocateCanvasFailed: "无法为提取出的帧分配画布。",
    loadSheetFailed: "无法加载图标 sheet。",
    runtimeUnavailable: "图标编辑器仅在 Tauri 运行时中可用。",
    savePlistFailed: "无法保存 plist 更改。",
    renameSheetFailed: "无法重命名 sheet 文件。",
    swapNamesFailed: "无法交换 sheet 名称。",
    saveCopyFailed: "无法保存 sheet 副本。",
    textureImportUnavailable: "贴图导入仅在 Tauri 运行时中可用。",
    inferStemFailed:
      "无法从 plist 推断图标名称前缀。期望的帧名格式为 {type}_{number}_001、{type}_{number}_2_001、{type}_{number}_3_001、{type}_{number}_glow_001 或 {type}_{number}_extra_001。",
    robotExtraUnsupported: "Extra 仅支持机器人头部。",
    spiderExtraUnsupported: "Extra 仅支持蜘蛛身体（部件 01）。",
    importTextureFailed: "无法导入贴图。",
    noVisibleLayers: "没有可导出的可见图标图层。",
    noVisibleLayersDetail: "下载前请至少指定一个帧（例如主色层）。",
    stageUnavailable: "导出时无法访问图标画布区域。",
    stageUnavailableDetail: "准备下载时画布元素引用为空。",
    noRenderedLayers: "没有可导出的已渲染图标图层。",
    noRenderedLayersDetail: "准备图标 PNG 时图层的 DOM 边界为空。",
    exportPngFailed: "无法导出图标 PNG。",
    cause: "原因：{{cause}}",
  },
} as const;

export default errors;
