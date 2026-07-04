// Parceiros (tecnicos): listar (com filtros) e criar. Leitura: qualquer agente
// logado. Escrita (POST): ADMIN e POS_VENDA. Isolado de Lead/Negocio/metricas.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import {
  podeGerenciarParceiros,
  resolverLocal,
  parseFrete,
  textoOuNull,
  filtrosParceiro,
  parseCategorias,
} from "@/lib/parceiro";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializar(p: {
  fretePadrao: Prisma.Decimal | null;
  [k: string]: unknown;
}) {
  return { ...p, fretePadrao: p.fretePadrao == null ? null : Number(p.fretePadrao) };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const parceiros = await prisma.parceiro.findMany({
    where: filtrosParceiro(req.nextUrl.searchParams),
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });
  return NextResponse.json({
    parceiros: parceiros.map(serializar),
    podeGerenciar: podeGerenciarParceiros(agente.papel, agente.acessoPosVenda),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  if (!podeGerenciarParceiros(agente.papel, agente.acessoPosVenda)) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const nome = textoOuNull(body.nome);
  if (!nome) {
    return NextResponse.json({ erro: "nome obrigatorio" }, { status: 400 });
  }
  const telefone = textoOuNull(body.telefone);
  const { uf, regiao } = resolverLocal({ telefone, uf: textoOuNull(body.uf) });

  const parceiro = await prisma.parceiro.create({
    data: {
      nome,
      telefone,
      cidade: textoOuNull(body.cidade),
      uf,
      regiao,
      email: textoOuNull(body.email),
      especialidade: textoOuNull(body.especialidade),
      categorias: parseCategorias(body.categorias),
      observacoes: textoOuNull(body.observacoes),
      fretePadrao: parseFrete(body.fretePadrao),
      freteObs: textoOuNull(body.freteObs),
      ativo: body.ativo === undefined ? true : Boolean(body.ativo),
    },
  });
  return NextResponse.json({ parceiro: serializar(parceiro) });
}
