// Corrige leads que foram nomeados como "Voce" por causa de um bug de ingestao
// (mensagens de SAIDA — fromMe — traziam pushName="Voce"/nome da conta e eram
// usadas para nomear o cliente). Script MANUAL — NUNCA roda no boot/seed.
//
// Acao: para todo Lead com pushName='Voce' OU nome='Voce' (e SEM override
// manual do atendente), zera pushName e nome (SET NULL). O lead volta a exibir
// o telefone ate uma mensagem de ENTRADA trazer o nome real. NAO apaga leads e
// NUNCA toca no nomeManual (override do atendente).
//
// Como rodar no host de producao (com DATABASE_URL no ambiente):
//   npx tsx scripts/corrigir-nomes-voce.ts
//
// Idempotente: rodar 2x nao quebra (na 2a vez nada casa e retorna 0).
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main(): Promise<void> {
  console.log('[corrige-voce] procurando leads nomeados como "Voce"...');

  const afetados = await prisma.lead.updateMany({
    where: {
      // Sem override manual do atendente: nao mexemos em nomes escolhidos a mao.
      OR: [{ nomeManual: null }, { nomeManual: "" }],
      AND: {
        OR: [{ pushName: "Você" }, { nome: "Você" }],
      },
    },
    data: { pushName: null, nome: null },
  });

  console.log(`[corrige-voce] concluido. Leads corrigidos: ${afetados.count}`);
  console.log(
    "[corrige-voce] Estes leads voltam a exibir o telefone ate uma mensagem " +
      "de entrada trazer o nome real. Nenhum lead foi apagado; nomeManual intacto.",
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[corrige-voce] FALHOU:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
