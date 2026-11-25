// Contrato dourado C31 — custo bounded do relogio de SLA em dias uteis.
//
// O ticker de SLA chama minutosUteisEntre para milhares de negocios a cada
// minuto. Este contrato usa um ano de calendario por chamada para impedir que a
// criacao repetida de formatadores de fuso volte a bloquear o event loop.
import assert from "node:assert";
import { performance } from "node:perf_hooks";
import {
  minutosUteisEntre,
  type DiaHorario,
} from "../../src/lib/horario";

const HORARIOS: DiaHorario[] = [
  { dia: 0, aberto: false, faixas: [] },
  { dia: 1, aberto: true, faixas: [{ inicio: "08:00", fim: "18:00" }] },
  { dia: 2, aberto: true, faixas: [{ inicio: "08:00", fim: "18:00" }] },
  { dia: 3, aberto: true, faixas: [{ inicio: "08:00", fim: "18:00" }] },
  { dia: 4, aberto: true, faixas: [{ inicio: "08:00", fim: "18:00" }] },
  { dia: 5, aberto: true, faixas: [{ inicio: "08:00", fim: "18:00" }] },
  { dia: 6, aberto: false, faixas: [] },
];

const REPETICOES = 200;
const LIMITE_MS = 1_500;
const DE = new Date("2025-11-25T12:00:00Z");
const ATE = new Date("2026-11-25T12:00:00Z");

const soQuarta = (inicio: string, fim: string): DiaHorario[] => [
  { dia: 3, aberto: true, faixas: [{ inicio, fim }] },
];

const soDomingo = (inicio: string, fim: string): DiaHorario[] => [
  { dia: 0, aberto: true, faixas: [{ inicio, fim }] },
];

// Alternar fuso nao pode reutilizar o formatador anterior por engano.
const inicioHora = new Date("2026-11-25T12:00:00Z");
const fimHora = new Date("2026-11-25T13:00:00Z");
assert.equal(
  minutosUteisEntre(
    inicioHora,
    fimHora,
    soQuarta("09:00", "10:00"),
    [],
    "America/Sao_Paulo",
  ),
  60,
);
assert.equal(
  minutosUteisEntre(inicioHora, fimHora, soQuarta("09:00", "10:00"), [], "UTC"),
  0,
);
assert.equal(
  minutosUteisEntre(
    inicioHora,
    fimHora,
    soQuarta("09:00", "10:00"),
    [],
    "America/Sao_Paulo",
  ),
  60,
);

// O SLA conta minutos de parede no horario local. A faixa 00:00-04:00 vale
// 240 minutos mesmo quando o relogio pula ou repete uma hora em Nova York.
assert.equal(
  minutosUteisEntre(
    new Date("2026-03-08T05:00:00Z"),
    new Date("2026-03-08T08:00:00Z"),
    soDomingo("00:00", "04:00"),
    [],
    "America/New_York",
  ),
  240,
  "spring-forward deve preservar minutos de parede locais",
);
assert.equal(
  minutosUteisEntre(
    new Date("2026-11-01T04:00:00Z"),
    new Date("2026-11-01T09:00:00Z"),
    soDomingo("00:00", "04:00"),
    [],
    "America/New_York",
  ),
  240,
  "fall-back deve preservar minutos de parede locais",
);

// Fuso IANA invalido continua no fallback local existente.
const tzOriginal = process.env.TZ;
process.env.TZ = "UTC";
try {
  assert.equal(
    minutosUteisEntre(
      inicioHora,
      fimHora,
      soQuarta("12:00", "13:00"),
      [],
      "fuso/invalido",
    ),
    60,
  );
} finally {
  if (tzOriginal === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = tzOriginal;
  }
}
assert.equal(
  process.env.TZ,
  tzOriginal,
  "o contrato deve restaurar TZ sem criar a string undefined",
);

const inicio = performance.now();
let total = 0;
for (let i = 0; i < REPETICOES; i++) {
  total += minutosUteisEntre(
    DE,
    ATE,
    HORARIOS,
    [],
    "America/Sao_Paulo",
  );
}
const decorridoMs = performance.now() - inicio;

// 261 dias uteis x 600 min/dia x 200 repeticoes.
assert.equal(total, 31_320_000, "o cache de formatador nao pode mudar o relogio");
assert.ok(
  decorridoMs < LIMITE_MS,
  `carga do relogio SLA levou ${decorridoMs.toFixed(0)}ms (limite ${LIMITE_MS}ms)`,
);

console.log(
  `C31 horario performance: total=${total}, repeticoes=${REPETICOES}, ` +
    `tempo=${decorridoMs.toFixed(0)}ms (<${LIMITE_MS}ms)`,
);
