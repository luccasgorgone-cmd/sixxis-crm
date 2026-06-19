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

// Valor em reais. null/undefined -> "—".
export function formatarBRL(valor: number | null | undefined): string {
  if (valor == null) return "—";
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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
