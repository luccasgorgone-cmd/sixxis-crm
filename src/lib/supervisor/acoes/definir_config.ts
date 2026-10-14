// definir_config — ÚNICA ferramenta de escrita que não mexe em Negócio: altera a
// config do próprio Supervisor (limiares de métrica + varredura). Reversível: o
// snapshot `antes` guarda a config inteira, e `reverter` regrava ela. É por aqui
// que a IA, QUANDO O GESTOR MANDA, muda parâmetro pelo chat (ex.: "prazo de 1ª
// resposta para 30 min"). Fora de comando explícito, vira proposta (card), igual
// às outras. NÃO fala com cliente — é config interna.
import {
  carregarConfigEditavel,
  salvarConfigEditavel,
} from "../config";
import {
  aplicarPatchConfig,
  type ConfigEditavel,
  type PatchConfig,
} from "../tipos";
import {
  type Args,
  type FerramentaEscrita,
  type RegistroAcao,
  type ResultadoExec,
  type Validacao,
} from "./tipos";

// Chaves que pertencem a cada bloco (para tolerar o LLM mandando "flat").
const CHAVES_LIMIARES = [
  "prazo1aRespostaSeg",
  "metaPeriodoReais",
  "paradoDiasPadrao",
  "pesosCobertura",
  "metas",
];
const CHAVES_VARREDURA = [
  "ativa",
  "cadenciaMin",
  "semRespostaHoras",
  "vigia",
];

// Aceita tanto { limiares:{...}, varredura:{...} } quanto o formato "flat" com as
// chaves soltas no topo. Devolve o patch normalizado (ou null se vazio).
function normalizarPatch(args: Args): PatchConfig | null {
  const limiares: Record<string, unknown> = {};
  const varredura: Record<string, unknown> = {};

  const ninhoL = args.limiares;
  if (ninhoL && typeof ninhoL === "object" && !Array.isArray(ninhoL)) {
    Object.assign(limiares, ninhoL as Record<string, unknown>);
  }
  const ninhoV = args.varredura;
  if (ninhoV && typeof ninhoV === "object" && !Array.isArray(ninhoV)) {
    Object.assign(varredura, ninhoV as Record<string, unknown>);
  }
  for (const [k, v] of Object.entries(args)) {
    if (k === "limiares" || k === "varredura") continue;
    if (CHAVES_LIMIARES.includes(k)) limiares[k] = v;
    else if (CHAVES_VARREDURA.includes(k)) varredura[k] = v;
  }

  const temL = Object.keys(limiares).length > 0;
  const temV = Object.keys(varredura).length > 0;
  if (!temL && !temV) return null;
  return {
    ...(temL ? { limiares } : {}),
    ...(temV ? { varredura } : {}),
  };
}

// Descreve, em PT, o que muda do estado atual para o novo (para o preview/card).
function descreverMudancas(base: ConfigEditavel, novo: ConfigEditavel): string {
  const linhas: string[] = [];
  const bl = base.limiares;
  const nl = novo.limiares;
  if (bl.prazo1aRespostaSeg !== nl.prazo1aRespostaSeg) {
    linhas.push(
      `prazo de 1ª resposta: ${Math.round(bl.prazo1aRespostaSeg / 60)}min → ${Math.round(nl.prazo1aRespostaSeg / 60)}min`,
    );
  }
  if (bl.metaPeriodoReais !== nl.metaPeriodoReais) {
    const fmt = (v: number | null) => (v == null ? "sem meta" : `R$ ${v.toLocaleString("pt-BR")}`);
    linhas.push(`meta do período: ${fmt(bl.metaPeriodoReais)} → ${fmt(nl.metaPeriodoReais)}`);
  }
  if (bl.paradoDiasPadrao !== nl.paradoDiasPadrao) {
    linhas.push(`dias para "parado": ${bl.paradoDiasPadrao} → ${nl.paradoDiasPadrao}`);
  }
  for (const k of ["QUENTE", "MORNO", "FRIO"] as const) {
    if (bl.pesosCobertura[k] !== nl.pesosCobertura[k]) {
      linhas.push(`peso ${k}: ${bl.pesosCobertura[k]} → ${nl.pesosCobertura[k]}`);
    }
  }
  for (const chave of new Set([...Object.keys(bl.metas), ...Object.keys(nl.metas)])) {
    const a = bl.metas[chave];
    const b = nl.metas[chave];
    if (!a || !b || a.verde !== b.verde || a.amarelo !== b.amarelo) {
      linhas.push(`metas[${chave}]: ${a ? `${a.verde}/${a.amarelo}` : "—"} → ${b ? `${b.verde}/${b.amarelo}` : "—"}`);
    }
  }
  const bv = base.varredura;
  const nv = novo.varredura;
  if (bv.ativa !== nv.ativa) linhas.push(`varredura: ${bv.ativa ? "ligada" : "desligada"} → ${nv.ativa ? "ligada" : "desligada"}`);
  if (bv.cadenciaMin !== nv.cadenciaMin) linhas.push(`cadência da varredura: ${bv.cadenciaMin}min → ${nv.cadenciaMin}min`);
  if (bv.semRespostaHoras !== nv.semRespostaHoras) linhas.push(`horas sem resposta: ${bv.semRespostaHoras}h → ${nv.semRespostaHoras}h`);
  for (const k of ["semResposta", "semProximoPasso", "parado", "primeiraResposta"] as const) {
    if (bv.vigia[k] !== nv.vigia[k]) linhas.push(`vigiar ${k}: ${bv.vigia[k] ? "sim" : "não"} → ${nv.vigia[k] ? "sim" : "não"}`);
  }
  return linhas.length ? linhas.join("; ") : "nenhuma alteração efetiva";
}

async function resolverNovo(
  args: Args,
): Promise<{ ok: true; base: ConfigEditavel; novo: ConfigEditavel } | { ok: false; erro: string }> {
  const patch = normalizarPatch(args);
  if (!patch) return { ok: false, erro: "nenhum parâmetro reconhecido para alterar" };
  const base = await carregarConfigEditavel();
  const r = aplicarPatchConfig(base, patch);
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true, base, novo: r.valor };
}

async function validar(args: Args): Promise<Validacao> {
  const r = await resolverNovo(args);
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}

async function preview(args: Args): Promise<string> {
  const r = await resolverNovo(args);
  if (!r.ok) return `Alterar configuração (inválida: ${r.erro}).`;
  return `Alterar configuração do Supervisor — ${descreverMudancas(r.base, r.novo)}.`;
}

async function executar(args: Args): Promise<ResultadoExec> {
  const r = await resolverNovo(args);
  if (!r.ok) return { ok: false, erro: r.erro, antes: null, depois: null };
  await salvarConfigEditavel(r.novo);
  return {
    ok: true,
    antes: r.base as unknown as Record<string, unknown>,
    depois: r.novo as unknown as Record<string, unknown>,
  };
}

async function reverter(registro: RegistroAcao): Promise<ResultadoExec> {
  const antes = registro.antesJson as ConfigEditavel | null;
  if (!antes || !antes.limiares || !antes.varredura) {
    return { ok: false, erro: "sem snapshot de config para reverter", antes: null, depois: null };
  }
  const atual = await carregarConfigEditavel();
  await salvarConfigEditavel(antes);
  return {
    ok: true,
    antes: atual as unknown as Record<string, unknown>,
    depois: antes as unknown as Record<string, unknown>,
  };
}

export const definirConfig: FerramentaEscrita = {
  nome: "definir_config",
  titulo: "Alterar configuração",
  reversivel: true,
  descricao:
    "Altera a configuração do Supervisor (limiares de métrica e varredura). Config interna — não envia nada a cliente. Args: { limiares?: { prazo1aRespostaSeg, metaPeriodoReais, paradoDiasPadrao, pesosCobertura:{QUENTE,MORNO,FRIO}, metas }, varredura?: { ativa, cadenciaMin, semRespostaHoras, vigia:{semResposta,semProximoPasso,parado,primeiraResposta} } }. Mande só os campos que mudam.",
  inputSchema: {
    type: "object",
    properties: {
      limiares: {
        type: "object",
        description: "campos de limiar a alterar (só os que mudam)",
      },
      varredura: {
        type: "object",
        description: "campos da varredura a alterar (só os que mudam)",
      },
    },
    additionalProperties: true,
  },
  preview,
  validar,
  executar,
  reverter,
};
