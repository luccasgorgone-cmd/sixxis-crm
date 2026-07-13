// Helpers do CLIENTE (Lead): nome efetivo e selects reusados na serializacao.
// Nome efetivo = nomeManual (override do atendente) || pushName (WhatsApp) ||
// nome (legado/ingestao) || telefone formatado. Usar em TODA a UI.
import { formatarTelefone, normalizarTexto } from "./format";
import type { Segmento } from "@/generated/prisma/enums";

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

// Versao normalizada do NOME EFETIVO (sem acento, minusculas) para a busca
// server-side do Kanban (Fatia P). Deriva do MESMO nomeEfetivo que a UI mostra
// (nomeManual || pushName || nome || telefone formatado), para a busca casar
// exatamente o que o client casava (normalizarTexto(leadNome)).
export function nomeBuscaDe(l: LeadNomeavel): string {
  return normalizarTexto(nomeEfetivo(l));
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

// Select RICO para o BlocoCliente (painel de dados do cliente). Reune tudo que o
// bloco exibe: identificacao, contato, documentos, nascimento, anotacoes, opt-out
// e a origem (incl. anuncio Click-to-WhatsApp). O endereco NAO entra aqui — o
// BlocoCliente carrega os enderecos por conta propria (componente Enderecos).
export const selectClientePainel = {
  id: true,
  nome: true,
  pushName: true,
  nomeManual: true,
  telefone: true,
  fotoUrl: true,
  email: true,
  empresa: true,
  cpf: true,
  cnpj: true,
  segmento: true,
  dataNascimento: true,
  anotacoes: true,
  aceitaContato: true,
  origem: true,
  origemDetalhe: true,
  anuncioId: true,
  anuncioTitulo: true,
  anuncioUrl: true,
  ctwaClid: true,
} as const;

// Linha do banco (subset de Lead) que o serializador do painel espera.
export type LeadPainelRow = LeadNomeavel & {
  id: string;
  fotoUrl: string | null;
  email: string | null;
  empresa: string | null;
  cpf: string | null;
  cnpj: string | null;
  segmento: Segmento | null;
  dataNascimento: Date | null;
  anotacoes: string | null;
  aceitaContato: boolean;
  origem: string | null;
  origemDetalhe: string | null;
  anuncioId: string | null;
  anuncioTitulo: string | null;
  anuncioUrl: string | null;
  ctwaClid: string | null;
};

// Serializa um Lead (selectClientePainel) no shape do ClientePainel do BlocoCliente.
// Usado por endpoints que alimentam o painel do cliente (ex.: GET /api/leads/[id]).
export function serializarClientePainel(l: LeadPainelRow) {
  return {
    id: l.id,
    nome: l.nome ?? null,
    pushName: l.pushName ?? null,
    nomeManual: l.nomeManual ?? null,
    nomeEfetivo: nomeEfetivo(l),
    fotoUrl: l.fotoUrl,
    telefone: l.telefone,
    email: l.email,
    empresa: l.empresa,
    cpf: l.cpf,
    cnpj: l.cnpj,
    segmento: l.segmento ?? null,
    dataNascimento: l.dataNascimento ? l.dataNascimento.toISOString() : null,
    anotacoes: l.anotacoes,
    aceitaContato: l.aceitaContato,
    origem: l.origem,
    origemDetalhe: l.origemDetalhe,
    anuncioId: l.anuncioId,
    anuncioTitulo: l.anuncioTitulo,
    anuncioUrl: l.anuncioUrl,
    ctwaClid: l.ctwaClid,
  };
}
