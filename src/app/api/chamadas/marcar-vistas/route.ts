// Marca as chamadas do ESCOPO do usuario como vistas (ao abrir a aba). Nao-admin
// marca so as suas; admin marca todas (overseer). Zera o badge.
import { NextResponse } from "next/server";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const where: Prisma.ChamadaWhereInput = {
    visto: false,
    ...(ehAdmin(agente.papel) ? {} : { agenteId: agente.id }),
  };
  const res = await prisma.chamada.updateMany({ where, data: { visto: true } });
  return NextResponse.json({ atualizadas: res.count });
}
