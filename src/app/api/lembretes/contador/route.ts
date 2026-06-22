// Contador do sino: {vencidos, hoje} de lembretes PENDENTES. Escopo "meus" por
// padrao; admin pode pedir escopo=todos.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { fimDoDia } from "@/lib/lembrete";
import { StatusLembrete } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const admin = ehAdmin(agente.papel);
  const todos = admin && req.nextUrl.searchParams.get("escopo") === "todos";
  const dono = todos ? {} : { agenteId: agente.id };

  const agora = new Date();
  const fimHoje = fimDoDia(undefined, agora);

  const [vencidos, hoje] = await Promise.all([
    prisma.lembrete.count({
      where: { ...dono, status: StatusLembrete.PENDENTE, dataHora: { lt: agora } },
    }),
    prisma.lembrete.count({
      where: {
        ...dono,
        status: StatusLembrete.PENDENTE,
        dataHora: { gte: agora, lte: fimHoje },
      },
    }),
  ]);

  return NextResponse.json({ vencidos, hoje });
}
