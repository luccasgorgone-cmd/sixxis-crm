// Tipos compartilhados pela UI do Kanban e do painel do negocio.

export type TipoEtapa = "ABERTA" | "GANHO" | "PERDIDO";
export type Temperatura = "QUENTE" | "MORNO" | "FRIO";
export type StatusNeg = "ABERTO" | "GANHO" | "PERDIDO";
export type Finalidade = "VENDA" | "POS_VENDA";

export type FinalidadeEtapa = "VENDA" | "POS_VENDA" | "AMBAS";

export type Etapa = {
  id: string;
  nome: string;
  cor: string;
  tipo: TipoEtapa;
  finalidade?: FinalidadeEtapa;
  ordem: number;
};

export type EtiquetaChip = { id: string; nome: string; cor: string };

export type AgenteResumo = {
  id: string;
  nome: string;
  avatarUrl: string | null;
  papel?: string;
  acessoVenda?: boolean;
  acessoPosVenda?: boolean;
};

export type CardNegocio = {
  id: string;
  leadNome: string | null;
  leadFoto: string | null;
  leadTelefone: string;
  origem: string | null;
  valor: number | null;
  temperatura: Temperatura;
  status: StatusNeg;
  finalidade: Finalidade;
  pendente: boolean;
  motivoPendencia: string | null;
  etapaId: string | null;
  entrouEtapaEm: string;
  agente: AgenteResumo | null;
  etiquetas: EtiquetaChip[];
};

// Evento de tempo real emitido pelo servidor.
export type EventoNegocio = {
  negocioId: string;
  etapaId: string | null;
  motivo: string;
};

// Filtro do alternador de ADMIN.
export type FiltroDono = "todos" | "meus" | "sem_dono";

export type ItemHistorico = {
  id: string;
  tipo: string;
  descricao: string;
  agente: string | null;
  criadoEm: string;
};

export type NotaItem = {
  id: string;
  texto: string;
  agente: string | null;
  criadoEm: string;
};

export type ItemAtividade = {
  id: string;
  tipo: string;
  descricao: string;
  agente: string | null;
  criadoEm: string;
};

export type VendedorOpcao = { id: string; nome: string };
export type ObservacaoOpcao = { id: string; texto: string };

export type DetalheNegocio = CardNegocio & {
  cliente: {
    id: string;
    nome: string | null;
    pushName: string | null;
    nomeManual: string | null;
    nomeEfetivo: string;
    fotoUrl: string | null;
    telefone: string;
    email: string | null;
    empresa: string | null;
    cpf: string | null;
    anotacoes: string | null;
    origem: string | null;
  };
  dono: { id: string; nome: string } | null;
  produtos: unknown;
  motivoPerda: string | null;
  fechadoEm: string | null;
  conversaId: string | null;
  atendidoPor: "HUMANO" | "IA" | null;
  notas: NotaItem[];
  historico: ItemHistorico[];
};

// Cores/rotulos de temperatura.
export const TEMPERATURA_INFO: Record<
  Temperatura,
  { rotulo: string; cor: string; ponto: string }
> = {
  QUENTE: { rotulo: "Quente", cor: "text-red-600", ponto: "bg-red-500" },
  MORNO: { rotulo: "Morno", cor: "text-amber-600", ponto: "bg-amber-500" },
  FRIO: { rotulo: "Frio", cor: "text-sky-600", ponto: "bg-sky-500" },
};
