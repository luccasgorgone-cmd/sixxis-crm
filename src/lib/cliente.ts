// Helpers do CLIENTE (Lead): nome efetivo e selects reusados na serializacao.
// Nome efetivo = nomeManual (override do atendente) || pushName (WhatsApp) ||
// nome (legado/ingestao) || telefone. Usar em TODA a UI.

export type LeadNomeavel = {
  nome?: string | null;
  pushName?: string | null;
  nomeManual?: string | null;
  telefone: string;
};

export function nomeEfetivo(l: LeadNomeavel): string {
  return (
    l.nomeManual?.trim() ||
    l.pushName?.trim() ||
    l.nome?.trim() ||
    l.telefone
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
