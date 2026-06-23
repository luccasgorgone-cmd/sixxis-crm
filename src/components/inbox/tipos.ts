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

export type Finalidade = "VENDA" | "POS_VENDA";

export type ConversaItem = {
  id: string;
  leadNome: string | null;
  leadFoto?: string | null;
  leadTelefone: string;
  ultimaMensagemPreview: string | null;
  ultimaMensagemEm: string | null;
  naoLidas: number;
  atendidoPor: AtendidoPor;
  agenteId: string | null;
  finalidade?: Finalidade;
  instanciaNome?: string | null;
  instanciaNumero?: string | null;
};

export type MensagemItem = {
  id: string;
  direcao: Direcao;
  tipo: TipoMensagem;
  conteudo: string | null;
  // URL publica (R2) da midia exibivel. Vazio = midia ainda nao persistida.
  mediaUrl?: string | null;
  statusEnvio: StatusEnvio;
  hora: string;
  apagada?: boolean;
  apagadaPor?: string | null; // "COLABORADOR" | "CLIENTE"
  apagadaEm?: string | null;
};

// Payload emitido pelo servidor no evento "mensagem:nova".
export type EventoMensagemNova = {
  conversaId: string;
  leadId: string;
  leadNome: string | null;
  leadFoto?: string | null;
  leadTelefone: string;
  mensagemId: string;
  direcao: Direcao;
  tipo: TipoMensagem;
  conteudo: string | null;
  mediaUrl?: string | null;
  statusEnvio: StatusEnvio;
  hora: string;
  naoLidas: number;
  ultimaMensagemEm: string;
};

// Payload do evento "mensagem:midia" (mediaUrl preenchido em background/reproc.).
export type EventoMidia = {
  conversaId: string;
  mensagemId: string;
  mediaUrl: string;
};

export type Filtro = "minhas" | "naoLidas" | "todas";
