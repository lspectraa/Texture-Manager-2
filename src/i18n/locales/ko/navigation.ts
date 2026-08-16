const navigation = {
  applicationAria: "애플리케이션 탐색",
  title: "탐색",
  expandPanelAria: "탐색 패널 펼치기",
  collapsePanelAria: "탐색 패널 접기",
  showPanel: "탐색 표시",
  hidePanel: "탐색 숨기기",
  home: "홈",
  homeHint: "런처",
  settings: "설정",
  copyrightAria: "저작권 및 정보",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "곧",
  comingSoonTitle: "{{tool}} — 곧 제공",
  homeScreen: {
    eyebrow: "텍스처 작업 허브",
    title: "무엇을 작업할까요?",
    lead:
      "아래에서 도구를 선택해 작업 공간을 여세요. 도구는 작업 흐름별로 묶여 있어 바로 시작할 수 있습니다.",
    toolsReady: "개 도구 준비됨",
    toolsAvailableAria: "{{count}}개의 도구 사용 가능",
    comingSoonCount: "+{{count}}개 곧 제공",
    cardComingSoon: "곧 제공",
  },
  sections: {
    design: {
      title: "디자인 및 효과",
      subtitle: "아이콘과 효과 작업",
    },
    sheets: {
      title: "시트 파이프라인",
      subtitle: "시트 분할, 병합, 크기 조정",
    },
    batch: {
      title: "일괄 유틸리티",
      subtitle: "텍스처 팩 일괄 변경",
    },
  },
  tools: {
    iconEditor: {
      label: "아이콘 편집기",
      description: "아이콘을 편집하고 변경 사항을 실시간으로 확인하세요.",
    },
    glowMaker: {
      label: "글로우 메이커",
      description: "아이콘 주위에 글로우 효과를 추가하세요.",
    },
    geodeButtons: {
      label: "Geode 버튼 만들기",
      shortLabel: "Geode 버튼",
      description: "이미지를 사용해 Geode 스타일 버튼을 만드세요.",
    },
    particleEditor: {
      label: "파티클 편집기",
      description: "파티클 효과를 만들고 편집하세요.",
    },
    splitter: {
      label: "분할기",
      description: "텍스처 시트를 개별 파일로 분할합니다.",
    },
    merger: {
      label: "병합기",
      description: "개별 파일을 다시 텍스처 시트로 합칩니다.",
    },
    porter: {
      label: "포터",
      description: "텍스처 시트를 다른 크기로 조정합니다.",
    },
    upscaler: {
      label: "Upscaler",
      description:
        "AI-upscale sprites to HD or UHD, then optionally convert to the latest game version.",
    },
    randomizer: {
      label: "랜덤라이저",
      description: "재사용 가능한 시드로 아이콘을 섞습니다.",
    },
    convertToNewVersion: {
      label: "새 버전으로 변환",
      shortLabel: "새 버전",
      description: "시트를 최신 게임 버전에 맞게 업데이트합니다.",
    },
    texturePackInstaller: {
      label: "텍스처 팩 설치기",
      shortLabel: "팩 설치기",
      description: "텍스처 팩을 게임 폴더에 설치합니다.",
    },
  },
} as const;

export default navigation;
