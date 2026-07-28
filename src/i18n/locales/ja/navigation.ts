const navigation = {
  applicationAria: "アプリのナビゲーション",
  title: "ナビゲーション",
  expandPanelAria: "ナビゲーションパネルを展開",
  collapsePanelAria: "ナビゲーションパネルを折りたたむ",
  showPanel: "ナビゲーションを表示",
  hidePanel: "ナビゲーションを隠す",
  home: "ホーム",
  homeHint: "ランチャー",
  settings: "設定",
  copyrightAria: "著作権と情報",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "近日",
  comingSoonTitle: "{{tool}} — 近日公開",
  homeScreen: {
    eyebrow: "テクスチャ作業のハブ",
    title: "何を作業しますか？",
    lead:
      "下からツールを選ぶと、そのワークスペースが開きます。ツールは作業の流れごとにまとめられています。",
    toolsReady: "個のツールが利用可能",
    toolsAvailableAria: "{{count}} 個のツールが利用可能",
    comingSoonCount: "+{{count}} 個が近日公開",
    cardComingSoon: "近日公開",
  },
  sections: {
    design: {
      title: "デザインとエフェクト",
      subtitle: "アイコンとエフェクトの作業",
    },
    sheets: {
      title: "シートのパイプライン",
      subtitle: "シートの分割・結合・リサイズ",
    },
    batch: {
      title: "一括ユーティリティ",
      subtitle: "テクスチャパックの一括変更",
    },
  },
  tools: {
    iconEditor: {
      label: "アイコンエディター",
      description: "アイコンを編集して変更をリアルタイムで確認できます。",
    },
    glowMaker: {
      label: "グロウメーカー",
      description: "アイコンの周りにグロウ効果を追加します。",
    },
    geodeButtons: {
      label: "Geode ボタンを作成",
      shortLabel: "Geode ボタン",
      description: "手持ちの画像から Geode 風のボタンを作成します。",
    },
    particleEditor: {
      label: "パーティクルエディター",
      description: "パーティクルエフェクトを作成・編集します。",
    },
    splitter: {
      label: "スプリッター",
      description: "テクスチャシートを個別のファイルに分割します。",
    },
    merger: {
      label: "マージャー",
      description: "個別のファイルをテクスチャシートにまとめ直します。",
    },
    porter: {
      label: "ポーター",
      description: "テクスチャシートを別のサイズにリサイズします。",
    },
    randomizer: {
      label: "ランダマイザー",
      description: "再利用できるシードでアイコンをシャッフルします。",
    },
    convertToNewVersion: {
      label: "新しいバージョンへ変換",
      shortLabel: "新バージョン",
      description: "シートを最新のゲームバージョン向けに更新します。",
    },
    texturePackInstaller: {
      label: "テクスチャパックインストーラー",
      shortLabel: "パックインストーラー",
      description: "テクスチャパックをゲームフォルダーにインストールします。",
    },
  },
} as const;

export default navigation;
