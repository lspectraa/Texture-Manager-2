const navigation = {
  applicationAria: "应用导航",
  title: "导航",
  expandPanelAria: "展开导航面板",
  collapsePanelAria: "收起导航面板",
  showPanel: "显示导航",
  hidePanel: "隐藏导航",
  home: "主页",
  homeHint: "启动器",
  settings: "设置",
  copyrightAria: "版权与关于",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "敬请期待",
  comingSoonTitle: "{{tool}} — 即将推出",
  homeScreen: {
    eyebrow: "贴图工作流中心",
    title: "你想做点什么？",
    lead: "在下方选择一个工具打开它的工作区。工具按工作流分组，方便你直接开始。",
    toolsReady: "个工具已就绪",
    toolsAvailableAria: "有 {{count}} 个工具可用",
    comingSoonCount: "还有 {{count}} 个即将推出",
    cardComingSoon: "即将推出",
  },
  sections: {
    design: {
      title: "设计与特效",
      subtitle: "处理图标和特效",
    },
    sheets: {
      title: "Sheet 流水线",
      subtitle: "拆分、合并与缩放 sheet",
    },
    batch: {
      title: "批量工具",
      subtitle: "批量修改贴图包",
    },
  },
  tools: {
    iconEditor: {
      label: "图标编辑器",
      description: "编辑图标并实时查看效果。",
    },
    glowMaker: {
      label: "光晕生成器",
      description: "为图标添加外发光效果。",
    },
    geodeButtons: {
      label: "创建 Geode 按钮",
      shortLabel: "Geode 按钮",
      description: "用你的图片制作 Geode 风格的按钮。",
    },
    particleEditor: {
      label: "粒子编辑器",
      description: "创建和编辑粒子特效。",
    },
    splitter: {
      label: "拆分器",
      description: "把贴图 sheet 拆分成独立文件。",
    },
    merger: {
      label: "合并器",
      description: "把独立文件重新合并成贴图 sheet。",
    },
    porter: {
      label: "移植器",
      description: "把贴图 sheet 缩放到其他尺寸。",
    },
    randomizer: {
      label: "随机器",
      description: "使用可复用的随机种子打乱图标。",
    },
    convertToNewVersion: {
      label: "转换到新版本",
      shortLabel: "新版本",
      description: "把 sheet 更新到最新的游戏版本。",
    },
    texturePackInstaller: {
      label: "贴图包安装器",
      shortLabel: "包安装器",
      description: "把贴图包安装到你的游戏文件夹。",
    },
  },
} as const;

export default navigation;
