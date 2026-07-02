// Apaga com SEGURANCA o lead de teste "TESTE Validacao XZ" (telefone
// 5511987650001) criado durante o diagnostico da fatia 2.46. Guardas: so apaga
// se o nomeManual bater EXATAMENTE e se NAO houver mensagens reais. Apaga apenas
// esse lead e seus filhos (nunca toca em config nem em outros leads).
//
// Rodar no host com DATABASE_URL no ambiente:
//   npx tsx scripts/apagar-teste-xz.ts
//
// Idempotente: se o lead nao existir, apenas reporta e sai 0.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const TELEFONE = "5511987650001";
const NOME_MANUAL = "TESTE Validacao XZ";

async function main(): Promise<void> {
  const lead = await prisma.lead.findFirst({
    where: { telefone: TELEFONE },
    include: {
      conversas: { include: { _count: { select: { mensagens: true } } } },
    },
  });

  if (!lead) {
    console.log(`[apagar] nenhum lead com telefone ${TELEFONE}. Nada a fazer.`);
    return;
  }

  // Guarda 1: identidade exata (evita apagar o lead errado).
  if (lead.nomeManual !== NOME_MANUAL) {
    console.error(
      `[apagar] ABORTADO: nomeManual="${lead.nomeManual}" != "${NOME_MANUAL}". ` +
        "Nao e o lead de teste esperado; nada foi apagado.",
    );
    process.exitCode = 1;
    return;
  }

  // Guarda 2: sem mensagens reais.
  const totalMensagens = lead.conversas.reduce(
    (s, c) => s + c._count.mensagens,
    0,
  );
  if (totalMensagens > 0) {
    console.error(
      `[apagar] ABORTADO: o lead tem ${totalMensagens} mensagem(ns) real(is). ` +
        "Nao apago automaticamente.",
    );
    process.exitCode = 1;
    return;
  }

  const conversaIds = lead.conversas.map((c) => c.id);

  // Apaga filhos antes do lead (respeitando FKs), tudo numa transacao. So deste
  // lead. Endereco/negocio/etc. tem onDelete: Cascade, mas removemos explicito
  // o que nao cascateia por seguranca.
  const res = await prisma.$transaction(async (tx) => {
    if (conversaIds.length) {
      await tx.mensagem.deleteMany({ where: { conversaId: { in: conversaIds } } });
    }
    await tx.leadEtiqueta.deleteMany({ where: { leadId: lead.id } });
    await tx.nota.deleteMany({ where: { leadId: lead.id } });
    await tx.atividade.deleteMany({ where: { leadId: lead.id } });
    await tx.lembrete.deleteMany({ where: { leadId: lead.id } });
    await tx.tarefa.deleteMany({ where: { leadId: lead.id } });
    await tx.orcamento.deleteMany({ where: { leadId: lead.id } });
    await tx.leadProdutoInteresse.deleteMany({ where: { leadId: lead.id } });
    await tx.endereco.deleteMany({ where: { leadId: lead.id } });
    await tx.conversa.deleteMany({ where: { leadId: lead.id } });
    await tx.negocio.deleteMany({ where: { leadId: lead.id } });
    const del = await tx.lead.delete({ where: { id: lead.id } });
    return del;
  });

  console.log(
    `[apagar] OK: lead "${res.nomeManual}" (${res.id}, tel ${res.telefone}) apagado.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  })
  .catch(async (err) => {
    console.error("[apagar] FALHOU:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
