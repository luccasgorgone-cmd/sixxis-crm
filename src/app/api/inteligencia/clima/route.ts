// Inteligencia Regional: clima atual + previsao por UF (capital de referencia).
// Cache PERSISTENTE (ClimaCacheUF, por uf+dias): a resposta e sempre montada a
// partir do ULTIMO BOM de cada UF no banco. Um fetch que falha NUNCA apaga o bom
// existente, entao "Atualizar" nunca reduz o numero de UFs com dado. Sem refresh,
// UFs com < 3h nem chamam a API (servem do banco). Ver lib/clima-cache.
// GET /api/inteligencia/clima?dias=7&refresh=0  (agente logado)
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { CAPITAIS } from "@/lib/capitais";
import {
  TTL_MS,
  buscarUFComRetry,
  mapLimit,
  ufSemDado,
  type ClimaUF,
  type ClimaUFResp,
  type ClimaResultado,
} from "@/lib/clima-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOTE = 5; // UFs buscadas em paralelo por vez (nao as 27 de uma vez)

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const diasParam = Number(sp.get("dias"));
  const dias = diasParam === 14 ? 14 : 7; // apenas {7,14}, default 7
  const refresh = sp.get("refresh") === "1";
  const agora = Date.now();

  const ufs = Object.keys(CAPITAIS);

  // Ultimo bom de cada UF (deste periodo) no banco.
  const rows = await prisma.climaCacheUF.findMany({ where: { dias } });
  const porUFAtual = new Map<string, { dados: ClimaUF; atualizadoEm: Date }>();
  for (const r of rows) {
    porUFAtual.set(r.uf, {
      dados: r.dados as unknown as ClimaUF,
      atualizadoEm: r.atualizadoEm,
    });
  }

  // Quais UFs re-buscar: no refresh, todas; senao, so as ausentes ou > 3h.
  const aBuscar = ufs.filter((uf) => {
    if (refresh) return true;
    const r = porUFAtual.get(uf);
    if (!r) return true;
    return agora - r.atualizadoEm.getTime() > TTL_MS;
  });

  // Busca com concorrencia limitada + 1 retry por UF.
  const resultados = await mapLimit(aBuscar, LOTE, (uf) =>
    buscarUFComRetry(uf, dias),
  );

  // Upsert SO em sucesso; falha nao toca a linha existente (preserva o bom).
  const nowDate = new Date();
  for (const r of resultados) {
    if (r.erro) continue;
    await prisma.climaCacheUF.upsert({
      where: { uf_dias: { uf: r.uf, dias } },
      create: { uf: r.uf, dias, dados: r as object, atualizadoEm: nowDate },
      update: { dados: r as object, atualizadoEm: nowDate },
    });
    porUFAtual.set(r.uf, { dados: r, atualizadoEm: nowDate });
  }

  // Monta a resposta a partir do ultimo bom (nunca "sem dado" se existe bom).
  let maisRecente: string | null = null;
  const porUF: ClimaUFResp[] = ufs.map((uf) => {
    const r = porUFAtual.get(uf);
    if (!r) {
      return { ...ufSemDado(uf), atualizadoEm: null, stale: false };
    }
    const iso = r.atualizadoEm.toISOString();
    if (!maisRecente || iso > maisRecente) maisRecente = iso;
    return {
      ...r.dados,
      atualizadoEm: iso,
      stale: agora - r.atualizadoEm.getTime() > TTL_MS,
    };
  });

  const resultado: ClimaResultado = {
    dias,
    atualizadoEm: maisRecente,
    fonte: "Open-Meteo",
    porUF,
  };
  return NextResponse.json(resultado);
}
