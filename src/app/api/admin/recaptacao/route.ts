// SOL-4 B5: campanhas de recaptacao (admin). Lista + cria + edita/arma/pausa.
//
//   GET   /api/admin/recaptacao          -> campanhas com metricas ao vivo
//   POST  /api/admin/recaptacao          -> cria (SEMPRE em RASCUNHO)
//   PATCH /api/admin/recaptacao?id=...   -> mensagem, limiteDiario, status
//
// ARMAR e a unica acao daqui que libera envio real. Por isso:
//   - criar NUNCA nasce armada;
//   - armar exige mensagem nao vazia e limite dentro do teto;
//   - o limite comeca baixo e o teto e duro (LIMITE_MAX) — a fatia existe para
//     DESCOBRIR o numero seguro subindo aos poucos, nao para digitar 1.000.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { getIO } from "@/lib/socket";
import { StatusCampanhaRecap } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE_PADRAO = 20;
// Teto duro do limite diario. Nao e opiniao sobre o numero certo — e um freio
// contra digitar 2000 sem querer num campo que dispara mensagem real.
const LIMITE_MAX = 300;
const MENSAGEM_MAX = 900;

function limiteValido(v: unknown): number | null {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n < 1 || n > LIMITE_MAX) return null;
  return n;
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });

  const campanhas = await prisma.campanhaRecaptacao.findMany({
    orderBy: { criadoEm: "desc" },
    take: 50,
  });
  if (campanhas.length === 0) {
    return NextResponse.json({ campanhas: [], limiteMax: LIMITE_MAX });
  }

  const ids = campanhas.map((c) => c.id);
  // Agregado no banco: contagem por status de cada campanha, numa consulta.
  const porStatus = await prisma.recaptacaoEnvio.groupBy({
    by: ["campanhaId", "status"],
    where: { campanhaId: { in: ids } },
    _count: { _all: true },
  });
  // Entregues/lidas vem do ack da bolha (JOIN por mensagemId). Sem ack da
  // Evolution isto fica 0 — e 0 aqui significa "sem confirmacao", nao "nao
  // chegou"; o painel diz isso em texto.
  const acks = await prisma.$queryRaw<
    { campanhaId: string; entregues: bigint; lidas: bigint }[]
  >`
    SELECT r."campanhaId"                                                AS "campanhaId",
           COUNT(*) FILTER (WHERE m."statusEnvio" IN ('ENTREGUE','LIDA')) AS entregues,
           COUNT(*) FILTER (WHERE m."statusEnvio" = 'LIDA')               AS lidas
    FROM "RecaptacaoEnvio" r
    JOIN "Mensagem" m ON m.id = r."mensagemId"
    WHERE r."campanhaId" = ANY(${ids})
    GROUP BY r."campanhaId"
  `;

  const zero = () => ({
    PENDENTE: 0,
    ENVIADO: 0,
    RESPONDIDO: 0,
    OPTOUT: 0,
    ERRO: 0,
    PULADO: 0,
  });
  const mapa: Record<string, ReturnType<typeof zero>> = {};
  for (const id of ids) mapa[id] = zero();
  for (const g of porStatus) mapa[g.campanhaId][g.status] = g._count._all;

  const ackPorId: Record<string, { entregues: number; lidas: number }> = {};
  for (const a of acks) {
    ackPorId[a.campanhaId] = {
      entregues: Number(a.entregues),
      lidas: Number(a.lidas),
    };
  }

  return NextResponse.json({
    limiteMax: LIMITE_MAX,
    campanhas: campanhas.map((c) => {
      const s = mapa[c.id];
      // "Alcancados" = saiu para o cliente, em qualquer desfecho posterior.
      const alcancados = s.ENVIADO + s.RESPONDIDO + s.OPTOUT;
      return {
        id: c.id,
        nome: c.nome,
        mensagemTemplate: c.mensagemTemplate,
        status: c.status,
        limiteDiario: c.limiteDiario,
        enviadosHoje: c.enviadosHoje,
        dataContadorDia: c.dataContadorDia,
        pausadaMotivo: c.pausadaMotivo,
        pausadaEm: c.pausadaEm,
        criadoEm: c.criadoEm,
        metricas: {
          pendentes: s.PENDENTE,
          alcancados,
          respondidos: s.RESPONDIDO,
          optouts: s.OPTOUT,
          erros: s.ERRO,
          pulados: s.PULADO,
          entregues: ackPorId[c.id]?.entregues ?? 0,
          lidas: ackPorId[c.id]?.lidas ?? 0,
          // Taxa de resposta sobre quem realmente recebeu.
          taxaResposta: alcancados > 0 ? s.RESPONDIDO / alcancados : 0,
        },
      };
    }),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const nome = String(body.nome ?? "").trim();
  const mensagemTemplate = String(body.mensagemTemplate ?? "").trim();
  if (!nome) return NextResponse.json({ erro: "nome obrigatorio" }, { status: 400 });
  if (!mensagemTemplate) {
    return NextResponse.json({ erro: "mensagem obrigatoria" }, { status: 400 });
  }
  if (mensagemTemplate.length > MENSAGEM_MAX) {
    return NextResponse.json(
      { erro: `mensagem acima de ${MENSAGEM_MAX} caracteres` },
      { status: 400 },
    );
  }

  const campanha = await prisma.campanhaRecaptacao.create({
    data: {
      nome,
      mensagemTemplate,
      limiteDiario: limiteValido(body.limiteDiario) ?? LIMITE_PADRAO,
      // NUNCA nasce armada, venha o que vier no corpo. Armar e um PATCH
      // separado e deliberado.
      status: StatusCampanhaRecap.RASCUNHO,
    },
  });
  return NextResponse.json({ campanha }, { status: 201 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ erro: "id obrigatorio" }, { status: 400 });

  const atual = await prisma.campanhaRecaptacao.findUnique({ where: { id } });
  if (!atual) return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const dados: Record<string, unknown> = {};

  if (typeof body.nome === "string" && body.nome.trim()) {
    dados.nome = body.nome.trim();
  }
  if (typeof body.mensagemTemplate === "string") {
    const m = body.mensagemTemplate.trim();
    if (!m) return NextResponse.json({ erro: "mensagem vazia" }, { status: 400 });
    if (m.length > MENSAGEM_MAX) {
      return NextResponse.json(
        { erro: `mensagem acima de ${MENSAGEM_MAX} caracteres` },
        { status: 400 },
      );
    }
    dados.mensagemTemplate = m;
  }
  if (body.limiteDiario !== undefined) {
    const n = limiteValido(body.limiteDiario);
    if (n === null) {
      return NextResponse.json(
        { erro: `limite diario deve estar entre 1 e ${LIMITE_MAX}` },
        { status: 400 },
      );
    }
    dados.limiteDiario = n;
  }

  if (typeof body.status === "string") {
    const novo = body.status as StatusCampanhaRecap;
    if (!(novo in StatusCampanhaRecap)) {
      return NextResponse.json({ erro: "status invalido" }, { status: 400 });
    }
    if (novo === StatusCampanhaRecap.ARMADA) {
      // Ultima validacao antes de liberar envio real.
      const msg = (dados.mensagemTemplate as string) ?? atual.mensagemTemplate;
      if (!msg.trim()) {
        return NextResponse.json(
          { erro: "nao da para armar sem mensagem" },
          { status: 400 },
        );
      }
      const lim = (dados.limiteDiario as number) ?? atual.limiteDiario;
      if (lim < 1 || lim > LIMITE_MAX) {
        return NextResponse.json(
          { erro: `limite diario invalido para armar (1..${LIMITE_MAX})` },
          { status: 400 },
        );
      }
      // Rearmar limpa o motivo da pausa anterior — senao o painel mostraria
      // para sempre o susto de ontem numa campanha que ja voltou.
      dados.pausadaMotivo = null;
      dados.pausadaEm = null;
    }
    if (novo === StatusCampanhaRecap.PAUSADA) {
      dados.pausadaMotivo =
        typeof body.pausadaMotivo === "string" && body.pausadaMotivo.trim()
          ? body.pausadaMotivo.trim()
          : "pausada manualmente pelo admin";
      dados.pausadaEm = new Date();
    }
    dados.status = novo;
  }

  const campanha = await prisma.campanhaRecaptacao.update({
    where: { id },
    data: dados,
  });
  getIO()?.emit("recaptacao:atualizada", { campanhaId: id });
  return NextResponse.json({ campanha });
}
