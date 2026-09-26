// F7-Calling — tipos canonicos da camada de ligacao (voz/video) do CRM.
//
// Desenho: a UI e o servico de chamada falam nestes tipos, independentes do
// provedor. Hoje o transporte de midia usa WebRTC no browser + sinalizacao via
// Socket.io (mesmo servidor). A ligacao para o CLIENTE via WhatsApp oficial
// (Cloud API) entra como um "provedor" adicional numa fase seguinte, atras da
// mesma interface — quando o numero migrar pra Cloud API. Ate la, a ligacao
// para o cliente fica GATED pela flag CHAMADAS_ATIVAS (ver abaixo).

export type TipoChamada = "voz" | "video";

export type EstadoChamada =
  | "ocioso" // sem chamada
  | "chamando" // saida: aguardando o outro lado atender
  | "recebendo" // entrada: tocando
  | "conectando" // negociando midia (SDP/ICE)
  | "em_chamada" // conectado, audio/video fluindo
  | "encerrada" // desligou
  | "recusada" // o outro lado recusou / ocupado
  | "erro"; // falha tecnica (permissao de midia, rede, etc.)

// Alvo de uma chamada de saida a partir de uma conversa.
export interface AlvoChamada {
  conversaId: string;
  leadId?: string | null;
  nome: string;
  telefone: string;
}

// --- Sinais trocados via Socket.io (sinalizacao) ---

export interface SinalIdentificar {
  agenteId: string;
}

export interface SinalOferta {
  chamadaId: string;
  conversaId: string;
  tipo: TipoChamada;
  sdp: string; // RTCSessionDescription.sdp da OFERTA
  deAgenteId: string;
  deNome: string;
  paraAgenteId?: string; // destino interno (agente<->agente); ausente = provedor
}

export interface SinalResposta {
  chamadaId: string;
  paraAgenteId: string;
  sdp: string; // RTCSessionDescription.sdp da RESPOSTA
}

export interface SinalIce {
  chamadaId: string;
  paraAgenteId: string;
  candidato: RTCIceCandidateInit;
}

export interface SinalEncerrar {
  chamadaId: string;
  paraAgenteId?: string;
  motivo?: string;
}

// Nomes dos eventos de socket (uma fonte so, cliente e servidor concordam).
export const EVT = {
  identificar: "chamada:identificar",
  oferta: "chamada:oferta",
  resposta: "chamada:resposta",
  ice: "chamada:ice",
  aceitar: "chamada:aceitar",
  recusar: "chamada:recusar",
  encerrar: "chamada:encerrar",
} as const;

// Sala por agente no Socket.io (para entregar a chamada ao browser certo).
export function salaAgente(agenteId: string): string {
  return `agente:${agenteId}`;
}

// Gate da ligacao para o CLIENTE (WhatsApp). Fica OFF ate o numero migrar pra
// Cloud API oficial (a Evolution nao expoe calling). Quando a migracao fechar,
// liga NEXT_PUBLIC_CHAMADAS_ATIVAS=true. Os icones aparecem de qualquer forma;
// so a discagem real fica atras dessa flag.
export const CHAMADAS_ATIVAS =
  process.env.NEXT_PUBLIC_CHAMADAS_ATIVAS === "true";

// STUN publico do Google para descoberta de candidatos ICE. TURN (relay) sera
// necessario para redes atras de NAT simetrico — configuravel por env quando a
// fase de midia real for ligada.
export function servidoresIce(): RTCIceServer[] {
  const url = process.env.NEXT_PUBLIC_TURN_URL;
  const usuario = process.env.NEXT_PUBLIC_TURN_USUARIO;
  const senha = process.env.NEXT_PUBLIC_TURN_SENHA;
  const servidores: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
  ];
  if (url) {
    servidores.push({ urls: url, username: usuario, credential: senha });
  }
  return servidores;
}
