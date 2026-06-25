// Endereco individual: editar (PATCH) e remover (DELETE). Gate pelo lead dono.
// Auditoria (ACOMPANHAMENTO) na timeline do cliente.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeGerenciarLead } from "@/lib/autorizacao";
import { registrarAtividade } from "@/lib/atividade";
import { AtividadeTipo } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPOS = [
  "apelido",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
] as const;

type CampoEndereco = (typeof CAMPOS)[number];

function limpar(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const atual = await prisma.endereco.findUnique({ where: { id } });
  if (!atual) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  if (!(await podeGerenciarLead(agente, atual.leadId))) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  for (const c of CAMPOS) {
    if (body[c] === undefined) continue;
    let v = limpar(body[c]);
    if (c === "uf" && v) v = v.toUpperCase().slice(0, 2);
    data[c] = v;
  }
  const marcarPrincipal =
    typeof body.principal === "boolean" ? body.principal : undefined;

  if (Object.keys(data).length === 0 && marcarPrincipal === undefined) {
    return NextResponse.json({ erro: "nada a atualizar" }, { status: 400 });
  }

  const endereco = await prisma.$transaction(async (tx) => {
    if (marcarPrincipal === true) {
      await tx.endereco.updateMany({
        where: { leadId: atual.leadId },
        data: { principal: false },
      });
    }
    return tx.endereco.update({
      where: { id },
      data: {
        ...data,
        ...(marcarPrincipal !== undefined ? { principal: marcarPrincipal } : {}),
      },
    });
  });

  await registrarAtividade({
    leadId: atual.leadId,
    agenteId: agente.id,
    tipo: AtividadeTipo.ACOMPANHAMENTO,
    descricao: `Endereco atualizado (por ${agente.nome ?? "colaborador"})`,
  });

  return NextResponse.json({ endereco });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const atual = await prisma.endereco.findUnique({ where: { id } });
  if (!atual) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  if (!(await podeGerenciarLead(agente, atual.leadId))) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  await prisma.endereco.delete({ where: { id } });

  await registrarAtividade({
    leadId: atual.leadId,
    agenteId: agente.id,
    tipo: AtividadeTipo.ACOMPANHAMENTO,
    descricao: `Endereco removido (por ${agente.nome ?? "colaborador"})`,
  });

  return NextResponse.json({ ok: true });
}
