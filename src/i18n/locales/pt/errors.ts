const errors = {
  defaults: {
    loadFailed: "Falha ao carregar os padrões de fase do backend.",
    unexpectedLoadFailure: "Erro inesperado ao carregar os padrões.",
  },
  runtime: {
    folderPickerUnavailable: "O seletor de pastas está disponível no runtime do Tauri.",
    filePickerUnavailable: "O seletor de arquivos só está disponível no runtime do Tauri.",
  },
  validation: {
    splitterPathsRequired: "O Divisor exige os diretórios de entrada e de saída.",
    porterPathsRequired: "O Conversor exige os diretórios de entrada e de saída.",
    upscalerPathsRequired: "Upscaler requires both input and output directories.",
    upscalerVersionRequired:
      "Upscaler convert-to-latest requires a previous game version.",
    mergerPathsRequired: "O Combinador exige os diretórios de entrada e de saída.",
    glowMakerPathsRequired: "O Criador de brilho exige os diretórios de entrada e de saída.",
    convertPathsRequired:
      "Converter para nova versão exige os diretórios de entrada e de saída.",
    convertVersionRequired: "Converter para nova versão exige uma versão anterior do jogo.",
    randomizerPathsRequired: "O Randomizador exige os diretórios de entrada e de saída.",
    geodeButtonsPathsRequired:
      "Criar botões Geode exige os diretórios de entrada e de saída.",
    operationRequestMissing: "Nenhuma solicitação de operação foi construída.",
  },
  operation: {
    cancelled: "Operação cancelada.",
    backendExecutionFailed: "Falha ao executar a operação pelo backend. {{error}}",
  },
  geodeButtons: {
    gameFilesNotFound:
      "Não foi possível resolver os arquivos do geode.loader. Defina TM_GEOMETRY_DASH_DIR ou instale Geometry Dash + Geode pela Steam.",
    resolveDefaultInputFailed: "Falha ao resolver a entrada padrão.",
    blankSheetNotFound:
      "Não foi possível localizar automaticamente o BlankSheet no geode.loader (nem no diretório de entrada selecionado).",
    autoSelectPlistFailed: "Falha ao selecionar o plist automaticamente.",
    readTargetFramesFailed: "Falha ao ler os frames de destino.",
    imageLoadFailed: "falha ao carregar a imagem",
  },
  packInstaller: {
    geometryDashRequired:
      "Caminho do Geometry Dash não encontrado. Defina-o em Configurações (ou instale GD + Geode via Steam) antes de instalar packs.",
    runtimeUnavailable: "Pack Installer is available only in the desktop app.",
    discoverFailed: "Failed to discover install units from the selected source.",
    installFailed: "Failed to install the selected pack units.",
    createFailed: "Failed to create the texture pack folder.",
    openFolderFailed: "Failed to open the pack folder.",
    noUnitsSelected: "Select at least one install unit.",
    convertVersionRequired: "Choose the pack's previous game version when Convert to Latest Version is enabled.",
    folderNameRequired: "Enter a folder name for the new pack.",
    invalidDropPng: "Drop a .png file for pack.png, or switch to Install mode for folders/zips.",
    invalidDropCreate:
      "Drop a pack folder or a .png for pack.png (use Install mode for zip archives).",
    listFailed: "Failed to list installed packs.",
    saveMetadataFailed: "Failed to save pack metadata.",
    operationFailed: "Failed to run the pack operation.",
    noLibraryPackSelected: "Select a pack from the library first.",
    openPacksFolderFailed: "Failed to open the packs folder.",
    deleteFailed: "Failed to delete the pack.",
    splitOutputRequired: "Choose an output folder before splitting the pack.",
  },
  iconEditor: {
    decodeFrameFailed: "Falha ao decodificar a imagem do frame extraído.",
    allocateCanvasFailed: "Falha ao alocar o canvas para o frame extraído.",
    loadSheetFailed: "Falha ao carregar a sheet de ícones.",
    runtimeUnavailable: "O editor de ícones só está disponível no runtime do Tauri.",
    savePlistFailed: "Falha ao salvar as alterações do plist.",
    renameSheetFailed: "Falha ao renomear os arquivos da sheet.",
    swapNamesFailed: "Falha ao trocar os nomes das sheets.",
    saveCopyFailed: "Falha ao salvar a cópia da sheet.",
    textureImportUnavailable: "A importação de texturas só está disponível no runtime do Tauri.",
    inferStemFailed:
      "Não foi possível inferir o radical do ícone a partir do plist. Esperava nomes de frame como {type}_{number}_001, {type}_{number}_2_001, {type}_{number}_3_001, {type}_{number}_glow_001 ou {type}_{number}_extra_001.",
    robotExtraUnsupported: "Extra só é suportado na cabeça do robô.",
    spiderExtraUnsupported: "Extra só é suportado no corpo da aranha (parte 01).",
    importTextureFailed: "Falha ao importar a textura.",
    noVisibleLayers: "Nenhuma camada de ícone visível para exportar.",
    noVisibleLayersDetail: "Atribua ao menos um frame (por exemplo, primário) antes de baixar.",
    stageUnavailable: "Falha ao acessar o palco do ícone para exportar.",
    stageUnavailableDetail: "A referência do elemento do palco era nula ao preparar o download.",
    noRenderedLayers: "Nenhuma camada de ícone renderizada para exportar.",
    noRenderedLayersDetail: "Os limites DOM das camadas estavam vazios ao preparar o PNG.",
    exportPngFailed: "Falha ao exportar o PNG do ícone.",
    cause: "Causa: {{cause}}",
  },
} as const;

export default errors;
