// LIMPEZA GERAL de dados operacionais de TESTE. Script MANUAL — NUNCA roda no
// boot/seed. Apaga todos os clientes (leads) e tudo ligado a eles, PRESERVANDO
// a configuracao (equipe, etapas, etiquetas, empresas, produtos de interesse,
// numeros, horarios, modelos/respostas, Meta, alertas SLA, roteamento).
//
// Como rodar no host de producao (com DATABASE_URL no ambiente):
//   npx tsx scripts/limpar-dados-teste.ts
//
// Idempotente: rodar 2x nao quebra (deleteMany em tabela vazia retorna 0).
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main(): Promise<void> {
  console.log("[limpeza] iniciando limpeza de dados operacionais de teste...");

  // Tudo em UMA transacao, na ordem correta de FKs (filhos antes dos pais).
  const [
    mensagens,
    alertas,
    historicos,
    leadEtiquetas,
    notas,
    atividades,
    lembretes,
    tarefas,
    orcamentos,
    campanhaDestinos,
    leadProdutos,
    enderecos,
    notificacoes,
    conversas,
    negocios,
    campanhas,
    leads,
  ] = await prisma.$transaction([
    prisma.mensagem.deleteMany({}),
    prisma.alertaNegocio.deleteMany({}),
    prisma.historicoNegocio.deleteMany({}),
    prisma.leadEtiqueta.deleteMany({}),
    prisma.nota.deleteMany({}),
    prisma.atividade.deleteMany({}),
    prisma.lembrete.deleteMany({}),
    prisma.tarefa.deleteMany({}),
    prisma.orcamento.deleteMany({}),
    prisma.campanhaDestino.deleteMany({}),
    prisma.leadProdutoInteresse.deleteMany({}),
    prisma.endereco.deleteMany({}),
    prisma.notificacao.deleteMany({}),
    prisma.conversa.deleteMany({}),
    prisma.negocio.deleteMany({}),
    prisma.campanha.deleteMany({}),
    prisma.lead.deleteMany({}),
  ]);

  // Zera os ponteiros de round-robin (dependiam de dados apagados).
  const ponteiros = await prisma.configRoteamento.updateMany({
    data: { ponteiroAgenteId: null, ponteiroPosVendaId: null },
  });

  console.log("[limpeza] concluida. Resumo do que foi apagado:");
  console.table({
    leads: leads.count,
    conversas: conversas.count,
    mensagens: mensagens.count,
    negocios: negocios.count,
    historicos: historicos.count,
    alertasSla: alertas.count,
    atividades: atividades.count,
    notas: notas.count,
    lembretes: lembretes.count,
    tarefas: tarefas.count,
    orcamentos: orcamentos.count,
    leadEtiquetas: leadEtiquetas.count,
    leadProdutosInteresse: leadProdutos.count,
    enderecos: enderecos.count,
    notificacoes: notificacoes.count,
    campanhas: campanhas.count,
    campanhaDestinos: campanhaDestinos.count,
    ponteirosRoteamentoZerados: ponteiros.count,
  });
  console.log(
    "[limpeza] PRESERVADOS: agentes, etapas, etiquetas, empresas faturadas, " +
      "produtos de interesse, numeros, horarios/logo/Meta (ConfiguracaoCRM), " +
      "modelos/respostas, alertas SLA e a config de roteamento.",
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[limpeza] FALHOU:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
