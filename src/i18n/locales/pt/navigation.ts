const navigation = {
  applicationAria: "Navegação do aplicativo",
  title: "Navegação",
  expandPanelAria: "Expandir painel de navegação",
  collapsePanelAria: "Recolher painel de navegação",
  showPanel: "Mostrar navegação",
  hidePanel: "Ocultar navegação",
  home: "Início",
  homeHint: "Todas as ferramentas",
  settings: "Configurações",
  copyrightAria: "Direitos autorais e sobre",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "Em breve",
  comingSoonTitle: "{{tool}} — em breve",
  homeScreen: {
    eyebrow: "Ferramentas de textura",
    title: "No que você quer trabalhar?",
    splash: {
      general: [
        "No que você quer trabalhar?",
        "Escolha uma ferramenta e comece.",
        "Sheets, ícones, brilho — o que vem agora?",
        "Outro pack, outro dia.",
        "Vamos deixar algo bonito.",
      ],
      morning: ["Bom dia. O que vem primeiro?", "Começo fresco — qual ferramenta?"],
      afternoon: ["Sessão da tarde. O que estamos fazendo?"],
      evening: ["Noite no estúdio. O que está na lista?", "Mais uma sheet antes de parar?"],
      night: ["Sessão noturna de texturas?", "Os ícones podem esperar… ou não."],
      monday: ["Segunda. Comece com um ajuste pequeno."],
      friday: ["Sexta. Um pack antes do fim de semana?"],
      weekend: ["Projeto de fim de semana.", "Sem pressa — escolha algo divertido."],
    },
    lead: "Escolha uma ferramenta para começar. Elas são agrupadas pelo que você quer fazer.",
    toolsReady: "ferramentas prontas",
    toolsAvailableAria: "{{count}} ferramentas disponíveis",
    comingSoonCount: "+{{count}} em breve",
    cardComingSoon: "Em breve",
  },
  sections: {
    design: {
      title: "Design e efeitos",
      subtitle: "Ícones, brilho, botões e partículas",
    },
    sheets: {
      title: "Gamesheets",
      subtitle: "Divida, junte, redimensione e melhore as sheets",
    },
    batch: {
      title: "Ferramentas de packs",
      subtitle: "Altere muitos arquivos de uma vez",
    },
  },
  tools: {
    iconEditor: {
      label: "Editor de ícones",
      description: "Mude as partes, cores e posição de um ícone.",
    },
    glowMaker: {
      label: "Criador de brilho",
      description: "Adicione um brilho ao redor dos seus ícones.",
    },
    geodeButtons: {
      label: "Criar botões Geode",
      shortLabel: "Botões Geode",
      description: "Criar o gamesheet dos botões de menu Geode",
    },
    particleEditor: {
      label: "Editor de partículas",
      description: "Crie e ajuste efeitos de partículas.",
    },
    splitter: {
      label: "Divisor",
      description: "Corte um gamesheet em sprites individuais.",
    },
    merger: {
      label: "Combinador",
      description: "Junte os sprites de volta em um gamesheet.",
    },
    porter: {
      label: "Conversor",
      description: "Crie versões HD, UHD ou de baixa qualidade de uma sheet.",
    },
    upscaler: {
      label: "Upscaler",
      description: "Deixe os sprites mais nítidos e maiores. Você também pode atualizá-los para o jogo mais recente.",
    },
    randomizer: {
      label: "Randomizador",
      description: "Misture ícones. Guarde o código se quiser a mesma mistura depois.",
    },
    convertToNewVersion: {
      label: "Converter para nova versão",
      shortLabel: "Nova versão",
      description: "Adicione sprites que faltam para o pack funcionar no jogo mais recente.",
    },
    texturePackInstaller: {
      label: "Instalador de texture packs",
      shortLabel: "Instalador",
      description: "Adicione texture packs ao Geometry Dash.",
    },
  },
} as const;

export default navigation;
