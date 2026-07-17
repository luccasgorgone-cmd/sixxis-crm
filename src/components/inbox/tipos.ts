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
// Fatia Z: LIDA (dois checks azuis) entre ENTREGUE e ERRO.
export type StatusEnvio =
  | "ENVIANDO"
  | "ENVIADA"
  | "ENTREGUE"
  | "LIDA"
  | "ERRO"
  | null;
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
  // Fatia Y: pin (null = nao fixada; data = fixada) + marcacao MANUAL de
  // nao-lida (independente do contador naoLidas). Ausentes em usos embutidos.
  fixadaEm?: string | null;
  marcadaNaoLida?: boolean;
  atendidoPor: AtendidoPor;
  agenteId: string | null;
  finalidade?: Finalidade;
  instanciaId?: string | null;
  instanciaNome?: string | null;
  instanciaNumero?: string | null;
  // Numero de resposta FIXADO pelo atendente (Fatia 2.89). Null = padrao (ultimo
  // numero do cliente). O compositor usa este como default de envio.
  instanciaRespostaId?: string | null;
  // Trecho da mensagem que bateu na busca por conteudo (quando ha ?texto=).
  trechoBusca?: string | null;
};

export type MensagemItem = {
  id: string;
  // Conversa a que a mensagem pertence (Fatia T). Aditivo/opcional: usado na
  // reconciliacao fetch-vs-socket para descartar mensagens de OUTRA conversa
  // que cheguem durante a troca. Ausente => tratada como da conversa atual.
  conversaId?: string;
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
  // Reacoes (emoji) estilo WhatsApp: a nossa e a do cliente.
  reacao?: string | null;
  reacaoDeCliente?: string | null;
  // Edicao (estilo WhatsApp): true => a bolha mostra a marca "editada".
  editada?: boolean;
  // Contato compartilhado (card no thread): nome + telefone do vCard.
  contatoNome?: string | null;
  contatoTelefone?: string | null;
  // Reply (estilo WhatsApp): id da citada + preview da mensagem citada.
  respostaAId?: string | null;
  citada?: {
    id: string;
    direcao: Direcao;
    tipo: TipoMensagem;
    conteudo: string | null;
    contatoNome?: string | null;
  } | null;
  // Marca visual "Encaminhada" na bolha (forward).
  encaminhada?: boolean;
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
  // Chave idempotente do envio otimista (Fatia 3.11): quando o texto foi enviado
  // pelo compositor com um id temporario, a rota devolve o MESMO clientId aqui.
  // O remetente casa este evento com a bolha "tmp-<uuid>" e reconcilia no lugar,
  // em vez de criar uma segunda bolha. Ausente em mensagens IN / da Sol.
  clientId?: string | null;
};

// Payload do evento "mensagem:midia" (mediaUrl preenchido em background/reproc.).
export type EventoMidia = {
  conversaId: string;
  mensagemId: string;
  mediaUrl: string;
};

export type Filtro = "minhas" | "naoLidas" | "todas";
