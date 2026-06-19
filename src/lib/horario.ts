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
