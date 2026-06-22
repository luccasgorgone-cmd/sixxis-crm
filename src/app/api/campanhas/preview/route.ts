// Preview de uma campanha: resolve a lista (mesmo motor da criacao) e devolve
// total, amostra e pulados (opt-out / sem canal). Nao grava nada.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { temAcesso } from "@/lib/dono";
import { resolverDestinatarios, normalizarFiltro } from "@/lib/campanha";
import { Finalidade, CanalEnvio } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const admin = ehAdmin(agente.papel);

  let body: {
    finalidade?: string;
    canal?: string;
    filtro?: unknown;
    escopo?: string;
    agenteId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  if (
    body.finalidade !== Finalidade.VENDA &&
    body.finalidade !== Finalidade.POS_VENDA
  ) {
    return NextResponse.json({ erro: "finalidade invalida" }, { status: 400 });
  }
  const finalidade = body.finalidade;
  const canal =
    body.canal === CanalEnvio.SMS || body.canal === CanalEnvio.EMAIL
      ? body.canal
      : CanalEnvio.WHATSAPP;

  // Escopo: admin pode "todos" ou um colaborador; demais so a propria carteira.
  let alvoId: string | null = agente.id;
  let todos = false;
  if (admin) {
    if (body.escopo === "todos") {
      todos = true;
      alvoId = null;
    } else if (body.agenteId) {
      alvoId = body.agenteId;
    } else {
      todos = true;
      alvoId = null;
    }
  } else {
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

  const { incluidos, puladosOptOut, puladosSemCanal } =
    await resolverDestinatarios({
      finalidade,
      canal,
      filtro: normalizarFiltro(body.filtro),
      alvoId,
      todos,
    });

  return NextResponse.json({
    total: incluidos.length,
    amostra: incluidos.slice(0, 5).map((d) => ({
      nomeEfetivo: d.nomeEfetivo,
      destino: d.destino,
    })),
    pulados: {
      optOut: puladosOptOut,
      semCanal: puladosSemCanal,
      total: puladosOptOut + puladosSemCanal,
    },
  });
}
