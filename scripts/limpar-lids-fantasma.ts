// Limpeza dos LEADS FANTASMA de @lid. Script MANUAL — NUNCA roda no boot/seed.
//
// Contexto (Fatia 2.37 C): "telefones" de 14-15 digitos sao @lid (mascaramento
// do WhatsApp). Ecos de mensagens de SAIDA a contatos nao-salvos viram lead
// fantasma; o numero real nao vem no payload. A ingestao ja nao cria novos
// (queue.ts). Aqui limpamos os que ja existem.
//
// Regra: para cada lead cujo telefone NAO e BR valido (provavel @lid):
//   - TEM alguma mensagem de ENTRADA (direcao=IN) em suas conversas -> cliente
//     real mascarado: PRESERVA.
//   - Nao tem entrada (so saida / sem mensagem) -> fantasma: exclui COMPLETO.
// Leads com telefone BR valido NUNCA sao tocados.
//
// Como rodar no host de producao (com DATABASE_URL no ambiente):
//   npx tsx scripts/limpar-lids-fantasma.ts            -> SIMULACAO (padrao)
//   npx tsx scripts/limpar-lids-fantasma.ts --apagar    -> exclui de verdade
//
// O padrao e SECO de proposito: apagar dado real nunca deve ser o que acontece
// quando alguem roda o script por engano. Sem a flag o script so imprime a
// tabela de candidatos e o resumo, e termina sem tocar em nada. A regra de
// decisao (nao-BR + sem entrada = fantasma) e a MESMA nos dois modos — o modo
// seco decide exatamente o que o modo real apagaria.
//
// Idempotente: rodar 2x nao quebra (na 2a vez os fantasmas ja nao existem).
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { ehTelefoneValidoBR } from "../src/lib/ddd";
import { excluirLeadsCompleto } from "../src/lib/exclusao";
import { nomeEfetivo } from "../src/lib/cliente";
import { DirecaoMsg } from "../src/generated/prisma/client";

// Exclusao so com pedido EXPLICITO. Qualquer outra coisa (inclusive nenhum
// argumento) e simulacao.
const APAGAR = process.argv.slice(2).some((a) => a === "--apagar" || a === "--confirm");

async function main(): Promise<void> {
  console.log(
    APAGAR
      ? "[limpar-lids] MODO EXCLUSAO (--apagar): vai apagar os fantasmas listados."
      : "[limpar-lids] MODO SIMULACAO (padrao): nada sera apagado.",
  );
  console.log("[limpar-lids] buscando leads com telefone nao-BR (provavel @lid)...");

  const leads = await prisma.lead.findMany({
    // Campos a mais que o necessario para decidir: a tabela do modo seco precisa
    // mostrar QUEM e cada candidato, nao so o id.
    select: {
      id: true,
      telefone: true,
      nome: true,
      pushName: true,
      nomeManual: true,
      criadoEm: true,
    },
  });
  const candidatos = leads.filter((l) => !ehTelefoneValidoBR(l.telefone));
  const candIds = candidatos.map((l) => l.id);
  console.log(
    `[limpar-lids] total leads=${leads.length} | LID (nao-BR)=${candidatos.length}`,
  );

  if (candidatos.length === 0) {
    console.log("[limpar-lids] nada a fazer.");
    return;
  }

  // Conversas dos candidatos (mensagem pertence a conversa via conversaId).
  const conversas = await prisma.conversa.findMany({
    where: { leadId: { in: candIds } },
    select: { id: true, leadId: true },
  });
  const convToLead = new Map(conversas.map((c) => [c.id, c.leadId]));
  const convIds = conversas.map((c) => c.id);

  // Quais leads tem ALGUMA mensagem de ENTRADA? (cliente real mascarado).
  // Na mesma varredura contamos as mensagens por lead, para a tabela do modo seco.
  const comEntrada = new Set<string>();
  const msgsPorLead = new Map<string, number>();
  const CH = 1000;
  for (let i = 0; i < convIds.length; i += CH) {
    const fatia = convIds.slice(i, i + CH);
    const [grupos, totais] = await Promise.all([
      prisma.mensagem.groupBy({
        by: ["conversaId"],
        where: { direcao: DirecaoMsg.IN, conversaId: { in: fatia } },
      }),
      prisma.mensagem.groupBy({
        by: ["conversaId"],
        where: { conversaId: { in: fatia } },
        _count: { _all: true },
      }),
    ]);
    for (const g of grupos) {
      const leadId = convToLead.get(g.conversaId);
      if (leadId) comEntrada.add(leadId);
    }
    for (const t of totais) {
      const leadId = convToLead.get(t.conversaId);
      if (leadId) {
        msgsPorLead.set(leadId, (msgsPorLead.get(leadId) ?? 0) + t._count._all);
      }
    }
  }

  const convsPorLead = new Map<string, number>();
  for (const c of conversas) {
    convsPorLead.set(c.leadId, (convsPorLead.get(c.leadId) ?? 0) + 1);
  }

  const preservados = candidatos.filter((l) => comEntrada.has(l.id));
  const fantasmas = candidatos.filter((l) => !comEntrada.has(l.id));

  // Tabela de CADA candidato — o que o dono confere antes de autorizar. Sai nos
  // dois modos: no seco e a previa; no real e o registro do que foi apagado.
  console.log(
    `\n[limpar-lids] candidatos (@lid = telefone nao-BR): ${candidatos.length}\n`,
  );
  console.table(
    candidatos.map((l) => {
      const entrada = comEntrada.has(l.id);
      return {
        id: l.id,
        nome: nomeEfetivo(l),
        telefone: l.telefone,
        digitos: l.telefone.replace(/\D/g, "").length,
        temEntrada: entrada ? "sim" : "nao",
        conversas: convsPorLead.get(l.id) ?? 0,
        mensagens: msgsPorLead.get(l.id) ?? 0,
        criadoEm: l.criadoEm.toISOString().slice(0, 16).replace("T", " "),
        decisao: entrada ? "PRESERVA" : "APAGA",
      };
    }),
  );
  console.log(
    `[limpar-lids] seriam PRESERVADOS ${preservados.length} (tem entrada) / ` +
      `seriam APAGADOS ${fantasmas.length} (so saida ou sem mensagem)`,
  );

  // Sem a flag, para aqui: nenhuma escrita aconteceu ate este ponto.
  if (!APAGAR) {
    console.log(
      "\n[limpar-lids] SIMULACAO: nada foi apagado.\n" +
        "[limpar-lids] rode com --apagar para executar a exclusao acima.",
    );
    return;
  }

  if (fantasmas.length === 0) {
    console.log("[limpar-lids] nenhum fantasma a apagar.");
    return;
  }

  // Exclui os fantasmas em lotes (uma transacao por lote via excluirLeadsCompleto).
  let apagados = { leads: 0, conversas: 0, mensagens: 0, negocios: 0 };
  const LT = 200;
  const fantasmaIds = fantasmas.map((l) => l.id);
  for (let i = 0; i < fantasmaIds.length; i += LT) {
    const r = await excluirLeadsCompleto(fantasmaIds.slice(i, i + LT));
    apagados = {
      leads: apagados.leads + r.leads,
      conversas: apagados.conversas + r.conversas,
      mensagens: apagados.mensagens + r.mensagens,
      negocios: apagados.negocios + r.negocios,
    };
  }

  console.log("[limpar-lids] concluido:");
  console.table({
    totalLeads: leads.length,
    lidNaoBR: candidatos.length,
    preservadosComEntrada: preservados.length,
    apagadosFantasma: apagados.leads,
    conversasApagadas: apagados.conversas,
    mensagensApagadas: apagados.mensagens,
    negociosApagados: apagados.negocios,
  });
  console.log(
    "[limpar-lids] Nenhum lead BR valido foi tocado; @lid com entrada preservados.",
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[limpar-lids] FALHOU:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
