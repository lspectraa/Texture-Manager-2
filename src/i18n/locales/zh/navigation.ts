const navigation = {
  applicationAria: "应用导航",
  title: "导航",
  expandPanelAria: "展开导航面板",
  collapsePanelAria: "收起导航面板",
  showPanel: "显示导航",
  hidePanel: "隐藏导航",
  home: "主页",
  homeHint: "全部工具",
  settings: "设置",
  copyrightAria: "版权与关于",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "敬请期待",
  comingSoonTitle: "{{tool}} — 即将推出",
  homeScreen: {
    eyebrow: "贴图工具",
    title: "你想做点什么？",
    splash: {
      general: [
        "你想做点什么？",
        "选个工具，直接开始。",
        "图集、图标、光晕 — 接下来呢？",
        "又是一个包，又是一天。",
        "来做点好看的。",
      ],
      morning: ["早上好。先做哪件？", "新的一天 — 用哪个工具？"],
      afternoon: ["下午开工。我们在做什么？"],
      evening: ["晚上的工作室。清单上还有什么？", "再做一张再收工？"],
      night: ["深夜贴图局？", "图标可以等……也可以不等。"],
      monday: ["周一。先从小改动开始。"],
      friday: ["周五。周末前再收一个包？"],
      weekend: ["周末项目。", "不着急 — 选点有意思的。"],
    },
    lead: "选一个工具开始。它们按你想做的事情分组。",
    toolsReady: "个工具已就绪",
    toolsAvailableAria: "有 {{count}} 个工具可用",
    comingSoonCount: "还有 {{count}} 个即将推出",
    cardComingSoon: "即将推出",
  },
  sections: {
    design: {
      title: "设计与特效",
      subtitle: "图标、光晕、按钮和粒子",
    },
    sheets: {
      title: "Gamesheets",
      subtitle: "拆分、合并、缩放并锐化图集",
    },
    batch: {
      title: "材质包工具",
      subtitle: "一次改很多文件",
    },
  },
  tools: {
    iconEditor: {
      label: "图标编辑器",
      description: "改图标的部件、颜色和位置。",
    },
    glowMaker: {
      label: "光晕生成器",
      description: "给图标加上一圈光晕。",
    },
    geodeButtons: {
      label: "创建 Geode 按钮",
      shortLabel: "Geode 按钮",
      description: "创建 Geode 菜单按钮图集",
    },
    particleEditor: {
      label: "粒子编辑器",
      description: "制作并调整粒子特效。",
    },
    splitter: {
      label: "拆分器",
      description: "把 gamesheet 切成单独的精灵图。",
    },
    merger: {
      label: "合并器",
      description: "把精灵图重新拼成 gamesheet。",
    },
    porter: {
      label: "移植器",
      description: "生成图集的 HD、UHD 或低画质版本。",
    },
    upscaler: {
      label: "Upscaler",
      description: "让精灵图更大更清晰。也可以更新到最新游戏版本。",
    },
    randomizer: {
      label: "随机器",
      description: "打乱图标。想下次得到同样结果就记下代码。",
    },
    convertToNewVersion: {
      label: "转换到新版本",
      shortLabel: "新版本",
      description: "补上缺少的精灵图，让材质包能在最新游戏里用。",
    },
    texturePackInstaller: {
      label: "贴图包安装器",
      shortLabel: "包安装器",
      description: "把贴图包加到 Geometry Dash。",
    },
  },
} as const;

export default navigation;
