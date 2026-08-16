const errors = {
  defaults: {
    loadFailed: "백엔드에서 단계 기본값을 불러오지 못했습니다.",
    unexpectedLoadFailure: "기본값을 불러오는 중 예기치 않은 오류가 발생했습니다.",
  },
  runtime: {
    folderPickerUnavailable: "폴더 선택기는 Tauri 런타임에서 사용할 수 있습니다.",
    filePickerUnavailable: "파일 선택기는 Tauri 런타임에서만 사용할 수 있습니다.",
  },
  validation: {
    splitterPathsRequired: "분할기에는 입력 디렉터리와 출력 디렉터리가 모두 필요합니다.",
    porterPathsRequired: "포터에는 입력 디렉터리와 출력 디렉터리가 모두 필요합니다.",
    upscalerPathsRequired: "Upscaler requires both input and output directories.",
    upscalerVersionRequired:
      "Upscaler convert-to-latest requires a previous game version.",
    mergerPathsRequired: "병합기에는 입력 디렉터리와 출력 디렉터리가 모두 필요합니다.",
    glowMakerPathsRequired: "글로우 메이커에는 입력 디렉터리와 출력 디렉터리가 모두 필요합니다.",
    convertPathsRequired: "새 버전으로 변환에는 입력 디렉터리와 출력 디렉터리가 모두 필요합니다.",
    convertVersionRequired: "새 버전으로 변환에는 이전 게임 버전이 필요합니다.",
    randomizerPathsRequired: "랜덤라이저에는 입력 디렉터리와 출력 디렉터리가 모두 필요합니다.",
    geodeButtonsPathsRequired:
      "Geode 버튼 만들기에는 입력 디렉터리와 출력 디렉터리가 모두 필요합니다.",
    operationRequestMissing: "생성된 작업 요청이 없습니다.",
  },
  operation: {
    cancelled: "작업이 취소되었습니다.",
    backendExecutionFailed: "백엔드를 통한 작업 실행에 실패했습니다. {{error}}",
  },
  geodeButtons: {
    gameFilesNotFound:
      "geode.loader 게임 파일을 찾지 못했습니다. TM_GEOMETRY_DASH_DIR을 설정하거나 Steam으로 Geometry Dash와 Geode를 설치하세요.",
    resolveDefaultInputFailed: "기본 입력을 확인하지 못했습니다.",
    blankSheetNotFound:
      "geode.loader(또는 선택한 입력 디렉터리)에서 BlankSheet를 자동으로 찾지 못했습니다.",
    autoSelectPlistFailed: "plist를 자동으로 선택하지 못했습니다.",
    readTargetFramesFailed: "대상 프레임을 읽지 못했습니다.",
    imageLoadFailed: "이미지를 불러오지 못했습니다",
  },
  packInstaller: {
    geometryDashRequired:
      "Geometry Dash 경로를 찾을 수 없습니다. 팩을 설치하기 전에 설정에서 지정하세요(또는 Steam으로 GD + Geode 설치).",
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
    decodeFrameFailed: "추출한 프레임 이미지를 디코딩하지 못했습니다.",
    allocateCanvasFailed: "추출한 프레임을 위한 캔버스를 할당하지 못했습니다.",
    loadSheetFailed: "아이콘 시트를 불러오지 못했습니다.",
    runtimeUnavailable: "아이콘 편집기는 Tauri 런타임에서만 사용할 수 있습니다.",
    savePlistFailed: "plist 변경 사항을 저장하지 못했습니다.",
    renameSheetFailed: "시트 파일 이름을 변경하지 못했습니다.",
    swapNamesFailed: "시트 이름을 교체하지 못했습니다.",
    saveCopyFailed: "시트 사본을 저장하지 못했습니다.",
    textureImportUnavailable: "텍스처 가져오기는 Tauri 런타임에서만 사용할 수 있습니다.",
    inferStemFailed:
      "plist에서 아이콘 이름의 어간을 추론하지 못했습니다. {type}_{number}_001, {type}_{number}_2_001, {type}_{number}_3_001, {type}_{number}_glow_001 또는 {type}_{number}_extra_001 형태의 프레임 이름이 필요합니다.",
    robotExtraUnsupported: "Extra는 로봇 머리에서만 지원됩니다.",
    spiderExtraUnsupported: "Extra는 스파이더 몸통(파트 01)에서만 지원됩니다.",
    importTextureFailed: "텍스처를 가져오지 못했습니다.",
    noVisibleLayers: "내보낼 수 있는 표시된 아이콘 레이어가 없습니다.",
    noVisibleLayersDetail: "다운로드하기 전에 프레임을 하나 이상(예: 기본) 지정하세요.",
    stageUnavailable: "내보내기를 위해 아이콘 스테이지에 접근하지 못했습니다.",
    stageUnavailableDetail: "다운로드를 준비하는 동안 스테이지 요소 참조가 null이었습니다.",
    noRenderedLayers: "내보낼 수 있는 렌더링된 아이콘 레이어가 없습니다.",
    noRenderedLayersDetail: "아이콘 PNG를 준비하는 동안 레이어의 DOM 영역이 비어 있었습니다.",
    exportPngFailed: "아이콘 PNG를 내보내지 못했습니다.",
    cause: "원인: {{cause}}",
  },
} as const;

export default errors;
