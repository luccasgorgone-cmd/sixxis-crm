// Helpers de data para a Agenda (trabalham no fuso local do navegador).

export function inicioDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function fimDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function somarDias(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Domingo como primeiro dia da semana (padrao pt-BR em calendarios).
export function inicioDaSemana(d: Date): Date {
  const x = inicioDoDia(d);
  return somarDias(x, -x.getDay());
}

export function inicioDoMes(d: Date): Date {
  const x = inicioDoDia(d);
  x.setDate(1);
  return x;
}

export function fimDoMes(d: Date): Date {
  const x = inicioDoMes(d);
  x.setMonth(x.getMonth() + 1);
  return fimDoDia(somarDias(x, -1));
}

export function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

export function rotuloMes(d: Date): string {
  return `${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function rotuloDiaLongo(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export function hhmm(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Date -> "AAAA-MM-DDTHH:mm" no fuso local (para <input datetime-local>).
export function paraInputLocal(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
