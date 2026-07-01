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
//   npx tsx scripts/limpar-lids-fantasma.ts
//
// Idempotente: rodar 2x nao quebra (na 2a vez os fantasmas ja nao existem).
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { ehTelefoneValidoBR } from "../src/lib/ddd";
import { excluirLeadsCompleto } from "../src/lib/exclusao";
import { DirecaoMsg } from "../src/generated/prisma/client";

async function main(): Promise<void> {
  console.log("[limpar-lids] buscando leads com telefone nao-BR (provavel @lid)...");

  const leads = await prisma.lead.findMany({
    select: { id: true, telefone: true },
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
  const comEntrada = new Set<string>();
  const CH = 1000;
  for (let i = 0; i < convIds.length; i += CH) {
    const fatia = convIds.slice(i, i + CH);
    const grupos = await prisma.mensagem.groupBy({
      by: ["conversaId"],
      where: { direcao: DirecaoMsg.IN, conversaId: { in: fatia } },
    });
    for (const g of grupos) {
      const leadId = convToLead.get(g.conversaId);
      if (leadId) comEntrada.add(leadId);
    }
  }

  const preservados = candidatos.filter((l) => comEntrada.has(l.id));
  const fantasmas = candidatos.filter((l) => !comEntrada.has(l.id));
  console.log(
    `[limpar-lids] preservados (tem entrada)=${preservados.length} | fantasmas (so saida)=${fantasmas.length}`,
  );

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
