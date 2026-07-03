// Inteligencia Regional: clima atual + previsao por UF (capital de referencia).
// Cache PERSISTENTE (ClimaCacheUF, por uf+dias): a resposta e sempre montada a
// partir do ULTIMO BOM de cada UF no banco. Um fetch que falha NUNCA apaga o bom
// existente.
//
// STALE-WHILE-REVALIDATE (Fatia 2.49): o endpoint RESPONDE NA HORA com o cache
// (mesmo vencido/stale) e dispara a re-busca das UFs vencidas/ausentes em
// BACKGROUND (fire-and-forget, upsert so em sucesso). So bloqueia quando NAO ha
// NENHUM dado em cache (primeira vez), e mesmo assim com TETO de tempo. Assim o
// clima nunca "pendura" o request e o front nao cai no fallback de densidade.
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
// Teto de tempo SO no caminho de cache vazio (primeira vez). Nunca penduramos
// o request alem disto; o que faltar completa no proximo request/background.
const TETO_CACHE_VAZIO_MS = 8_000;

type EntradaCache = { dados: ClimaUF; atualizadoEm: Date };

// Grava o resultado de uma UF (so em sucesso) no cache persistente.
async function upsertUF(uf: string, dias: number, dados: ClimaUF, quando: Date) {
  await prisma.climaCacheUF.upsert({
    where: { uf_dias: { uf, dias } },
    create: { uf, dias, dados: dados as object, atualizadoEm: quando },
    update: { dados: dados as object, atualizadoEm: quando },
  });
}

// Evita disparar varias reconstrucoes concorrentes para o mesmo periodo (uma
// requisicao ja cobre todas as UFs vencidas daquele `dias`).
const emReconstrucao = new Set<number>();

// Re-busca em BACKGROUND (sem await no request) as UFs vencidas/ausentes e faz o
// upsert de cada sucesso. Erros sao capturados aqui — nunca derrubam o processo.
function reconstruirEmBackground(dias: number, aBuscar: string[]): void {
  if (aBuscar.length === 0 || emReconstrucao.has(dias)) return;
  emReconstrucao.add(dias);
  void (async () => {
    try {
      const resultados = await mapLimit(aBuscar, LOTE, (uf) =>
        buscarUFComRetry(uf, dias),
      );
      const agora = new Date();
      for (const r of resultados) {
        if (r.erro) continue;
        try {
          await upsertUF(r.uf, dias, r, agora);
        } catch (e) {
          console.error(
            `[clima] falha ao gravar cache ${r.uf}/${dias}:`,
            e instanceof Error ? e.message : String(e),
          );
        }
      }
    } catch (e) {
      console.error(
        `[clima] reconstrucao em background falhou (dias=${dias}):`,
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      emReconstrucao.delete(dias);
    }
  })();
}

// Cache VAZIO (primeira vez): preenche o maximo de UFs dentro de um TETO de
// tempo, gravando cada sucesso e atualizando o mapa. Para de lancar novos lotes
// quando o teto vence; o restante fica "sem dado" e completa depois.
async function preencherComTeto(
  dias: number,
  aBuscar: string[],
  porUFAtual: Map<string, EntradaCache>,
  tetoMs: number,
): Promise<void> {
  const limite = Date.now() + tetoMs;
  for (let i = 0; i < aBuscar.length; i += LOTE) {
    if (Date.now() >= limite) break;
    const lote = aBuscar.slice(i, i + LOTE);
    const res = await Promise.all(lote.map((uf) => buscarUFComRetry(uf, dias)));
    const agora = new Date();
    for (const r of res) {
      if (r.erro) continue;
      try {
        await upsertUF(r.uf, dias, r, agora);
      } catch (e) {
        console.error(
          `[clima] falha ao gravar cache ${r.uf}/${dias}:`,
          e instanceof Error ? e.message : String(e),
        );
      }
      porUFAtual.set(r.uf, { dados: r, atualizadoEm: agora });
    }
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const diasParam = Number(sp.get("dias"));
  // Janelas suportadas: {3,7,14,16}. 16 e o teto de forecast diario da Open-Meteo;
  // valor invalido degrada para 7 (default).
  const dias = [3, 7, 14, 16].includes(diasParam) ? diasParam : 7;
  const refresh = sp.get("refresh") === "1";
  const agora = Date.now();

  const ufs = Object.keys(CAPITAIS);

  // Ultimo bom de cada UF (deste periodo) no banco.
  const rows = await prisma.climaCacheUF.findMany({ where: { dias } });
  const porUFAtual = new Map<string, EntradaCache>();
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

  if (porUFAtual.size === 0) {
    // Cache totalmente vazio (primeira vez): preenche com teto e responde o que
    // conseguiu; o restante completa depois. Nunca pendura alem do teto.
    await preencherComTeto(dias, aBuscar, porUFAtual, TETO_CACHE_VAZIO_MS);
    // O que ainda faltou segue sendo buscado em background.
    const faltando = ufs.filter((uf) => !porUFAtual.has(uf));
    reconstruirEmBackground(dias, faltando);
  } else {
    // Ha cache (mesmo stale): responde NA HORA e atualiza em background. Vale
    // inclusive para ?refresh=1 (o botao Atualizar tem debounce/cooldown no front).
    reconstruirEmBackground(dias, aBuscar);
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
      // stale = vencido pelo TTL. Ainda e clima bom (so velho); o front usa.
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
