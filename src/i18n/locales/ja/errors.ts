const errors = {
  defaults: {
    loadFailed: "バックエンドからフェーズの既定値を読み込めませんでした。",
    unexpectedLoadFailure: "既定値の読み込み中に予期しないエラーが発生しました。",
  },
  runtime: {
    folderPickerUnavailable: "フォルダー選択は Tauri ランタイムで利用できます。",
    filePickerUnavailable: "ファイル選択は Tauri ランタイムでのみ利用できます。",
  },
  validation: {
    splitterPathsRequired: "スプリッターには入力と出力の両方のディレクトリが必要です。",
    porterPathsRequired: "ポーターには入力と出力の両方のディレクトリが必要です。",
    mergerPathsRequired: "マージャーには入力と出力の両方のディレクトリが必要です。",
    glowMakerPathsRequired: "グロウメーカーには入力と出力の両方のディレクトリが必要です。",
    convertPathsRequired: "新しいバージョンへの変換には入力と出力の両方のディレクトリが必要です。",
    convertVersionRequired: "新しいバージョンへの変換には以前のゲームバージョンが必要です。",
    randomizerPathsRequired: "ランダマイザーには入力と出力の両方のディレクトリが必要です。",
    geodeButtonsPathsRequired:
      "Geode ボタンの作成には入力と出力の両方のディレクトリが必要です。",
    operationRequestMissing: "処理リクエストが作成されていません。",
  },
  operation: {
    cancelled: "処理をキャンセルしました。",
    backendExecutionFailed: "バックエンド経由での処理の実行に失敗しました。{{error}}",
  },
  geodeButtons: {
    gameFilesNotFound:
      "geode.loader のゲームファイルを解決できませんでした。TM_GEOMETRY_DASH_DIR を設定するか、Steam で Geometry Dash と Geode をインストールしてください。",
    resolveDefaultInputFailed: "既定の入力を解決できませんでした。",
    blankSheetNotFound:
      "geode.loader（または選択した入力ディレクトリ）で BlankSheet を自動的に見つけられませんでした。",
    autoSelectPlistFailed: "plist を自動選択できませんでした。",
    readTargetFramesFailed: "対象フレームを読み込めませんでした。",
    imageLoadFailed: "画像の読み込みに失敗しました",
  },
  iconEditor: {
    decodeFrameFailed: "抽出したフレーム画像をデコードできませんでした。",
    allocateCanvasFailed: "抽出したフレーム用のキャンバスを確保できませんでした。",
    loadSheetFailed: "アイコンシートを読み込めませんでした。",
    runtimeUnavailable: "アイコンエディターは Tauri ランタイムでのみ利用できます。",
    savePlistFailed: "plist の変更を保存できませんでした。",
    renameSheetFailed: "シートのファイル名を変更できませんでした。",
    swapNamesFailed: "シート名を入れ替えられませんでした。",
    saveCopyFailed: "シートのコピーを保存できませんでした。",
    textureImportUnavailable: "テクスチャの読み込みは Tauri ランタイムでのみ利用できます。",
    inferStemFailed:
      "plist からアイコン名の基幹部分を推測できませんでした。{type}_{number}_001、{type}_{number}_2_001、{type}_{number}_3_001、{type}_{number}_glow_001、{type}_{number}_extra_001 のようなフレーム名が必要です。",
    robotExtraUnsupported: "Extra はロボットの頭部でのみサポートされます。",
    spiderExtraUnsupported: "Extra はスパイダーの胴体（パーツ 01）でのみサポートされます。",
    importTextureFailed: "テクスチャを読み込めませんでした。",
    noVisibleLayers: "書き出せる表示中のアイコンレイヤーがありません。",
    noVisibleLayersDetail: "ダウンロードする前にフレームを 1 つ以上（例: プライマリ）割り当ててください。",
    stageUnavailable: "書き出しのためにアイコンステージへアクセスできませんでした。",
    stageUnavailableDetail: "ダウンロードの準備中にステージ要素の参照が null でした。",
    noRenderedLayers: "書き出せる描画済みのアイコンレイヤーがありません。",
    noRenderedLayersDetail: "アイコン PNG の準備中にレイヤーの DOM 範囲が空でした。",
    exportPngFailed: "アイコンの PNG を書き出せませんでした。",
    cause: "原因: {{cause}}",
  },
} as const;

export default errors;
