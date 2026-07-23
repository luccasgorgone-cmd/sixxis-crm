// Datas "somente dia" (sem hora relevante) — ex.: data da NF, que e o relogio da
// garantia. Ancorar ao MEIO-DIA UTC (T12:00:00Z) em vez de meia-noite garante
// que qualquer fuso do Brasil (e do mundo, de UTC-11 a UTC+12) exiba o MESMO dia:
// new Date("2026-07-15") = 2026-07-15T00:00:00Z, que no fuso BR (-03) vira
// 14/07/2026 — um dia a menos. Ao meio-dia UTC isso nao acontece.
//
// PONTO UNICO: todo ponto que grava uma data "so dia" deve usar este helper.

// Recebe "YYYY-MM-DD" (sem hora) e devolve a data ancorada ao meio-dia UTC.
// Valores com hora/timezone explicitos sao respeitados como vieram. Invalido ->
// null (o chamador decide o que fazer).
export function dataSomenteDia(
  valor: string | Date | null | undefined,
): Date | null {
  if (valor == null) return null;
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }
  const s = String(valor).trim();
  if (!s) return null;
  // Formato exato de dia (sem hora): ancora ao meio-dia UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Tem hora/timezone: respeita como veio.
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
