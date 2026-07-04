// Exclusao FISICA completa de clientes (leads) e todo o seu rastro. Usado pela
// exclusao de conversa (admin) e pela exclusao por numero. Remove o atendimento
// por inteiro: Inbox (Conversa/Mensagem), Kanban/Carteira (Negocio + dependentes)
// e Clientes (Lead + dependentes). Tudo em UMA transacao, na ordem correta de
// FKs (filhos antes dos pais). NAO ha DROP de schema; e so DELETE de dados.
import { prisma } from "./prisma";

export type ResumoExclusao = {
  leads: number;
  conversas: number;
  mensagens: number;
  negocios: number;
};

// Apaga completamente os leads informados (e nada se a lista for vazia).
export async function excluirLeadsCompleto(
  leadIds: string[],
): Promise<ResumoExclusao> {
  const ids = Array.from(new Set(leadIds)).filter(Boolean);
  if (ids.length === 0) {
    return { leads: 0, conversas: 0, mensagens: 0, negocios: 0 };
  }

  return prisma.$transaction(async (tx) => {
    const convs = await tx.conversa.findMany({
      where: { leadId: { in: ids } },
      select: { id: true },
    });
    const convIds = convs.map((c) => c.id);
    const negs = await tx.negocio.findMany({
      where: { leadId: { in: ids } },
      select: { id: true },
    });
    const negIds = negs.map((n) => n.id);

    // 1) Filhos da Conversa.
    const msg = await tx.mensagem.deleteMany({
      where: { conversaId: { in: convIds } },
    });
    // 2) Filhos do Negocio (FK Restrict / Cascade).
    await tx.alertaNegocio.deleteMany({ where: { negocioId: { in: negIds } } });
    await tx.historicoNegocio.deleteMany({ where: { negocioId: { in: negIds } } });
    // 3) Filhos do Lead (FK Restrict ou que referenciam Negocio opcionalmente).
    await tx.leadEtiqueta.deleteMany({ where: { leadId: { in: ids } } });
    await tx.nota.deleteMany({ where: { leadId: { in: ids } } });
    await tx.atividade.deleteMany({ where: { leadId: { in: ids } } });
    await tx.lembrete.deleteMany({ where: { leadId: { in: ids } } });
    await tx.tarefa.deleteMany({ where: { leadId: { in: ids } } });
    await tx.orcamento.deleteMany({ where: { leadId: { in: ids } } });
    await tx.campanhaDestino.deleteMany({ where: { leadId: { in: ids } } });
    await tx.leadProdutoInteresse.deleteMany({ where: { leadId: { in: ids } } });
    await tx.endereco.deleteMany({ where: { leadId: { in: ids } } });
    // Notificacao tem leadId sem FK (apenas referencia logica).
    await tx.notificacao.deleteMany({ where: { leadId: { in: ids } } });
    // 4) Conversa e Negocio (depois dos filhos).
    const conv = await tx.conversa.deleteMany({ where: { leadId: { in: ids } } });
    const neg = await tx.negocio.deleteMany({ where: { leadId: { in: ids } } });
    // 5) Lead por ultimo.
    const lead = await tx.lead.deleteMany({ where: { id: { in: ids } } });

    return {
      leads: lead.count,
      conversas: conv.count,
      mensagens: msg.count,
      negocios: neg.count,
    };
  });
}

export type ResultadoExcluirArquivar = {
  excluidos: number; // apagados de fato (sem historico, ou force)
  arquivados: number; // com historico -> arquivados (protegidos)
  arquivadosIds: string[];
};

// Regra de seguranca (Fatia 2.81): um lead SEM historico (sem conversa/negocio)
// e apagado de fato; um lead COM historico e ARQUIVADO (some das listas, mas
// preserva o rastro e evita erro de FK). Com `force=true`, apaga em cascata
// mesmo com historico (irreversivel). Retorna quantos foram para cada caminho.
export async function excluirOuArquivarLeads(
  leadIds: string[],
  force: boolean,
): Promise<ResultadoExcluirArquivar> {
  const ids = Array.from(new Set(leadIds)).filter(Boolean);
  if (ids.length === 0) return { excluidos: 0, arquivados: 0, arquivadosIds: [] };

  // Quem tem historico = tem conversa OU negocio.
  const [comConversa, comNegocio] = await Promise.all([
    prisma.conversa.findMany({
      where: { leadId: { in: ids } },
      select: { leadId: true },
      distinct: ["leadId"],
    }),
    prisma.negocio.findMany({
      where: { leadId: { in: ids } },
      select: { leadId: true },
      distinct: ["leadId"],
    }),
  ]);
  const comHistorico = new Set<string>([
    ...comConversa.map((c) => c.leadId),
    ...comNegocio.map((n) => n.leadId),
  ]);

  const semHistorico = ids.filter((id) => !comHistorico.has(id));
  const comHist = ids.filter((id) => comHistorico.has(id));

  // Sempre apaga os sem historico. Com force, apaga tambem os com historico.
  const paraApagar = force ? ids : semHistorico;
  const paraArquivar = force ? [] : comHist;

  let excluidos = 0;
  if (paraApagar.length > 0) {
    const r = await excluirLeadsCompleto(paraApagar);
    excluidos = r.leads;
  }
  let arquivados = 0;
  if (paraArquivar.length > 0) {
    const r = await prisma.lead.updateMany({
      where: { id: { in: paraArquivar }, arquivado: false },
      data: { arquivado: true, arquivadoEm: new Date() },
    });
    arquivados = r.count;
  }

  return { excluidos, arquivados, arquivadosIds: paraArquivar };
}
