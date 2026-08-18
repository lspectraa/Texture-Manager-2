const navigation = {
  applicationAria: "애플리케이션 탐색",
  title: "탐색",
  expandPanelAria: "탐색 패널 펼치기",
  collapsePanelAria: "탐색 패널 접기",
  showPanel: "탐색 표시",
  hidePanel: "탐색 숨기기",
  home: "홈",
  homeHint: "모든 도구",
  settings: "설정",
  copyrightAria: "저작권 및 정보",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "곧",
  comingSoonTitle: "{{tool}} — 곧 제공",
  homeScreen: {
    eyebrow: "텍스처 도구",
    title: "무엇을 작업할까요?",
    splash: {
      general: [
        "무엇을 작업할까요?",
        "도구를 고르고 바로 시작하세요.",
        "시트, 아이콘, 글로우 — 다음은?",
        "또 하나의 팩, 또 하루.",
        "예쁜 걸 만들어 봅시다.",
      ],
      morning: ["좋은 아침. 뭐부터 할까요?", "새 시작 — 어떤 도구?"],
      afternoon: ["오후 작업. 뭘 만들까요?"],
      evening: ["저녁 스튜디오. 목록에 뭐가 있죠?", "끝내기 전에 시트 하나 더?"],
      night: ["밤샘 텍스처 작업?", "아이콘은 기다려 줄지도… 아닐지도."],
      monday: ["월요일. 작은 수정부터 시작하세요."],
      friday: ["금요일. 주말 전에 팩 하나 끝낼까요?"],
      weekend: ["주말 프로젝트.", "서두르지 마세요. 재미있는 걸 고르세요."],
    },
    lead: "도구를 골라 시작하세요. 하고 싶은 일별로 묶여 있습니다.",
    toolsReady: "개 도구 준비됨",
    toolsAvailableAria: "{{count}}개의 도구 사용 가능",
    comingSoonCount: "+{{count}}개 곧 제공",
    cardComingSoon: "곧 제공",
  },
  sections: {
    design: {
      title: "디자인 및 효과",
      subtitle: "아이콘, 글로우, 버튼, 파티클",
    },
    sheets: {
      title: "게임시트",
      subtitle: "시트를 나누고, 합치고, 크기와 선명도를 맞춥니다",
    },
    batch: {
      title: "팩 도구",
      subtitle: "여러 파일을 한 번에 바꿉니다",
    },
  },
  tools: {
    iconEditor: {
      label: "아이콘 편집기",
      description: "아이콘의 부분, 색, 위치를 바꿉니다.",
    },
    glowMaker: {
      label: "글로우 메이커",
      description: "아이콘 주위에 글로우를 넣습니다.",
    },
    geodeButtons: {
      label: "Geode 버튼 만들기",
      shortLabel: "Geode 버튼",
      description: "Geode 메뉴 버튼 게임시트를 만들기",
    },
    particleEditor: {
      label: "파티클 편집기",
      description: "파티클 효과를 만들고 다듬습니다.",
    },
    splitter: {
      label: "분할기",
      description: "게임시트를 개별 스프라이트로 자릅니다.",
    },
    merger: {
      label: "병합기",
      description: "스프라이트를 다시 게임시트로 합칩니다.",
    },
    porter: {
      label: "포터",
      description: "시트의 HD, UHD 또는 저화질 버전을 만듭니다.",
    },
    upscaler: {
      label: "Upscaler",
      description: "스프라이트를 더 크고 선명하게 만듭니다. 최신 게임에 맞게 업데이트할 수도 있습니다.",
    },
    randomizer: {
      label: "랜덤라이저",
      description: "아이콘을 섞습니다. 같은 결과를 원하면 코드를 저장하세요.",
    },
    convertToNewVersion: {
      label: "새 버전으로 변환",
      shortLabel: "새 버전",
      description: "빠진 스프라이트를 넣어 팩이 최신 게임에서 작동하게 합니다.",
    },
    texturePackInstaller: {
      label: "텍스처 팩 설치기",
      shortLabel: "팩 설치기",
      description: "텍스처 팩을 Geometry Dash에 추가합니다.",
    },
  },
} as const;

export default navigation;
