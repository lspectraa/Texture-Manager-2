const onboarding = {
  steps: {
    language: "言語を選択",
    theme: "スタイルを選択",
    geometryDash: "Geometry Dash を確認",
    androidStorage: "Allow storage access",
  },
  languageAria: "言語",
  languageHint: "翻訳が追加されると、ここに言語が増えていきます。",
  progressAria: "セットアップの進行状況",
  stepAria: "ステップ {{number}}: {{id}}",
  pickYourStyle: "スタイルを選択",
  androidStorage: {
    hint:
      "Texture Manager needs All files access to read Geode’s game folder on internal storage.",
    looksGood: "Storage access looks good — Geode files can be read.",
    skipWarning:
      "You can finish setup now and grant access later from Settings or when a tool needs Geode files.",
    permissionGranted: "すべてのファイルへのアクセスが許可されました。",
    skipFinish: "ストレージ権限なしで完了",
    recheck: "再確認",
  },
  gd: {
    notFound: "見つかりません",
    manualOverride: "手動指定",
    autoDetected: "自動検出",
    overrideActive: "手動指定が有効",
    noInstallYet: "まだインストールが見つかっていません",
    installLocation: "インストール場所",
    applyPath: "パスを適用",
    redetect: "再検出",
    notFoundWarning:
      "Geometry Dash が見つかりませんでした。今はセットアップを終えて、後から設定でインストールパスを指定できます。",
    looksGood: "問題ありません — このパスをゲームファイルとツールで使用します。",
  },
} as const;

export default onboarding;
