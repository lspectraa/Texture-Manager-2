const navigation = {
  applicationAria: "アプリのナビゲーション",
  title: "ナビゲーション",
  expandPanelAria: "ナビゲーションパネルを展開",
  collapsePanelAria: "ナビゲーションパネルを折りたたむ",
  showPanel: "ナビゲーションを表示",
  hidePanel: "ナビゲーションを隠す",
  home: "ホーム",
  homeHint: "すべてのツール",
  settings: "設定",
  copyrightAria: "著作権と情報",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "近日",
  comingSoonTitle: "{{tool}} — 近日公開",
  homeScreen: {
    eyebrow: "テクスチャツール",
    title: "何を作業しますか？",
    splash: {
      general: [
        "何を作業しますか？",
        "ツールを選んで始めましょう。",
        "シート、アイコン、グロウ — 次はどれ？",
        "今日もパック作業。",
        "きれいなものを作りましょう。",
      ],
      morning: ["おはよう。何から始める？", "新しい一日 — どのツール？"],
      afternoon: ["午後の作業。何を作る？"],
      evening: ["夜のスタジオ。何が残ってる？", "もう1枚やってから終わる？"],
      night: ["夜更かしテクスチャ作業？", "アイコンは待ってくれる…かも。"],
      monday: ["月曜日。小さな編集から始めよう。"],
      friday: ["金曜日。週末前にパックを仕上げる？"],
      weekend: ["週末プロジェクト。", "急がなくていい。楽しいものを選んで。"],
    },
    lead: "ツールを選んで始めましょう。やりたいことに合わせてグループ分けされています。",
    toolsReady: "個のツールが利用可能",
    toolsAvailableAria: "{{count}} 個のツールが利用可能",
    comingSoonCount: "+{{count}} 個が近日公開",
    cardComingSoon: "近日公開",
  },
  sections: {
    design: {
      title: "デザインとエフェクト",
      subtitle: "アイコン、グロウ、ボタン、パーティクル",
    },
    sheets: {
      title: "ゲームシート",
      subtitle: "シートの分割、結合、リサイズ、シャープ化",
    },
    batch: {
      title: "パックツール",
      subtitle: "たくさんのファイルをまとめて変更",
    },
  },
  tools: {
    iconEditor: {
      label: "アイコンエディター",
      description: "アイコンのパーツ、色、位置を変更します。",
    },
    glowMaker: {
      label: "グロウメーカー",
      description: "アイコンの周りにグロウを付けます。",
    },
    geodeButtons: {
      label: "Geode ボタンを作成",
      shortLabel: "Geode ボタン",
      description: "Geode メニューボタンのゲームシートを作成",
    },
    particleEditor: {
      label: "パーティクルエディター",
      description: "パーティクルエフェクトを作って調整します。",
    },
    splitter: {
      label: "スプリッター",
      description: "ゲームシートを個別のスプライトに切り分けます。",
    },
    merger: {
      label: "マージャー",
      description: "スプライトをゲームシートにまとめ直します。",
    },
    porter: {
      label: "ポーター",
      description: "シートの HD、UHD、低画質バージョンを作ります。",
    },
    upscaler: {
      label: "Upscaler",
      description: "スプライトをより大きくはっきりさせます。最新のゲーム向けに更新することもできます。",
    },
    randomizer: {
      label: "ランダマイザー",
      description: "アイコンを混ぜます。同じ結果が欲しいときはコードを保存してください。",
    },
    convertToNewVersion: {
      label: "新しいバージョンへ変換",
      shortLabel: "新バージョン",
      description: "足りないスプライトを足して、パックを最新のゲームで使えるようにします。",
    },
    texturePackInstaller: {
      label: "テクスチャパックインストーラー",
      shortLabel: "パックインストーラー",
      description: "テクスチャパックを Geometry Dash に追加します。",
    },
  },
} as const;

export default navigation;
