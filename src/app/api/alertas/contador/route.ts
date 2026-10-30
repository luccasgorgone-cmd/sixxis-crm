// Contador de alertas de SLA NAO resolvidos do agente (admin: de todos). Usado
// pelo badge no menu/topbar.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { AlertaNivel } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  // So conta o que esta EM ATRASO (VERMELHO). AMARELO (vencendo) e aviso visual
  // no card, nao entra no sino de atraso.
  const total = await prisma.alertaNegocio.count({
    where: {
      resolvidoEm: null,
      nivel: AlertaNivel.VERMELHO,
      negocio: ehAdmin(agente.papel) ? {} : { agenteId: agente.id },
    },
  });
  return NextResponse.json({ total });
}
