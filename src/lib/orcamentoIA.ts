// TETO DE GASTO do Agente de Atendimento (Sol/Luna) — WORKORDER_ATENDIMENTO_
// OMNICHANNEL, decisao do Luccas via `main` em 14/08/2026: modelo Gemini
// Flash-Lite, teto de $10 USD/mes pra fase de sandbox. Mesmo espirito do
// `openrouter-budget-check.sh` do workspace do `main` (alerta proativo antes
// de estourar) — MAS aqui a semantica e diferente e mais critica: Gemini (e
// qualquer provider pago desta lista) NAO e saldo pre-pago como o OpenRouter.
// Sem essa trava, gastar alem do teto e SILENCIOSO ate a fatura chegar. Por
// isso este modulo e um HARD STOP, nao so um alerta: ao atingir o teto, NENHUMA
// chamada paga nova acontece — luna.ts cai em handoff automatico.
//
// FONTE DA VERDADE DO GASTO: SolEvento.custoEstimado (ja gravado por decisao,
// ver solEvento.ts + custoIA.ts). Somamos o mes corrente (fuso America/Sao_
// Paulo, mesmo fuso que o resto do CRM usa pra "dia"/"mes" — ver metricas/
// route.ts). NAO reinventamos contagem paralela: e a mesma fonte que o
// dashboard /api/admin/ia/metricas ja exibe.
import { prisma } from "./prisma";
import { Prisma } from "../generated/prisma/client";
import { modeloTemPreco } from "./custoIA";

const FUSO = "America/Sao_Paulo";

// Teto padrao ($10/mes) — decisao do Luccas de 14/08/2026 pra fase de sandbox.
// Ajustavel via env sem precisar de deploy de codigo novo (AGENTE_IA_TETO_
// MENSAL_USD), mas o valor gravado aqui e o combinado: se a env var nao
// existir, usamos ESTE numero, nunca um default arbitrario diferente do que
// foi decidido.
export const TETO_MENSAL_USD_PADRAO = 10;

// Fracao do teto a partir da qual avisamos no log (proativo, nao bloqueia) —
// mesmo espirito do alerta do openrouter-budget-check.sh, adaptado pra teto
// "estoura de verdade" em vez de saldo que so cai.
const FRACAO_ALERTA = 0.8;

export function tetoMensalConfigurado(): number {
  const bruto = process.env.AGENTE_IA_TETO_MENSAL_USD;
  const n = bruto ? Number(bruto) : NaN;
  return Number.isFinite(n) && n > 0 ? n : TETO_MENSAL_USD_PADRAO;
}

// Inicio do mes corrente no fuso do CRM, como Date UTC equivalente — usado no
// filtro `criadoEm >= inicio` (SolEvento.criadoEm e armazenado em UTC; o
// calculo de "1o dia do mes local" precisa nascer no fuso certo antes de
// converter, senao early-month vira do mes anterior/seguinte perto da virada).
export function inicioDoMesAtual(agora: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    year: "numeric",
    month: "numeric",
  }).formatToParts(agora);
  const ano = Number(partes.find((p) => p.type === "year")?.value);
  const mes = Number(partes.find((p) => p.type === "month")?.value); // 1-12
  // Meio-dia UTC do dia 1 do mes/ano locais: qualquer fuso do Brasil (UTC-2 a
  // UTC-5) cai dentro do MESMO dia civil, entao o resultado nunca escorrega
  // pro mes errado por causa de fuso. Nao precisamos do instante exato de
  // "00:00 local" — so precisamos garantir que a fronteira caia no dia certo.
  return new Date(Date.UTC(ano, mes - 1, 1, 12, 0, 0));
}

// Soma o custoEstimado (USD) de todos os SolEvento do mes corrente. Eventos
// com custoEstimado NULL (sem preco na tabela, ou anteriores a SOL-2) NAO
// entram na soma — mesma limitacao ja documentada em custoIA.ts/metricas.
// Por isso a checagem de orcamento SO e confiavel para modelos com preco
// conhecido (ver custoIA.ts); um modelo sem preco cadastrado bypassaria o
// teto silenciosamente, entao `verificarOrcamentoMensal` recusa esse caso
// explicitamente (ver `semPrecoConhecido` abaixo).
export async function gastoMesAtualUsd(agora: Date = new Date()): Promise<number> {
  const inicio = inicioDoMesAtual(agora);
  const r = await prisma.$queryRaw<{ total: Prisma.Decimal | null }[]>`
    SELECT SUM("custoEstimado") AS total
    FROM "SolEvento"
    WHERE "criadoEm" >= ${inicio}
  `;
  const v = r[0]?.total;
  if (v === null || v === undefined) return 0;
  return Number(v.toString());
}

export type ResultadoOrcamento = {
  ok: boolean;
  gastoAtual: number;
  teto: number;
  // Presente so quando ok=false ou perto do teto — motivo interno pro log/
  // telemetria, nunca vai pro cliente.
  motivo?: string;
  alerta?: boolean;
};

// Checagem PURA (sem I/O) — o nucleo da decisao, testavel isoladamente sem
// banco. Separada de `verificarOrcamentoMensal` (que busca o gasto real) para
// o comportamento do teto poder ser provado sem depender de dados de
// producao existirem.
export function avaliarOrcamento(gastoAtual: number, teto: number): ResultadoOrcamento {
  if (gastoAtual >= teto) {
    return {
      ok: false,
      gastoAtual,
      teto,
      motivo: `teto mensal de IA atingido: gasto US$ ${gastoAtual.toFixed(5)} >= teto US$ ${teto.toFixed(2)}`,
    };
  }
  const alerta = gastoAtual >= teto * FRACAO_ALERTA;
  return {
    ok: true,
    gastoAtual,
    teto,
    alerta,
    ...(alerta
      ? {
          motivo: `gasto proximo do teto: US$ ${gastoAtual.toFixed(5)} de US$ ${teto.toFixed(2)} (${Math.round((gastoAtual / teto) * 100)}%)`,
        }
      : {}),
  };
}

// Checagem completa (busca o gasto real no banco + aplica o teto configurado).
// NUNCA lanca: falha ao consultar o banco e tratada como "nao ok" (mais seguro
// recusar uma chamada paga do que arriscar estourar por causa de uma falha de
// leitura). Chamar ANTES de qualquer requisicao a um provider pago.
//
// `modelo`: OBRIGATORIO. Um modelo SEM preco conhecido (fora de
// custoIA.ts:PRECO_POR_MILHAO) faria `custoEstimado` devolver null pra sempre
// -> esses eventos NUNCA entram na soma de `gastoMesAtualUsd` -> o teto seria
// contornado silenciosamente por um simples typo/modelo novo nao cadastrado.
// Por isso RECUSAMOS explicitamente chamar um modelo sem preco na tabela, em
// vez de deixar a soma "parecer" zero.
export async function verificarOrcamentoMensal(
  modelo: string,
  agora: Date = new Date(),
): Promise<ResultadoOrcamento> {
  const teto = tetoMensalConfigurado();
  if (!modeloTemPreco(modelo)) {
    const motivo = `modelo "${modelo}" sem preco cadastrado em custoIA.ts — recusando por seguranca (o teto nao consegue medir o gasto deste modelo)`;
    console.error(`[orcamentoIA] ${motivo}`);
    return { ok: false, gastoAtual: NaN, teto, motivo };
  }
  try {
    const gastoAtual = await gastoMesAtualUsd(agora);
    const resultado = avaliarOrcamento(gastoAtual, teto);
    if (resultado.alerta) {
      console.warn(`[orcamentoIA] ${resultado.motivo}`);
    }
    if (!resultado.ok) {
      console.error(`[orcamentoIA] ${resultado.motivo}`);
    }
    return resultado;
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error(`[orcamentoIA] falha ao consultar gasto do mes: ${motivo}`);
    return {
      ok: false,
      gastoAtual: NaN,
      teto,
      motivo: `falha ao verificar orcamento (recusando por seguranca): ${motivo}`,
    };
  }
}
