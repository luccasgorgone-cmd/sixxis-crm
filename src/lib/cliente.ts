// Helpers do CLIENTE (Lead): nome efetivo e selects reusados na serializacao.
// Nome efetivo = nomeManual (override do atendente) || pushName (WhatsApp) ||
// nome (legado/ingestao) || telefone formatado. Usar em TODA a UI.
import { formatarTelefone } from "./format";

export type LeadNomeavel = {
  nome?: string | null;
  pushName?: string | null;
  nomeManual?: string | null;
  telefone: string;
};

// true quando o lead tem um nome de verdade (nao caiu no telefone). Use isto
// para logica (ex.: CTA "adicionar nome"), NAO comparar nomeEfetivo == telefone
// — o fallback agora vem formatado.
export function temNomeReal(l: LeadNomeavel): boolean {
  return Boolean(
    l.nomeManual?.trim() || l.pushName?.trim() || l.nome?.trim(),
  );
}

export function nomeEfetivo(l: LeadNomeavel): string {
  // Sem nome real, cai no telefone FORMATADO (ou "Contato WhatsApp" para @lid),
  // nunca o numero interno cru de 14-15 digitos.
  return (
    l.nomeManual?.trim() ||
    l.pushName?.trim() ||
    l.nome?.trim() ||
    formatarTelefone(l.telefone)
  );
}

// Select minimo para montar avatar/nome do cliente nos cards e listas.
export const selectClienteBasico = {
  id: true,
  nome: true,
  pushName: true,
  nomeManual: true,
  telefone: true,
  fotoUrl: true,
} as const;
