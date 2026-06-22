// Edicao dos dados do CLIENTE (Lead): nomeManual, email, empresa, cpf,
// anotacoes. Dono (venda/pos-venda/atendente da conversa) ou ADMIN. Registra
// Atividade(EDICAO) com o que mudou.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { registrarAtividade } from "@/lib/atividade";
import { nomeEfetivo } from "@/lib/cliente";
import { getIO } from "@/lib/socket";
import { AtividadeTipo } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Campos editaveis e seus rotulos para a descricao da atividade.
const CAMPOS: { chave: "nomeManual" | "email" | "empresa" | "cpf" | "anotacoes"; rotulo: string }[] = [
  { chave: "nomeManual", rotulo: "nome" },
  { chave: "email", rotulo: "email" },
  { chave: "empresa", rotulo: "empresa" },
  { chave: "cpf", rotulo: "CPF" },
  { chave: "anotacoes", rotulo: "anotacoes" },
];

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      pushName: true,
      nomeManual: true,
      telefone: true,
      email: true,
      empresa: true,
      cpf: true,
      anotacoes: true,
      aceitaContato: true,
      donoId: true,
      donoPosVendaId: true,
      conversas: { select: { agenteId: true } },
    },
  });
  if (!lead) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  const ehDono =
    lead.donoId === agente.id ||
    lead.donoPosVendaId === agente.id ||
    lead.conversas.some((c) => c.agenteId === agente.id);
  if (!ehAdmin(agente.papel) && !ehDono) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const data: Prisma.LeadUncheckedUpdateInput = {};
  const mudancas: string[] = [];

  for (const { chave, rotulo } of CAMPOS) {
    if (body[chave] === undefined) continue;
    const bruto = body[chave];
    const novo =
      bruto === null || String(bruto).trim() === "" ? null : String(bruto).trim();
    const atual = (lead[chave] as string | null) ?? null;
    if (novo !== atual) {
      (data as Record<string, unknown>)[chave] = novo;
      mudancas.push(rotulo);
    }
  }

  // Opt-out de comunicacoes em massa (boolean a parte dos campos de texto).
  if (typeof body.aceitaContato === "boolean" && body.aceitaContato !== lead.aceitaContato) {
    data.aceitaContato = body.aceitaContato;
    mudancas.push(body.aceitaContato ? "aceita contato" : "opt-out de contato");
  }

  if (mudancas.length === 0) {
    return NextResponse.json({ erro: "nada a atualizar" }, { status: 400 });
  }

  const atualizado = await prisma.lead.update({
    where: { id },
    data,
    select: {
      id: true,
      nome: true,
      pushName: true,
      nomeManual: true,
      telefone: true,
      email: true,
      empresa: true,
      cpf: true,
      anotacoes: true,
      fotoUrl: true,
    },
  });

  await registrarAtividade({
    leadId: id,
    agenteId: agente.id,
    tipo: AtividadeTipo.EDICAO,
    descricao: `Dados do cliente atualizados: ${mudancas.join(", ")}`,
  });

  getIO()?.emit("cliente:atualizado", {
    leadId: id,
    nome: nomeEfetivo(atualizado),
  });

  return NextResponse.json({
    lead: { ...atualizado, nomeEfetivo: nomeEfetivo(atualizado) },
  });
}
