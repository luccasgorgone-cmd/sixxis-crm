// Tipos da supervisao do admin (espelham as APIs /api/admin/colaboradores...).
import type { Metricas } from "@/components/dashboard/tipos";

export type ResumoColaborador = {
  id: string;
  nome: string;
  ativo: boolean;
  acessoVenda: boolean;
  acessoPosVenda: boolean;
  acesso: string;
  aovivo: number;
  pendentes: number;
  finalizados: number;
  ultimoAtendimento: string | null;
};

export type PerfilColaborador = {
  agente: {
    id: string;
    nome: string;
    email: string;
    telefone: string | null;
    ativo: boolean;
    acessoVenda: boolean;
    acessoPosVenda: boolean;
    acesso: string;
  };
  metricas: Metricas;
};

export type ItemAtendimento = {
  conversaId: string | null;
  leadId: string;
  negocioId: string | null;
  leadNome: string | null;
  leadTelefone: string;
  finalidade: string;
  preview: string | null;
  ultimaMensagemEm: string | null;
  naoLidas: number;
  status: string;
  valor: number | null;
  etapaNome: string | null;
};

export type StatusAtendimento = "aovivo" | "pendente" | "finalizado";
