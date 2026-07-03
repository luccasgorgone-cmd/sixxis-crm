// Contador de chamadas NAO VISTAS recentes (para o badge do icone). ESCOPO:
// nao-admin so conta as suas; admin conta todas. Recentes = ultimos 30 dias.
import { NextResponse } from "next/server";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const where: Prisma.ChamadaWhereInput = {
    visto: false,
    horaEm: { gte: desde },
    ...(ehAdmin(agente.papel) ? {} : { agenteId: agente.id }),
  };
  const total = await prisma.chamada.count({ where });
  return NextResponse.json({ total });
}
