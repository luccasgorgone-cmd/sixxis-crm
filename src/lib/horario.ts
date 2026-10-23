// Helper de horario comercial. estaAbertoAgora() decide se o CRM esta aberto
// agora, respeitando o fuso configurado. Reutilizavel por auto-reply/IA (futuro).

export type Faixa = { inicio: string; fim: string };
export type DiaHorario = { dia: number; aberto: boolean; faixas: Faixa[] };

const NOME_DIA: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// Converte um Json desconhecido para o array de horarios (defensivo).
export function normalizarHorarios(valor: unknown): DiaHorario[] | null {
  if (!Array.isArray(valor)) return null;
  const dias: DiaHorario[] = [];
  for (const item of valor) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const dia = Number(o.dia);
    if (Number.isNaN(dia)) continue;
    const faixas = Array.isArray(o.faixas)
      ? o.faixas
          .filter(
            (f): f is { inicio: string; fim: string } =>
              typeof f === "object" &&
              f !== null &&
              typeof (f as Record<string, unknown>).inicio === "string" &&
              typeof (f as Record<string, unknown>).fim === "string",
          )
          .map((f) => ({ inicio: f.inicio, fim: f.fim }))
      : [];
    dias.push({ dia, aberto: Boolean(o.aberto), faixas });
  }
  return dias;
}

function hmParaMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Partes locais (no fuso) de um instante: chave de data YYYY-MM-DD, dia da semana
// (0=Dom) e minuto do dia (0-1439).
function partesLocais(
  d: Date,
  fuso: string,
): { dateKey: string; diaSemana: number; minutoDia: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const ano = get("year");
    const mes = get("month");
    const dia = get("day");
    const hora = Number(get("hour")) % 24;
    const min = Number(get("minute"));
    const diaSemana = NOME_DIA[get("weekday")] ?? d.getDay();
    return {
      dateKey: `${ano}-${mes}-${dia}`,
      diaSemana,
      minutoDia: hora * 60 + min,
    };
  } catch {
    const diaSemana = d.getDay();
    const minutoDia = d.getHours() * 60 + d.getMinutes();
    const dateKey = d.toISOString().slice(0, 10);
    return { dateKey, diaSemana, minutoDia };
  }
}

// Minutos ÚTEIS entre `de` e `ate`: soma só os minutos dentro do horário
// comercial (faixas por dia da semana), em dias úteis (dia aberto) e fora de
// feriados. Determinística, pura. Base dos SLAs do Manual de Atendimento
// (ex.: "o relógio começa na abertura do próximo dia útil" sai de graça: tempo
// fora do expediente contribui 0). Sem horários configurados -> tempo corrido
// (minutos de parede), para nunca regredir onde não há config.
export function minutosUteisEntre(
  de: Date,
  ate: Date,
  horarios: DiaHorario[] | null | undefined,
  feriados: Iterable<string> = [],
  fuso = "America/Sao_Paulo",
): number {
  const ini = de.getTime();
  const fim = ate.getTime();
  if (fim <= ini) return 0;
  if (!horarios || horarios.length === 0) {
    return Math.round((fim - ini) / 60_000);
  }

  const feriadoSet = feriados instanceof Set ? feriados : new Set(feriados);
  const pDe = partesLocais(de, fuso);
  const pAte = partesLocais(ate, fuso);

  let total = 0;
  let cursor = de;
  for (let guard = 0; guard < 800; guard++) {
    const p = partesLocais(cursor, fuso);
    const startMin = p.dateKey === pDe.dateKey ? pDe.minutoDia : 0;
    const endMin = p.dateKey === pAte.dateKey ? pAte.minutoDia : 1440;
    if (!feriadoSet.has(p.dateKey)) {
      const dia = horarios.find((h) => h.dia === p.diaSemana);
      if (dia && dia.aberto) {
        for (const f of dia.faixas) {
          const ov =
            Math.min(endMin, hmParaMin(f.fim)) -
            Math.max(startMin, hmParaMin(f.inicio));
          if (ov > 0) total += ov;
        }
      }
    }
    if (p.dateKey === pAte.dateKey) break;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return total;
}

// Quantos DIAS ÚTEIS se passaram entre `de` e `ate`: conta as datas úteis (dia
// aberto, fora de feriado) que começaram DEPOIS da data local de `de`, até a data
// de `ate` inclusive. Base dos gatilhos da régua de follow-up (ex.: entrou na
// etapa no D1, "início do D2" = 1 dia útil decorrido). Sem horários -> dias
// corridos de calendário.
export function diasUteisDecorridos(
  de: Date,
  ate: Date,
  horarios: DiaHorario[] | null | undefined,
  feriados: Iterable<string> = [],
  fuso = "America/Sao_Paulo",
): number {
  if (ate.getTime() <= de.getTime()) return 0;
  const feriadoSet = feriados instanceof Set ? feriados : new Set(feriados);
  const pDe = partesLocais(de, fuso);
  const pAte = partesLocais(ate, fuso);
  if (pDe.dateKey === pAte.dateKey) return 0;

  let conta = 0;
  // Começa no dia seguinte à data de `de`.
  let cursor = new Date(de.getTime() + 24 * 60 * 60 * 1000);
  for (let guard = 0; guard < 800; guard++) {
    const p = partesLocais(cursor, fuso);
    const ehUtil = !horarios
      ? true
      : (horarios.find((h) => h.dia === p.diaSemana)?.aberto ?? false);
    if (ehUtil && !feriadoSet.has(p.dateKey)) conta += 1;
    if (p.dateKey === pAte.dateKey) break;
    if (p.dateKey > pAte.dateKey) break;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return conta;
}

export function estaAbertoAgora(
  horarios: DiaHorario[] | null | undefined,
  fuso = "America/Sao_Paulo",
  agora = new Date(),
): boolean {
  // Sem configuracao de horario => considera sempre aberto (sem restricao).
  if (!horarios || horarios.length === 0) return true;

  let diaSemana: number;
  let hm: string;
  try {
    const nomeDia = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      weekday: "short",
    }).format(agora);
    diaSemana = NOME_DIA[nomeDia] ?? agora.getDay();
    hm = new Intl.DateTimeFormat("en-GB", {
      timeZone: fuso,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(agora);
  } catch {
    diaSemana = agora.getDay();
    hm = agora.toTimeString().slice(0, 5);
  }

  const dia = horarios.find((h) => h.dia === diaSemana);
  if (!dia || !dia.aberto) return false;
  return dia.faixas.some((f) => hm >= f.inicio && hm <= f.fim);
}
