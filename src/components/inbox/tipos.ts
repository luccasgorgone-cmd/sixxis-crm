// Tipos compartilhados pela UI da inbox (espelham as respostas das APIs e o
// payload do socket "mensagem:nova").

export type Direcao = "IN" | "OUT";
export type TipoMensagem =
  | "TEXTO"
  | "AUDIO"
  | "IMAGEM"
  | "VIDEO"
  | "DOCUMENTO"
  | "OUTRO";
export type StatusEnvio = "ENVIANDO" | "ENVIADA" | "ENTREGUE" | "ERRO" | null;
export type AtendidoPor = "HUMANO" | "IA";

export type ConversaItem = {
  id: string;
  leadNome: string | null;
  leadTelefone: string;
  ultimaMensagemPreview: string | null;
  ultimaMensagemEm: string | null;
  naoLidas: number;
  atendidoPor: AtendidoPor;
  agenteId: string | null;
};

export type MensagemItem = {
  id: string;
  direcao: Direcao;
  tipo: TipoMensagem;
  conteudo: string | null;
  statusEnvio: StatusEnvio;
  hora: string;
};

// Payload emitido pelo servidor no evento "mensagem:nova".
export type EventoMensagemNova = {
  conversaId: string;
  leadId: string;
  leadNome: string | null;
  leadTelefone: string;
  mensagemId: string;
  direcao: Direcao;
  tipo: TipoMensagem;
  conteudo: string | null;
  statusEnvio: StatusEnvio;
  hora: string;
  naoLidas: number;
  ultimaMensagemEm: string;
};

export type Filtro = "minhas" | "naoLidas" | "todas";
