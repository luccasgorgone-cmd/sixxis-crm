// Analise de perdidos por motivo. Escopo por dono/finalidade e periodo por
// fechadoEm. Admin sem agenteId ve todos; colaborador ve apenas os seus.
// GET /api/analise/perdidos?finalidade=VENDA|POS_VENDA&agenteId=&inicio=&fim=
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { temAcesso } from "@/lib/dono";
import { analisarPerdidos } from "@/lib/perdidos";
import { Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const admin = ehAdmin(agente.papel);
  const sp = req.nextUrl.searchParams;

  const f = sp.get("finalidade");
  if (f !== Finalidade.VENDA && f !== Finalidade.POS_VENDA) {
    return NextResponse.json({ erro: "finalidade invalida" }, { status: 400 });
  }
  const finalidade = f;

  // Escopo: admin pode escolher colaborador (ou todos); demais so os seus.
  let alvoId: string | null;
  if (admin) {
    alvoId = sp.get("agenteId") || null;
  } else {
    alvoId = agente.id;
    const eu = await prisma.agente.findUnique({
      where: { id: agente.id },
      select: { acessoVenda: true, acessoPosVenda: true },
    });
    if (!eu || !temAcesso(eu, finalidade)) {
      return NextResponse.json(
        { erro: "sem acesso a essa finalidade" },
        { status: 403 },
      );
    }
  }

  const inicioStr = sp.get("inicio");
  const fimStr = sp.get("fim");
  const inicio = inicioStr ? new Date(inicioStr) : null;
  const fim = fimStr ? new Date(fimStr) : null;

  const analise = await analisarPerdidos({ finalidade, alvoId, inicio, fim });
  return NextResponse.json(analise);
}
