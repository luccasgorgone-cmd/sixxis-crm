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
  // Presente na lista real do Inbox (/api/conversas); ausente nos usos embutidos
  // do Thread (Kanban/supervisao), que nao precisam do painel de cliente.
  leadId?: string;
  // Negocio da finalidade da conversa (null se o lead nao tem negocio dela). O
  // painel do Inbox usa para os blocos de nivel negocio (acompanhamento/notas).
  negocioId?: string | null;
  leadNome: string | null;
  leadFoto?: string | null;
  leadTelefone: string;
  ultimaMensagemPreview: string | null;
  ultimaMensagemEm: string | null;
  naoLidas: number;
  atendidoPor: AtendidoPor;
  agenteId: string | null;
  finalidade?: Finalidade;
  instanciaId?: string | null;
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
  // Enviada pela Luna (IA)? Mostra selo interno "Luna" na bolha OUT.
  viaIA?: boolean;
  // Numero (instancia) por onde a mensagem entrou/saiu (conversa unificada).
  instanciaRotulo?: string | null;
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
  // Enviada pela Luna (IA)? (mensagens OUT geradas pelo motor de atendimento).
  viaIA?: boolean;
};

// Payload do evento "mensagem:midia" (mediaUrl preenchido em background/reproc.).
export type EventoMidia = {
  conversaId: string;
  mensagemId: string;
  mediaUrl: string;
};

export type Filtro = "minhas" | "naoLidas" | "todas";
