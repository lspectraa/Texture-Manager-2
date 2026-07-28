const onboarding = {
  steps: {
    language: "选择语言",
    theme: "选择风格",
    geometryDash: "确认 Geometry Dash",
  },
  languageAria: "语言",
  languageHint: "随着翻译的补充，更多语言会出现在这里。",
  progressAria: "设置进度",
  stepAria: "第 {{number}} 步：{{id}}",
  pickYourStyle: "选择风格",
  gd: {
    notFound: "未找到",
    manualOverride: "手动指定",
    autoDetected: "自动检测",
    overrideActive: "手动指定生效中",
    noInstallYet: "尚未找到安装位置",
    installLocation: "安装位置",
    applyPath: "应用路径",
    redetect: "重新检测",
    notFoundWarning:
      "未找到 Geometry Dash。你可以先完成设置，之后在“设置”中指定安装路径。",
    looksGood: "没问题——游戏文件和工具都会使用这个路径。",
  },
} as const;

export default onboarding;
