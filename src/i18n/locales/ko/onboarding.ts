const onboarding = {
  steps: {
    language: "언어 선택",
    theme: "스타일 선택",
    geometryDash: "Geometry Dash 확인",
  },
  languageAria: "언어",
  languageHint: "번역이 추가되는 대로 더 많은 언어가 여기에 표시됩니다.",
  progressAria: "설정 진행률",
  stepAria: "{{number}}단계: {{id}}",
  pickYourStyle: "스타일 선택",
  gd: {
    notFound: "찾을 수 없음",
    manualOverride: "수동 지정",
    autoDetected: "자동 감지됨",
    overrideActive: "수동 지정 사용 중",
    noInstallYet: "아직 설치를 찾지 못했습니다",
    installLocation: "설치 위치",
    applyPath: "경로 적용",
    redetect: "다시 감지",
    notFoundWarning:
      "Geometry Dash를 찾지 못했습니다. 지금 설정을 마치고 나중에 설정에서 설치 경로를 지정할 수 있습니다.",
    looksGood: "좋습니다 — 이 경로가 게임 파일과 도구에 사용됩니다.",
  },
} as const;

export default onboarding;
