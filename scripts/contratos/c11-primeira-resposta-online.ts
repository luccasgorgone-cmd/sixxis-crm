// Contrato dourado C11 — tempo de 1a resposta por PRESENCA (tempo online do dono).
//   npx tsx scripts/contratos/c11-primeira-resposta-online.ts
//
// Prova, sem banco/rede, a regra de segundos1aRespostaPorConversa + mediaSegundos:
//  - fallback wall-clock quando dono=null, sem rastreamento, ou janela antes do
//    cutover global de presenca (passado nunca regride);
//  - tempo ONLINE do dono (intersecao via segundosOnlineEntre) quando rastreado;
//  - 0 (nao fallback) quando rastreado mas offline no intervalo;
//  - denominador = conversas com fi/fo validos (fo > fi), igual ao de hoje.
import assert from "node:assert";
import {
  segundos1aRespostaPorConversa,
  mediaSegundos,
  type ConversaResp,
} from "../../src/lib/presenca/primeiraResposta";
import { type PeriodoOnline } from "../../src/lib/presenca/tempoOnline";

// Helper: media de 1a resposta (mesma composicao usada pela metrica real).
const media = (
  conversas: ConversaResp[],
  mapa: Map<string, PeriodoOnline[]>,
  cutover: Date | null,
) => mediaSegundos(segundos1aRespostaPorConversa(conversas, mapa, cutover));

let ok = 0;
let falhou = 0;
function caso(nome: string, fn: () => void): void {
  try {
    fn();
    ok++;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhou++;
    console.error(`FALHA  ${nome}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const t = (h: string) => new Date(`2026-10-20T${h}:00Z`);
// Cutover: presenca comecou a ser rastreada as 09:00.
const cutover = t("09:00");

caso("dono null -> fallback wall-clock", () => {
  const conversas: ConversaResp[] = [{ agenteId: null, fi: t("10:00"), fo: t("10:10") }];
  // fo apos cutover, mas sem dono -> fallback = 600s
  assert.equal(media(conversas, new Map(), cutover), 600);
});

caso("sem rastreamento no sistema (cutover null) -> fallback", () => {
  const conversas: ConversaResp[] = [{ agenteId: "a1", fi: t("10:00"), fo: t("10:30") }];
  assert.equal(media(conversas, new Map(), null), 1800);
});

caso("janela toda antes do cutover -> fallback (media == AVG wall-clock)", () => {
  // Ambas com fo <= cutover (09:00) -> fallback. Media = (600 + 1200)/2 = 900.
  const conversas: ConversaResp[] = [
    { agenteId: "a1", fi: t("08:00"), fo: t("08:10") }, // 600
    { agenteId: "a1", fi: t("08:30"), fo: t("08:50") }, // 1200
  ];
  const mapa = new Map<string, PeriodoOnline[]>();
  assert.equal(media(conversas, mapa, cutover), 900);
});

caso("dono online o intervalo todo -> online == wall-clock", () => {
  const conversas: ConversaResp[] = [{ agenteId: "a1", fi: t("10:00"), fo: t("10:30") }];
  const mapa = new Map<string, PeriodoOnline[]>([
    ["a1", [{ inicio: t("09:50"), fim: t("11:00") }]], // cobre [10:00,10:30]
  ]);
  assert.equal(media(conversas, mapa, cutover), 1800);
});

caso("rastreado mas offline no intervalo -> 0 (NAO fallback)", () => {
  // Agente rastreado (cutover 09:00 < fo), mas sem periodo cobrindo [10:00,10:30].
  const conversas: ConversaResp[] = [{ agenteId: "a1", fi: t("10:00"), fo: t("10:30") }];
  const mapa = new Map<string, PeriodoOnline[]>([
    ["a1", [{ inicio: t("08:00"), fim: t("08:30") }]], // antes da janela, nao cruza
  ]);
  assert.equal(media(conversas, mapa, cutover), 0);
});

caso("dono parcialmente online -> so a intersecao", () => {
  // Online so na 1a metade: [10:00,10:15] de [10:00,10:30] -> 900s.
  const conversas: ConversaResp[] = [{ agenteId: "a1", fi: t("10:00"), fo: t("10:30") }];
  const mapa = new Map<string, PeriodoOnline[]>([
    ["a1", [{ inicio: t("09:00"), fim: t("10:15") }]],
  ]);
  assert.equal(media(conversas, mapa, cutover), 900);
});

caso("denominador ignora fo <= fi; mistura online + fallback", () => {
  const conversas: ConversaResp[] = [
    { agenteId: "a1", fi: t("10:00"), fo: t("10:30") }, // online total -> 1800
    { agenteId: null, fi: t("11:00"), fo: t("11:10") }, // fallback -> 600
    { agenteId: "a1", fi: t("12:00"), fo: t("12:00") }, // fo==fi -> ignorado
  ];
  const mapa = new Map<string, PeriodoOnline[]>([
    ["a1", [{ inicio: t("09:00"), fim: t("13:00") }]],
  ]);
  // media = (1800 + 600) / 2 = 1200 (o 3o nao conta)
  assert.equal(media(conversas, mapa, cutover), 1200);
});

caso("vazio -> 0", () => {
  assert.equal(media([], new Map(), cutover), 0);
});

// Array por conversa (o que o % no prazo + histograma consomem): ordem e valores.
caso("segundos1aRespostaPorConversa: array online + fallback, fo<=fi fora", () => {
  const conversas: ConversaResp[] = [
    { agenteId: "a1", fi: t("10:00"), fo: t("10:30") }, // online total -> 1800
    { agenteId: "a1", fi: t("11:00"), fo: t("11:30") }, // offline rastreado -> 0
    { agenteId: null, fi: t("12:00"), fo: t("12:10") }, // fallback -> 600
    { agenteId: "a1", fi: t("13:00"), fo: t("13:00") }, // fo==fi -> fora
  ];
  const mapa = new Map<string, PeriodoOnline[]>([
    ["a1", [{ inicio: t("09:50"), fim: t("10:30") }]], // cobre so a 1a
  ]);
  assert.deepEqual(
    segundos1aRespostaPorConversa(conversas, mapa, cutover),
    [1800, 0, 600],
  );
});

caso("segundos1aRespostaPorConversa: cutover null -> tudo fallback", () => {
  const conversas: ConversaResp[] = [
    { agenteId: "a1", fi: t("10:00"), fo: t("10:10") }, // 600
    { agenteId: "a1", fi: t("11:00"), fo: t("11:30") }, // 1800
  ];
  assert.deepEqual(
    segundos1aRespostaPorConversa(conversas, new Map(), null),
    [600, 1800],
  );
});

console.log(`\nc11-primeira-resposta-online: ${ok} ok, ${falhou} falhou`);
if (falhou > 0) process.exit(1);
