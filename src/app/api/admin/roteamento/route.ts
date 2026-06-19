// Admin: configuracao do roteamento. GET retorna config + vendedores na ordem
// do ciclo + quem e o proximo (ponteiro). PATCH altera flags. POST reseta ciclo.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { Finalidade } from "@/generated/prisma/enums";
import { filtroEquipe } from "@/lib/dono";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function pegarConfig() {
  const existente = await prisma.configRoteamento.findFirst();
  if (existente) return existente;
  return prisma.configRoteamento.create({ data: {} });
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const config = await pegarConfig();
  // Fila de VENDA (acesso). O ciclo de pos-venda usa a mesma logica com a
  // fila de pos-venda; aqui exibimos a de venda (mesma da 2.4).
  const vendedores = await prisma.agente.findMany({
    where: filtroEquipe(Finalidade.VENDA),
    orderBy: { criadoEm: "asc" },
    select: { id: true, nome: true, papel: true },
  });

  // Proximo do ciclo (mesma logica do engine).
  let proximoId: string | null = null;
  if (vendedores.length > 0) {
    const idx = config.ponteiroAgenteId
      ? vendedores.findIndex((v) => v.id === config.ponteiroAgenteId)
      : -1;
    const prox = idx === -1 ? 0 : (idx + 1) % vendedores.length;
    proximoId = vendedores[prox].id;
  }

  return NextResponse.json({
    config: {
      estrategia: config.estrategia,
      ativo: config.ativo,
      respeitarDono: config.respeitarDono,
      ponteiroAgenteId: config.ponteiroAgenteId,
    },
    vendedores,
    proximoId,
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: { ativo?: boolean; respeitarDono?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const config = await pegarConfig();
  const atualizada = await prisma.configRoteamento.update({
    where: { id: config.id },
    data: {
      ...(body.ativo !== undefined ? { ativo: body.ativo } : {}),
      ...(body.respeitarDono !== undefined
        ? { respeitarDono: body.respeitarDono }
        : {}),
    },
  });
  return NextResponse.json({
    config: {
      estrategia: atualizada.estrategia,
      ativo: atualizada.ativo,
      respeitarDono: atualizada.respeitarDono,
      ponteiroAgenteId: atualizada.ponteiroAgenteId,
    },
  });
}

// Reseta o ciclo (ponteiro volta ao inicio).
export async function POST(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const config = await pegarConfig();
  await prisma.configRoteamento.update({
    where: { id: config.id },
    data: { ponteiroAgenteId: null },
  });
  return NextResponse.json({ ok: true });
}
