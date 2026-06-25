// Helpers de formatacao para a UI (executados no browser).

// "14:32" a partir de uma data/ISO string.
export function horaCurta(valor: string | Date | null | undefined): string {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Rotulo de separador de dia: "Hoje", "Ontem" ou "19/06/2026".
export function rotuloDia(valor: string | Date): string {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);

  const mesmaData = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (mesmaData(d, hoje)) return "Hoje";
  if (mesmaData(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR");
}

// Chave AAAA-MM-DD para agrupar mensagens por dia.
export function chaveDia(valor: string | Date): string {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Horario curto/relativo para a lista de conversas.
export function horarioLista(valor: string | Date | null | undefined): string {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  const hoje = new Date();
  const mesmoDia =
    d.getFullYear() === hoje.getFullYear() &&
    d.getMonth() === hoje.getMonth() &&
    d.getDate() === hoje.getDate();
  if (mesmoDia) return horaCurta(d);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Telefone "5518999999999" -> "+55 18 99999-9999" (best-effort, BR).
export function formatarTelefone(tel: string): string {
  const d = tel.replace(/\D/g, "");
  const m = d.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  if (!m) return tel;
  return `+${m[1]} ${m[2]} ${m[3]}-${m[4]}`;
}

// Mascaras leves (so formato, nunca bloqueiam): CPF 000.000.000-00,
// CNPJ 00.000.000/0000-00, CEP 00000-000. Formatam o que houver de digitos.
export function mascararCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export function mascararCnpj(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

export function mascararCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
}

// Data de nascimento (ISO em UTC meia-noite) -> "dd/mm/aaaa" sem deslocar fuso.
export function formatarDataNasc(valor: string | Date | null | undefined): string {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getUTCFullYear()}`;
}

// Mesmo valor ISO -> "aaaa-mm-dd" para preencher <input type="date">.
export function dataNascParaInput(valor: string | Date | null | undefined): string {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// Valor em reais. null/undefined -> "—".
export function formatarBRL(valor: number | null | undefined): string {
  if (valor == null) return "—";
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Duracao legivel a partir de segundos: "—", "45 min", "2 h 5 min", "1 d 3 h".
export function formatarDuracao(seg: number | null | undefined): string {
  if (!seg || seg <= 0) return "—";
  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const restoMin = min % 60;
  if (h < 24) return restoMin ? `${h} h ${restoMin} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const restoH = h % 24;
  return restoH ? `${d} d ${restoH} h` : `${d} d`;
}

// Normaliza texto para busca: minusculo, sem acentos, sem espacos nas pontas.
const ACENTOS = new RegExp("[\\u0300-\\u036f]", "g");
export function normalizarTexto(s: string): string {
  return s.normalize("NFD").replace(ACENTOS, "").toLowerCase().trim();
}

// Percentual a partir de 0..1: "62%".
export function formatarPct(v: number | null | undefined): string {
  if (v == null) return "0%";
  return `${Math.round(v * 100)}%`;
}

// "ha X" desde uma data (tempo na etapa): "agora", "ha 3 h", "ha 2 d".
export function tempoDesde(valor: string | Date | null | undefined): string {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `ha ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `ha ${h} h`;
  const dias = Math.floor(h / 24);
  return `ha ${dias} d`;
}

// Iniciais para o avatar (nome ou telefone).
export function iniciais(nome: string | null, telefone: string): string {
  const base = (nome ?? "").trim();
  if (base) {
    const partes = base.split(/\s+/);
    const a = partes[0]?.[0] ?? "";
    const b = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
    return (a + b).toUpperCase();
  }
  const d = telefone.replace(/\D/g, "");
  return d.slice(-2) || "?";
}
