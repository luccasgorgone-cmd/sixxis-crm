// Job diario de aniversarios: para cada cliente que faz aniversario HOJE, gera
// uma Notificacao ANIVERSARIO para o(s) dono(s) do cliente (venda e/ou pos-venda).
// Idempotente: nao duplica no mesmo dia (criarNotificacaoUnica desde 00:00 SP).
import { prisma } from "./prisma";
import { nomeEfetivo } from "./cliente";
import { criarNotificacaoUnica } from "./notificacao";

// Data "hoje" no fuso de operacao (America/Sao_Paulo, UTC-3 fixo no Brasil).
function hojeSP(): { mes: number; dia: number; inicio: Date } {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date()); // "AAAA-MM-DD"
  const [, mes, dia] = iso.split("-").map(Number);
  return { mes, dia, inicio: new Date(`${iso}T00:00:00-03:00`) };
}

export async function notificarAniversarios(): Promise<void> {
  try {
    const { mes, dia, inicio } = hojeSP();

    // Clientes com data de nascimento e ao menos um dono.
    const leads = await prisma.lead.findMany({
      where: {
        dataNascimento: { not: null },
        OR: [{ donoId: { not: null } }, { donoPosVendaId: { not: null } }],
      },
      select: {
        id: true,
        nome: true,
        pushName: true,
        nomeManual: true,
        telefone: true,
        dataNascimento: true,
        donoId: true,
        donoPosVendaId: true,
      },
    });

    let criadas = 0;
    for (const l of leads) {
      const d = l.dataNascimento;
      if (!d) continue;
      // dataNascimento gravada em UTC meia-noite: ler em UTC para o dia/mes certo.
      if (d.getUTCMonth() + 1 !== mes || d.getUTCDate() !== dia) continue;

      const nome = nomeEfetivo(l);
      const donos = [...new Set([l.donoId, l.donoPosVendaId].filter(Boolean))];
      for (const agenteId of donos as string[]) {
        const criou = await criarNotificacaoUnica(
          {
            agenteId,
            tipo: "ANIVERSARIO",
            titulo: `Aniversario de ${nome}`,
            descricao: "E o aniversario do cliente hoje. Que tal enviar uma mensagem de feliz aniversario?",
            link: "/clientes",
            leadId: l.id,
          },
          inicio,
        );
        if (criou) criadas++;
      }
    }
    console.log(
      criadas > 0
        ? `[aniversarios] ${criadas} notificacoes de aniversario criadas`
        : "[aniversarios] nenhum aniversario hoje",
    );
  } catch (erro) {
    console.error(
      `[aniversarios] falha: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}
