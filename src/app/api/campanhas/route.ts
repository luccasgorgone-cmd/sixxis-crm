// Campanhas: cria (POST, resolve lista + enfileira) e lista (GET).
//  - POST {finalidade, canal, modeloId|mensagem, assunto?, valoresDigitados, filtro, escopo|agenteId}
//  - GET (minhas; admin: todas, com filtros colaborador/canal/status/periodo).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { temAcesso } from "@/lib/dono";
import {
  resolverDestinatarios,
  normalizarFiltro,
  LIMITE_CAMPANHA,
} from "@/lib/campanha";
import { getCampaignsQueue } from "@/lib/queue";
import { getIO } from "@/lib/socket";
import {
  Finalidade,
  CanalEnvio,
  StatusCampanha,
  StatusDestino,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const admin = ehAdmin(agente.papel);
  const sp = req.nextUrl.searchParams;

  const where: Prisma.CampanhaWhereInput = admin ? {} : { agenteId: agente.id };
  // Filtros (admin): colaborador, canal, status, periodo (dias).
  if (admin && sp.get("agenteId")) where.agenteId = sp.get("agenteId")!;
  const canal = sp.get("canal");
  if (canal === "WHATSAPP" || canal === "SMS" || canal === "EMAIL") {
    where.canal = canal as CanalEnvio;
  }
  const status = sp.get("status");
  if (
    status === "RASCUNHO" ||
    status === "ENVIANDO" ||
    status === "CONCLUIDA" ||
    status === "CANCELADA"
  ) {
    where.status = status as StatusCampanha;
  }
  const dias = Number(sp.get("dias") ?? 0);
  if (dias > 0) {
    where.criadoEm = { gte: new Date(Date.now() - dias * 24 * 60 * 60 * 1000) };
  }

  const campanhas = await prisma.campanha.findMany({
    where,
    orderBy: { criadoEm: "desc" },
    take: 200,
    select: {
      id: true,
      finalidade: true,
      canal: true,
      assunto: true,
      mensagem: true,
      total: true,
      enviados: true,
      falhas: true,
      pulados: true,
      status: true,
      criadoEm: true,
      concluidoEm: true,
      modeloId: true,
      agente: { select: { id: true, nome: true } },
    },
  });

  return NextResponse.json({ campanhas });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const admin = ehAdmin(agente.papel);

  let body: {
    finalidade?: string;
    canal?: string;
    modeloId?: string | null;
    mensagem?: string;
    assunto?: string | null;
    valoresDigitados?: Record<string, string>;
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

  // Mensagem: do modelo (se informado) ou do texto livre. Quando do modelo,
  // copia as variacoes para o worker sortear por destinatario.
  let mensagem = (body.mensagem ?? "").trim();
  let modeloId: string | null = body.modeloId ?? null;
  let variacoes: string[] = [];
  if (modeloId) {
    const modelo = await prisma.respostaRapida.findUnique({
      where: { id: modeloId },
      select: { texto: true, variacoes: true },
    });
    if (!modelo) {
      return NextResponse.json({ erro: "modelo invalido" }, { status: 400 });
    }
    if (!mensagem) mensagem = modelo.texto;
    variacoes = modelo.variacoes ?? [];
  } else {
    modeloId = null;
  }
  if (!mensagem) {
    return NextResponse.json({ erro: "mensagem obrigatoria" }, { status: 400 });
  }

  // Escopo (igual ao preview).
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

  const filtro = normalizarFiltro(body.filtro);
  const { incluidos, puladosOptOut, puladosSemCanal } =
    await resolverDestinatarios({ finalidade, canal, filtro, alvoId, todos });

  if (incluidos.length === 0) {
    return NextResponse.json(
      { erro: "nenhum destinatario para esse recorte" },
      { status: 422 },
    );
  }
  if (incluidos.length > LIMITE_CAMPANHA) {
    return NextResponse.json(
      { erro: `limite de ${LIMITE_CAMPANHA} destinatarios por campanha excedido` },
      { status: 422 },
    );
  }

  const pulados = puladosOptOut + puladosSemCanal;
  const valores = body.valoresDigitados ?? {};

  // Cria campanha + destinos e ja entra em ENVIANDO.
  const campanha = await prisma.campanha.create({
    data: {
      agenteId: agente.id,
      finalidade,
      canal,
      modeloId,
      assunto: body.assunto?.trim() || null,
      mensagem,
      valoresJson: valores as Prisma.InputJsonValue,
      variacoesJson:
        variacoes.length > 0 ? (variacoes as Prisma.InputJsonValue) : undefined,
      filtroJson: filtro as unknown as Prisma.InputJsonValue,
      total: incluidos.length,
      pulados,
      status: StatusCampanha.ENVIANDO,
      iniciadoEm: new Date(),
      destinos: {
        create: incluidos.map((d) => ({
          leadId: d.leadId,
          destino: d.destino,
          status: StatusDestino.PENDENTE,
        })),
      },
    },
    select: { id: true, total: true, pulados: true, status: true },
  });

  // Enfileira o processamento (worker envia com throttle).
  await getCampaignsQueue().add(
    "enviar",
    { campanhaId: campanha.id },
    { jobId: campanha.id },
  );

  getIO()?.emit("campanha:nova", { campanhaId: campanha.id, agenteId: agente.id });

  return NextResponse.json({ campanha });
}
