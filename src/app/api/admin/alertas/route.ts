// Admin: configuracao de alertas de SLA por (finalidade, etapa). Somente ADMIN.
// GET: etapas ABERTAS (por funil) + configs existentes.
// POST: cria/atualiza (upsert) a config de uma (finalidade, etapa).
// PATCH: atualiza parcialmente uma config por id (toggle ativo / som / minutos).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { Finalidade, TipoEtapa } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizarFinalidade(v: unknown): Finalidade | null {
  return v === Finalidade.VENDA || v === Finalidade.POS_VENDA ? v : null;
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const etapas = await prisma.etapa.findMany({
    where: { ativo: true, tipo: TipoEtapa.ABERTA },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true, ordem: true, finalidade: true },
  });
  const configs = await prisma.configAlertaSla.findMany({
    select: {
      id: true,
      finalidade: true,
      etapaId: true,
      minutosParaAlerta: true,
      ativo: true,
      som: true,
    },
  });
  return NextResponse.json({ etapas, configs });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: {
    finalidade?: unknown;
    etapaId?: string;
    minutosParaAlerta?: unknown;
    ativo?: boolean;
    som?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const finalidade = normalizarFinalidade(body.finalidade);
  const etapaId = String(body.etapaId ?? "");
  const minutos = Number(body.minutosParaAlerta);
  if (!finalidade || !etapaId) {
    return NextResponse.json(
      { erro: "finalidade e etapa sao obrigatorias" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(minutos) || minutos < 1) {
    return NextResponse.json(
      { erro: "minutosParaAlerta deve ser >= 1" },
      { status: 400 },
    );
  }
  const config = await prisma.configAlertaSla.upsert({
    where: { finalidade_etapaId: { finalidade, etapaId } },
    create: {
      finalidade,
      etapaId,
      minutosParaAlerta: Math.round(minutos),
      ativo: body.ativo ?? true,
      som: body.som ?? null,
    },
    update: {
      minutosParaAlerta: Math.round(minutos),
      ...(body.ativo !== undefined ? { ativo: body.ativo } : {}),
      ...(body.som !== undefined ? { som: body.som } : {}),
    },
  });
  return NextResponse.json({ config });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: {
    id?: string;
    minutosParaAlerta?: unknown;
    ativo?: boolean;
    som?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const id = String(body.id ?? "");
  if (!id) {
    return NextResponse.json({ erro: "id obrigatorio" }, { status: 400 });
  }
  const data: {
    minutosParaAlerta?: number;
    ativo?: boolean;
    som?: string | null;
  } = {};
  if (body.minutosParaAlerta !== undefined) {
    const m = Number(body.minutosParaAlerta);
    if (!Number.isFinite(m) || m < 1) {
      return NextResponse.json(
        { erro: "minutosParaAlerta deve ser >= 1" },
        { status: 400 },
      );
    }
    data.minutosParaAlerta = Math.round(m);
  }
  if (body.ativo !== undefined) data.ativo = body.ativo;
  if (body.som !== undefined) data.som = body.som;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ erro: "nada a atualizar" }, { status: 400 });
  }
  const config = await prisma.configAlertaSla.update({ where: { id }, data });
  return NextResponse.json({ config });
}
