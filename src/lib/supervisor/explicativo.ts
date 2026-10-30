// Dados do Explicativo do Supervisor: documentação VIVA de como o sistema está
// configurado agora. Duas fontes, nunca texto que envelhece sozinho:
//  • REGISTRO_VARREDURAS — as rotinas de fundo que existem (a do Supervisor +
//    as do sistema). Cadência das rotinas do sistema é FIXA no código: cada
//    entrada cita o arquivo-fonte para quem for mexer manter os dois em sinconia.
//  • linhasConfig(cfg) — deriva os valores vigentes da config resolvida (puro).
import type { ConfigEditavel } from "./tipos";

export type EntradaVarredura = {
  chave: string;
  nome: string;
  oQueFaz: string;
  cadencia: string;
  le: string; // o que examina
  editavel: string; // onde se edita (ou "fixo no código")
  fonte: string; // arquivo de origem (para manutenção)
};

// Rotinas de fundo do SISTEMA (cadência fixa no código). Fatos do levantamento
// de 14/10 — a fonte permite a um dev confirmar/atualizar se algo mudar.
export const REGISTRO_SISTEMA: EntradaVarredura[] = [
  {
    chave: "slaAlertas",
    nome: "SLA por etapa (3 cores)",
    oQueFaz:
      "Card em 3 cores na borda: AMARELO (faltam ≤12h úteis p/ vencer o prazo da etapa), VERMELHO (vencido/atraso — notifica o dono e entra no sino de SLA), sem cor (no prazo). A Prazo (azul) e VIP (roxo) ficam FORA do SLA.",
    cadencia: "a cada 60s",
    le: "negócios abertos + limiares da tabela ConfigAlertaSla",
    editavel: "limiares por etapa em ConfigAlertaSla",
    fonte: "src/lib/slaAlertas.ts",
  },
  {
    chave: "alertas",
    nome: "Lembretes & tarefas vencendo",
    oQueFaz: "Tarefa/Lembrete chegando no horário vira notificação (sino).",
    cadencia: "a cada 90s",
    le: "Lembrete e Tarefa pendentes",
    editavel: "fixo no código",
    fonte: "src/lib/alertas.ts",
  },
  {
    chave: "recaptacao",
    nome: "Reativação (campanha)",
    oQueFaz:
      "Ondas de reengajamento — só agem quando há campanha ARMADA, dentro do horário e da cota diária.",
    cadencia: "a cada 60s (com jitter)",
    le: "leads e estado da campanha",
    editavel: "pelas campanhas de reativação",
    fonte: "src/lib/recaptacao.ts",
  },
  {
    chave: "arquivamento",
    nome: "Limpeza do Kanban",
    oQueFaz:
      "Arquiva PERDIDO/GANHO após o prazo (não apaga nada; só tira do Kanban).",
    cadencia: "a cada 24h + no boot",
    le: "negócios fechados + ConfiguracaoCRM (dias)",
    editavel: "dias em ConfiguracaoCRM",
    fonte: "src/lib/arquivamento.ts",
  },
  {
    chave: "manutencao",
    nome: "Manutenção & retenção",
    oQueFaz:
      "Poda payload antigo de mensagens (mantém o conteúdo); aniversários; arquivo opcional de conversas inativas.",
    cadencia: "a cada 24h",
    le: "Mensagem.raw antigo e conversas inativas",
    editavel: "env RETENCAO_RAW_MESES / ARQUIVAR_INATIVAS_MESES",
    fonte: "src/lib/manutencao.ts",
  },
];

// Linha da varredura do Supervisor, montada da config VIVA (não é fixa).
export function resumoVarreduraSupervisor(cfg: ConfigEditavel): EntradaVarredura {
  const v = cfg.varredura;
  const itens = (
    [
      [v.vigia.semResposta, "cliente sem resposta"],
      [v.vigia.semProximoPasso, "sem próximo passo"],
      [v.vigia.parado, "parado além do limiar"],
      [v.vigia.primeiraResposta, "1ª resposta estourada"],
    ] as [boolean, string][]
  )
    .filter(([on]) => on)
    .map(([, t]) => t);
  return {
    chave: "varreduraSupervisor",
    nome: "Varredura do Supervisor",
    oQueFaz: v.ativa
      ? `Examina os atendimentos e abre alertas/propostas para: ${itens.join(", ") || "(nenhum item marcado)"}.`
      : "Desligada — não examina nada no momento.",
    cadencia: v.ativa ? `a cada ${v.cadenciaMin} min` : "desligada",
    le: `atendimentos abertos (sem resposta após ${v.semRespostaHoras}h)`,
    editavel: "aba Configurações (ou peça à IA no chat)",
    fonte: "src/lib/supervisor/varredura.ts",
  };
}

export type GrupoConfig = {
  grupo: string;
  itens: { rotulo: string; valor: string; significado: string }[];
};

// Descreve a config vigente em linguagem do gestor. Puro (derivado da config).
export function linhasConfig(cfg: ConfigEditavel): GrupoConfig[] {
  const l = cfg.limiares;
  const reais = (v: number | null) => (v == null ? "sem meta" : `R$ ${v.toLocaleString("pt-BR")}`);
  return [
    {
      grupo: "Prazos & limiares",
      itens: [
        {
          rotulo: "Prazo de 1ª resposta",
          valor: `${Math.round(l.prazo1aRespostaSeg / 60)} min`,
          significado: "até quando a 1ª resposta a um lead conta como 'no prazo'.",
        },
        {
          rotulo: 'Dias para "parado"',
          valor: `${l.paradoDiasPadrao} dias`,
          significado: "sem ConfigAlertaSla por etapa, é o corte global de negócio parado.",
        },
        {
          rotulo: "Meta do período",
          valor: reais(l.metaPeriodoReais),
          significado: "denominador da cobertura de funil; vazio deixa a cobertura neutra.",
        },
      ],
    },
    {
      grupo: "Pesos de cobertura",
      itens: [
        { rotulo: "Quente", valor: String(l.pesosCobertura.QUENTE), significado: "peso do valor em aberto por temperatura do lead." },
        { rotulo: "Morno", valor: String(l.pesosCobertura.MORNO), significado: "idem." },
        { rotulo: "Frio", valor: String(l.pesosCobertura.FRIO), significado: "idem." },
      ],
    },
  ];
}
