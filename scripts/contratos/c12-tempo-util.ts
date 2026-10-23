// Contrato dourado C12 — tempo ÚTIL (minutos dentro do horário comercial, dias
// úteis, excluindo feriados). Base dos SLAs do Manual de Atendimento.
//   npx tsx scripts/contratos/c12-tempo-util.ts
import assert from "node:assert";
import { minutosUteisEntre, type DiaHorario } from "../../src/lib/horario";

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

// Horário comercial: Seg-Sex 09:00-18:00 (almoço ignorado p/ simplicidade do teste),
// Sáb/Dom fechado. Fuso SP (-03, sem DST).
const H: DiaHorario[] = [
  { dia: 0, aberto: false, faixas: [] },
  { dia: 1, aberto: true, faixas: [{ inicio: "09:00", fim: "18:00" }] },
  { dia: 2, aberto: true, faixas: [{ inicio: "09:00", fim: "18:00" }] },
  { dia: 3, aberto: true, faixas: [{ inicio: "09:00", fim: "18:00" }] },
  { dia: 4, aberto: true, faixas: [{ inicio: "09:00", fim: "18:00" }] },
  { dia: 5, aberto: true, faixas: [{ inicio: "09:00", fim: "18:00" }] },
  { dia: 6, aberto: false, faixas: [] },
];
// Horário -03:00 → para montar um instante local HH:MM uso sufixo -03:00.
const sp = (iso: string) => new Date(`${iso}-03:00`);

caso("mesmo dia, dentro do horário -> diferença direta", () => {
  // Qua 2026-10-21, 10:00 -> 12:00 = 120 min
  assert.equal(
    minutosUteisEntre(sp("2026-10-21T10:00:00"), sp("2026-10-21T12:00:00"), H, []),
    120,
  );
});

caso("clampa início antes da abertura", () => {
  // 07:00 -> 10:00 numa quarta: só conta 09:00-10:00 = 60
  assert.equal(
    minutosUteisEntre(sp("2026-10-21T07:00:00"), sp("2026-10-21T10:00:00"), H, []),
    60,
  );
});

caso("clampa fim depois do fechamento", () => {
  // 17:00 -> 22:00: só 17:00-18:00 = 60
  assert.equal(
    minutosUteisEntre(sp("2026-10-21T17:00:00"), sp("2026-10-21T22:00:00"), H, []),
    60,
  );
});

caso("fora do horário inteiro -> 0 (relógio começa na próxima abertura)", () => {
  // Qua 19:00 -> 20:00 = 0
  assert.equal(
    minutosUteisEntre(sp("2026-10-21T19:00:00"), sp("2026-10-21T20:00:00"), H, []),
    0,
  );
});

caso("atravessa a noite -> soma só o horário comercial de cada dia", () => {
  // Qua 17:00 -> Qui 10:00: Qua 17-18 (60) + Qui 09-10 (60) = 120
  assert.equal(
    minutosUteisEntre(sp("2026-10-21T17:00:00"), sp("2026-10-22T10:00:00"), H, []),
    120,
  );
});

caso("pula o fim de semana", () => {
  // Sex 2026-10-23 17:00 -> Seg 2026-10-26 10:00: Sex 17-18 (60) + Seg 09-10 (60) = 120
  assert.equal(
    minutosUteisEntre(sp("2026-10-23T17:00:00"), sp("2026-10-26T10:00:00"), H, []),
    120,
  );
});

caso("um dia útil cheio = 540 min (09-18)", () => {
  // Qua 00:00 -> Qui 00:00 = só o dia útil inteiro de quarta = 540
  assert.equal(
    minutosUteisEntre(sp("2026-10-21T00:00:00"), sp("2026-10-22T00:00:00"), H, []),
    540,
  );
});

caso("pula feriado", () => {
  // Qua 2026-10-21 é feriado -> 10:00-12:00 conta 0
  assert.equal(
    minutosUteisEntre(sp("2026-10-21T10:00:00"), sp("2026-10-21T12:00:00"), H, ["2026-10-21"]),
    0,
  );
});

caso("de >= ate -> 0", () => {
  assert.equal(
    minutosUteisEntre(sp("2026-10-21T12:00:00"), sp("2026-10-21T10:00:00"), H, []),
    0,
  );
});

caso("sem horários configurados -> fallback tempo corrido (minutos)", () => {
  // null horarios => conta todos os minutos (não restringe) = 180
  assert.equal(
    minutosUteisEntre(sp("2026-10-21T10:00:00"), sp("2026-10-21T13:00:00"), null, []),
    180,
  );
});

console.log(`\nc12-tempo-util: ${ok} ok, ${falhou} falhou`);
if (falhou > 0) process.exit(1);
