// Inteligencia Regional: DETALHE de clima de um estado (drill-down do drawer).
// Curva horaria de hoje (24h) + historico diario dos ultimos ~30 dias +
// tendencia (media das maximas 7d vs 7d anteriores). Cache PERSISTENTE por UF
// reusando ClimaCacheUF com `dias` sentinela (-1 horaria, -2 historico), mesma
// disciplina da 2.40: um fetch que falha NUNCA sobrescreve o ultimo bom; TTL
// horaria ~3h, historico ~12h. Sempre 200 com o melhor dado (partes degradam).
// GET /api/inteligencia/clima/estado?uf=XX  (agente logado)
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { CAPITAIS } from "@/lib/capitais";
import {
  TTL_HORARIA_MS,
  TTL_HISTORICO_MS,
  DIAS_HORARIA,
  DIAS_HISTORICO,
  buscarHorariaComRetry,
  buscarHistoricoComRetry,
  calcularTendencia,
  type BlocoHoraria,
  type BlocoHistorico,
  type DetalheClimaResp,
} from "@/lib/clima-estado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const uf = (req.nextUrl.searchParams.get("uf") ?? "").trim().toUpperCase();
  const cap = CAPITAIS[uf];
  if (!/^[A-Z]{2}$/.test(uf) || !cap) {
    return NextResponse.json({ erro: "uf invalida" }, { status: 400 });
  }
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const agora = Date.now();

  // Ultimo bom de cada bloco (horaria/historico) desta UF no banco.
  const rows = await prisma.climaCacheUF.findMany({
    where: { uf, dias: { in: [DIAS_HORARIA, DIAS_HISTORICO] } },
  });
  const linhaHor = rows.find((r) => r.dias === DIAS_HORARIA) ?? null;
  const linhaHist = rows.find((r) => r.dias === DIAS_HISTORICO) ?? null;

  const horStale =
    !linhaHor || refresh || agora - linhaHor.atualizadoEm.getTime() > TTL_HORARIA_MS;
  const histStale =
    !linhaHist ||
    refresh ||
    agora - linhaHist.atualizadoEm.getTime() > TTL_HISTORICO_MS;

  // Re-busca em paralelo apenas o que esta ausente/stale.
  const [novaHor, novoHist] = await Promise.all([
    horStale ? buscarHorariaComRetry(uf) : Promise.resolve<BlocoHoraria | null>(null),
    histStale
      ? buscarHistoricoComRetry(uf)
      : Promise.resolve<BlocoHistorico | null>(null),
  ]);

  const nowDate = new Date();

  // Estado efetivo de cada bloco: novo bom -> usa e persiste; senao mantem o banco.
  let horBloco: BlocoHoraria | null = linhaHor
    ? (linhaHor.dados as unknown as BlocoHoraria)
    : null;
  let horAtualizadoEm: Date | null = linhaHor?.atualizadoEm ?? null;
  if (novaHor && !novaHor.erro) {
    await prisma.climaCacheUF.upsert({
      where: { uf_dias: { uf, dias: DIAS_HORARIA } },
      create: { uf, dias: DIAS_HORARIA, dados: novaHor as object, atualizadoEm: nowDate },
      update: { dados: novaHor as object, atualizadoEm: nowDate },
    });
    horBloco = novaHor;
    horAtualizadoEm = nowDate;
  }

  let histBloco: BlocoHistorico | null = linhaHist
    ? (linhaHist.dados as unknown as BlocoHistorico)
    : null;
  let histAtualizadoEm: Date | null = linhaHist?.atualizadoEm ?? null;
  if (novoHist && !novoHist.erro) {
    await prisma.climaCacheUF.upsert({
      where: { uf_dias: { uf, dias: DIAS_HISTORICO } },
      create: {
        uf,
        dias: DIAS_HISTORICO,
        dados: novoHist as object,
        atualizadoEm: nowDate,
      },
      update: { dados: novoHist as object, atualizadoEm: nowDate },
    });
    histBloco = novoHist;
    histAtualizadoEm = nowDate;
  }

  const historico = histBloco?.historico ?? [];
  const resp: DetalheClimaResp = {
    uf,
    capital: cap.capital,
    fonte: "Open-Meteo",
    horarioHoje: horBloco?.horarioHoje ?? [],
    horarioAtualizadoEm: horAtualizadoEm ? horAtualizadoEm.toISOString() : null,
    horarioErro: !horBloco || horBloco.horarioHoje.length === 0,
    historico,
    historicoAtualizadoEm: histAtualizadoEm ? histAtualizadoEm.toISOString() : null,
    historicoErro: !histBloco || historico.length === 0,
    tendencia: calcularTendencia(historico),
  };
  return NextResponse.json(resp);
}
