// Metas do COLABORADOR (e visiveis a ele):
//  GET  -> minhas (COLABORADOR para mim) + EQUIPE que me incluem, com progresso,
//          flag podeEditar e criadoPorId (selo "definida por voce" x admin).
//  POST -> cria uma meta COLABORADOR para mim (criadoPorId = eu). Autonomia total.
// Nao afrouxa /api/admin/metas (admin continua usando aquela rota).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import {
  calcularProgresso,
  rankingMetrica,
  podeEditarMeta,
  type MetaBase,
} from "@/lib/metas";
import {
  EscopoMeta,
  Finalidade,
  MetricaMeta,
  PeriodoMeta,
  FinalidadeEtapa,
} from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ehEnum<T extends Record<string, string>>(
  e: T,
  v: unknown,
): v is T[keyof T] {
  return typeof v === "string" && Object.values(e).includes(v);
}

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const eu = await prisma.agente.findUnique({
    where: { id: agente.id },
    select: { acessoVenda: true, acessoPosVenda: true },
  });
  const acessoVenda = eu?.acessoVenda ?? false;
  const acessoPosVenda = eu?.acessoPosVenda ?? false;

  const finsEquipe: ("VENDA" | "POS_VENDA" | "AMBAS")[] = ["AMBAS"];
  if (acessoVenda) finsEquipe.push("VENDA");
  if (acessoPosVenda) finsEquipe.push("POS_VENDA");

  const [minhas, equipe] = await Promise.all([
    prisma.meta.findMany({
      where: { escopo: EscopoMeta.COLABORADOR, agenteId: agente.id, ativo: true },
      orderBy: { criadoEm: "desc" },
    }),
    prisma.meta.findMany({
      where: {
        escopo: EscopoMeta.EQUIPE,
        ativo: true,
        finalidade: { in: finsEquipe },
      },
      orderBy: { criadoEm: "desc" },
    }),
  ]);

  const agora = new Date();

  const minhasComProgresso = await Promise.all(
    minhas.map(async (m) => {
      const meta = m as MetaBase;
      const fin =
        meta.finalidade === "AMBAS"
          ? undefined
          : (meta.finalidade as Finalidade);
      const [progresso, ranking] = await Promise.all([
        calcularProgresso(meta, agora),
        rankingMetrica(
          { inicio: meta.inicio, fim: meta.fim },
          fin,
          meta.metrica,
          agente.id,
        ),
      ]);
      return {
        ...m,
        progresso,
        ranking,
        podeEditar: podeEditarMeta(agente, m),
      };
    }),
  );

  const equipeComProgresso = await Promise.all(
    equipe.map(async (m) => ({
      ...m,
      progresso: await calcularProgresso(m as MetaBase, agora),
      ranking: null,
      podeEditar: podeEditarMeta(agente, m),
    })),
  );

  return NextResponse.json({
    minhas: minhasComProgresso,
    equipe: equipeComProgresso,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const metrica = body.metrica;
  const periodo = body.periodo;
  const finalidade = (body.finalidade ?? FinalidadeEtapa.AMBAS) as unknown;
  const alvo = Number(body.alvo);
  const inicio = new Date(String(body.inicio ?? ""));
  const fim = new Date(String(body.fim ?? ""));

  if (!ehEnum(MetricaMeta, metrica)) {
    return NextResponse.json({ erro: "metrica invalida" }, { status: 400 });
  }
  if (!ehEnum(PeriodoMeta, periodo)) {
    return NextResponse.json({ erro: "periodo invalido" }, { status: 400 });
  }
  if (!ehEnum(FinalidadeEtapa, finalidade)) {
    return NextResponse.json({ erro: "finalidade invalida" }, { status: 400 });
  }
  if (!Number.isFinite(alvo) || alvo <= 0) {
    return NextResponse.json(
      { erro: "alvo deve ser um numero maior que zero" },
      { status: 400 },
    );
  }
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    return NextResponse.json({ erro: "datas invalidas" }, { status: 400 });
  }
  if (fim.getTime() <= inicio.getTime()) {
    return NextResponse.json(
      { erro: "o fim deve ser depois do inicio" },
      { status: 400 },
    );
  }

  // Colaborador so cria meta COLABORADOR para si, criada por si.
  const meta = await prisma.meta.create({
    data: {
      nome:
        typeof body.nome === "string" && body.nome.trim()
          ? body.nome.trim()
          : null,
      escopo: EscopoMeta.COLABORADOR,
      agenteId: agente.id,
      criadoPorId: agente.id,
      finalidade,
      metrica,
      alvo,
      periodo,
      inicio,
      fim,
      ativo: true,
    },
  });
  const progresso = await calcularProgresso(meta as MetaBase);
  return NextResponse.json({
    meta: { ...meta, progresso, podeEditar: true },
  });
}
