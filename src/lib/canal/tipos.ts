// Contrato canonico do atendimento omnichannel (F1 da arquitetura).
//
// Fonte de desenho: docs/ARQUITETURA_ATENDIMENTO_OMNICHANNEL.md (secao 3.2) e
// docs/SCOPING_HIBRIDO_4701_CLOUD_CALLING.md. A tese: o CANAL (Evolution, Cloud
// API, Sandbox) e um ADAPTADOR que traduz o payload cru para estes tipos; o
// NUCLEO (ingerir) trabalha so em cima deles, sem saber de qual canal veio.
//
// F1 introduz o contrato + o `parse` puro da Evolution SEM mudar comportamento.
// Campos marcados "(detalhe Evolution)" carregam informacao especifica do canal
// atual so para o nucleo reproduzir logs/diagnosticos identicos aos de hoje; o
// nucleo nunca ramifica regra de negocio neles.

import type { TipoMsg } from "../../generated/prisma/client";

export type Provider = "EVOLUTION" | "CLOUD_API" | "SANDBOX";

export type DirecaoCanal = "IN" | "OUT";

// Quem e o cliente NO canal. Evolution entrega telefone (ou LID de contato nao
// salvo, resolvido para telefone quando possivel); Cloud entrega wa_id/telefone.
export interface IdentidadeExterna {
  tipo: "TELEFONE" | "LID" | "BSUID";
  valor: string; // telefone normalizado (so digitos, com DDI) OU id opaco
  telefone?: string; // telefone normalizado, quando resolvido
  nomePerfil?: string; // pushName — so em ENTRADA (nunca renomeia por SAIDA)
  // (detalhe Evolution) jid original do payload e como/se o @lid foi resolvido,
  // para o nucleo emitir o diagnostico [ingest-diag] identico ao atual.
  jidBruto?: string;
  jidEfetivo?: string;
  resolvidoDe?: string | null;
}

export interface ConteudoCanonico {
  // tipoDominio e o enum TipoMsg EXATO que hoje se grava em Mensagem.tipo —
  // carregado para o nucleo persistir sem reclassificar (equivalencia F1).
  tipoDominio: TipoMsg;
  texto?: string | null;
  transcricao?: string | null;
  // Referencia opaca de midia que o adaptador sabe baixar (hoje: URL crua da
  // Evolution). Sticker nunca carrega ref (nao renderiza cru). null quando ausente.
  midiaRef?: string | null;
  ehSticker?: boolean;
  contato?: { nome: string; telefone: string | null; vcard: string } | null;
}

export interface OrigemAnuncio {
  ctwaClid: string | null;
  anuncioId: string | null;
  anuncioTitulo: string | null;
  anuncioUrl: string | null;
  origemDetalhe: string | null;
}

// Evento canonico de MENSAGEM (entrada ou saida) ja parseado, pronto para o
// nucleo (ingerir) aplicar identidade/conversa/negocio/roteamento.
export interface EventoMensagem {
  provider: Provider;
  externalId: string;
  direcao: DirecaoCanal;
  ocorridoEm?: Date; // messageTimestamp, quando presente
  contaRef: string; // instancia Evolution (ou phone_number_id no Cloud)
  cliente: IdentidadeExterna;
  conteudo: ConteudoCanonico;
  respondeA?: string | null; // externalId (stanzaId) da mensagem citada, se houver
  origemAnuncio?: OrigemAnuncio | null;
  raw: unknown; // payload cru do canal (persistido em Mensagem.raw como hoje)
}

// ===========================================================================
// SAIDA (F2): contrato de ENVIO. O nucleo pede "manda isto nesta conversa" em
// termos canonicos; a fachada (enviarPeloCanal) escolhe a conta/adaptador e o
// adaptador do provedor traduz para a API do canal. Assim o mesmo ponto de envio
// serve Evolution e Cloud API — a diferenca (ex.: template fora da janela de 24h
// no Cloud) fica no adaptador/capacidades, nao no chamador.
// ===========================================================================

// Conta de envio (generaliza InstanciaWhatsApp). refExterna = instancia
// Evolution OU phone_number_id do Cloud. credencialRef = NOME da env var do
// segredo (nunca o valor).
export interface ContaCanal {
  id: string;
  provider: Provider;
  finalidade: "VENDA" | "POS_VENDA";
  refExterna: string;
  credencialRef?: string;
}

// O que enviar, em termos canonicos (independe do canal).
export interface SaidaCanonica {
  tipo: "TEXTO" | "IMAGEM" | "AUDIO" | "VIDEO" | "DOCUMENTO" | "CONTATO";
  texto?: string;
  // Midia: URL publica OU base64 (o adaptador do canal sabe consumir). mime/
  // fileName quando o canal precisa (documento).
  midiaRef?: string;
  mime?: string;
  fileName?: string;
  // Reply: externalId da mensagem citada (o adaptador resolve o formato do quote).
  citarExternalId?: string;
  // A mensagem citada foi enviada por NOS (OUT)? Info canonica e neutra: a
  // Evolution precisa disto no quoted.key.fromMe; o Cloud API ignora (o reply so
  // usa o message_id). Ausente/false = citando mensagem do cliente (IN).
  citarEhSaida?: boolean;
  contato?: { nome: string; telefone: string };
  // Atraso opcional (audio PTT "gravando"), repassado ao canal quando suportado.
  atrasoMs?: number;
}

// O que cada canal consegue fazer. A fachada recusa (CAPACIDADE_AUSENTE) uma
// saida que a conta escolhida nao suporta, em vez de tentar e falhar no canal.
export interface CapacidadesCanal {
  texto: true;
  midia: boolean;
  audioPTT: boolean;
  reacao: boolean;
  edicao: boolean;
  revogar: boolean;
  contato: boolean;
  // Cloud API: true (fora da janela de 24h so template aprovado). Evolution: false.
  exigeTemplateForaDaJanela: boolean;
}

export type MotivoFalhaEnvio =
  | "JANELA_FECHADA"
  | "TEMPLATE_OBRIGATORIO"
  | "CAPACIDADE_AUSENTE"
  | "CONTA_OFFLINE"
  | "RECUSADO_PELO_CANAL"
  | "CONFIG_AUSENTE"
  | "ERRO_TRANSITORIO";

export type ResultadoEnvioCanonico =
  | { ok: true; externalId?: string; raw?: unknown }
  | { ok: false; motivo: MotivoFalhaEnvio; detalhe?: string; raw?: unknown };

// Adaptador de ENVIO de um provedor. `enviar` e a unica porta de saida do canal.
export interface CanalAdapterEnvio {
  provider: Provider;
  capacidades: CapacidadesCanal;
  enviar(
    conta: ContaCanal,
    destino: IdentidadeExterna,
    saida: SaidaCanonica,
  ): Promise<ResultadoEnvioCanonico>;
}

// Decisao do parser: o que o nucleo deve fazer com este payload. Cada variante
// corresponde 1:1 a um ramo do processarEvento atual, na MESMA ordem. O `motivo`
// do IGNORAR distingue os poucos casos que ainda emitem log/diagnostico no
// nucleo (broadcast/newsletter, jid sem digitos, evento sem jid/externalId).
export type AcaoIngest =
  | { acao: "IGNORAR"; motivo: string }
  | { acao: "REVOGACAO"; externalId: string }
  | { acao: "EDICAO"; externalId: string; texto: string }
  | { acao: "STATUS" } // nucleo chama atualizarStatusMensagem(payload)
  | { acao: "REACAO"; alvoExternalId: string; emoji: string }
  | { acao: "GRUPO" } // nucleo chama processarMensagemGrupo(payload)
  | { acao: "MENSAGEM"; evento: EventoMensagem };
