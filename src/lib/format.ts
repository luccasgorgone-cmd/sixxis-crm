// Helpers de formatacao para a UI (executados no browser).
import { ehTelefoneValidoBR } from "./ddd";

// Rotulo curto para "telefones" que na verdade sao @lid (numero mascarado do
// WhatsApp) ou lixo: nunca exibimos o numero interno gigante de 14-15 digitos.
const ROTULO_SEM_TELEFONE = "Contato WhatsApp";

// Quebra a parte nacional (DDD + numero) em "(DD) 9NNNN-NNNN" ou "(DD) NNNN-NNNN".
function formatarNacional(nac: string): string {
  const ddd = nac.slice(0, 2);
  const num = nac.slice(2);
  const meio =
    num.length === 9
      ? `${num.slice(0, 5)}-${num.slice(5)}`
      : `${num.slice(0, 4)}-${num.slice(4)}`;
  return `(${ddd}) ${meio}`;
}

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

// Telefone "5518999999999" -> "+55 (18) 99999-9999". Numeros sem DDI 55 (10-11
// digitos) sao assumidos como BR. Se NAO for telefone BR valido (ex.: @lid),
// retorna um rotulo curto amigavel — NUNCA o numero interno gigante.
export function formatarTelefone(tel: string): string {
  const d = (tel ?? "").replace(/\D/g, "");
  if (!ehTelefoneValidoBR(d)) return ROTULO_SEM_TELEFONE;
  const nac =
    d.startsWith("55") && (d.length === 12 || d.length === 13)
      ? d.slice(2)
      : d;
  return `+55 ${formatarNacional(nac)}`;
}

// Versao curta para cards/listas apertadas: "(18) 99999-9999" (sem o +55) ou o
// mesmo rotulo amigavel para @lid/lixo.
export function formatarTelefoneCurto(tel: string): string {
  const d = (tel ?? "").replace(/\D/g, "");
  if (!ehTelefoneValidoBR(d)) return ROTULO_SEM_TELEFONE;
  const nac =
    d.startsWith("55") && (d.length === 12 || d.length === 13)
      ? d.slice(2)
      : d;
  return formatarNacional(nac);
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

// Converte "YYYY-MM-DD" (input date) em Date UTC meia-noite (evita deslocamento
// de fuso ao exibir). "" / null / undefined -> null (limpar). Retorna
// { ok:false } quando o texto e nao-vazio e invalido. Usado no POST e no PATCH
// de /api/leads (mesma validacao, sem drift).
export function parseDataNascimento(
  bruto: unknown,
): { ok: true; valor: Date | null } | { ok: false } {
  if (bruto === null || bruto === undefined || String(bruto).trim() === "") {
    return { ok: true, valor: null };
  }
  const m = String(bruto).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { ok: false };
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return { ok: false };
  return { ok: true, valor: d };
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

// Iniciais para o avatar (nome ou telefone). Ignora "nomes" sem letras (ex.: um
// telefone formatado como fallback), caindo nos ultimos 2 digitos do numero.
export function iniciais(nome: string | null, telefone: string): string {
  const base = (nome ?? "").trim();
  if (base && /\p{L}/u.test(base)) {
    const partes = base.split(/\s+/).filter((p) => /\p{L}/u.test(p));
    const a = partes[0]?.[0] ?? "";
    const b = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
    return (a + b).toUpperCase();
  }
  const d = telefone.replace(/\D/g, "");
  return d.slice(-2) || "?";
}

// Numero de pedido (orcamento-decisao) SEMPRE exibido como "PED-######" (6
// digitos), ex.: PED-000042. Compartilhado por UI e APIs. Fatia 3.07.
export function formatarNumeroPedido(numero: number): string {
  return `PED-${String(numero).padStart(6, "0")}`;
}

// totalFinal do orcamento (Fatia 3.09): aplica desconto % sobre os cobraveis e
// soma o frete apenas se NAO for pago pela empresa. Arredonda a 2 casas. Mesma
// formula no cliente (resumo ao vivo) e no servidor (snapshot da decisao).
export function calcularTotalFinal(args: {
  totalCobravel: number;
  descontoPct?: number | null;
  frete?: number | null;
  fretePagoPelaEmpresa?: boolean;
}): number {
  const bruto = Math.max(0, args.totalCobravel || 0);
  const desc = Math.min(100, Math.max(0, args.descontoPct ?? 0));
  const frete = args.fretePagoPelaEmpresa ? 0 : Math.max(0, args.frete ?? 0);
  return Math.round((bruto * (1 - desc / 100) + frete) * 100) / 100;
}
