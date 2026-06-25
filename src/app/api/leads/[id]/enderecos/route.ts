// Enderecos de um cliente: listar (GET) e criar (POST). Varios por cliente; um
// pode ser marcado principal. Gate: dono do cliente (venda/pos), dono da
// conversa ou admin. Auditoria (ACOMPANHAMENTO) ao criar.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeGerenciarLead } from "@/lib/autorizacao";
import { registrarAtividade } from "@/lib/atividade";
import { AtividadeTipo } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Campos de texto aceitos no corpo (saneados para null quando vazios).
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

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await podeGerenciarLead(agente, id))) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const enderecos = await prisma.endereco.findMany({
    where: { leadId: id },
    orderBy: [{ principal: "desc" }, { criadoEm: "asc" }],
  });
  return NextResponse.json({ enderecos });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await podeGerenciarLead(agente, id))) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const dados: Record<CampoEndereco, string | null> = {} as Record<
    CampoEndereco,
    string | null
  >;
  for (const c of CAMPOS) dados[c] = limpar(body[c]);
  if (dados.uf) dados.uf = dados.uf.toUpperCase().slice(0, 2);
  const principal = Boolean(body.principal);

  // Precisa de ao menos um campo util para nao gravar endereco vazio.
  if (CAMPOS.every((c) => dados[c] === null)) {
    return NextResponse.json(
      { erro: "informe ao menos um campo do endereco" },
      { status: 400 },
    );
  }

  // Se marcar como principal, os demais deixam de ser. Tudo em transacao.
  const endereco = await prisma.$transaction(async (tx) => {
    if (principal) {
      await tx.endereco.updateMany({
        where: { leadId: id },
        data: { principal: false },
      });
    }
    return tx.endereco.create({
      data: { leadId: id, ...dados, principal },
    });
  });

  const resumo = [dados.logradouro, dados.numero, dados.cidade, dados.uf]
    .filter(Boolean)
    .join(", ");
  await registrarAtividade({
    leadId: id,
    agenteId: agente.id,
    tipo: AtividadeTipo.ACOMPANHAMENTO,
    descricao: `Endereco adicionado${resumo ? `: ${resumo}` : ""} (por ${agente.nome ?? "colaborador"})`,
  });

  return NextResponse.json({ endereco });
}
