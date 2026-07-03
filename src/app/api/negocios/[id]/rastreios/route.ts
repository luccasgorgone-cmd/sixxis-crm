// Rastreios de um negocio: adicionar codigo (POST). MULTIPLOS por negocio.
// Escopo: dono do negocio ou admin (podeAcessarNegocio). Vale venda e pos-venda.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeAcessarNegocio } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: { codigo?: string; transportadora?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const codigo = String(body?.codigo ?? "").trim();
  if (!codigo) {
    return NextResponse.json({ erro: "codigo obrigatorio" }, { status: 400 });
  }
  const transportadora =
    body.transportadora == null || String(body.transportadora).trim() === ""
      ? null
      : String(body.transportadora).trim();

  const negocio = await prisma.negocio.findUnique({
    where: { id },
    select: { id: true, agenteId: true },
  });
  if (!negocio) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  if (!podeAcessarNegocio(agente, negocio.agenteId)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const rastreio = await prisma.rastreioNegocio.create({
    data: { negocioId: negocio.id, codigo, transportadora },
  });

  return NextResponse.json({
    rastreio: {
      id: rastreio.id,
      codigo: rastreio.codigo,
      transportadora: rastreio.transportadora,
      criadoEm: rastreio.criadoEm,
    },
  });
}
