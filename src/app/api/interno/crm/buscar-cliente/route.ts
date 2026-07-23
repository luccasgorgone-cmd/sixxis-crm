// Fatia AB — rota INTERNA de BUSCA de contato (a Loja chama para o dono escolher
// qual lead do CRM recebe os dados). Auth por x-internal-key (lib/internoAuth).
// Body: { telefone?, cpf?, nome? } — pelo menos um. Retorna ate 10 candidatos,
// ordenados por relevancia (telefone > cpf > nome; empate = ultima interacao).
// Lista VAZIA (200) quando nao acha — nunca erro.
import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  autorizarInterno,
  jsonInterno,
  naoAutorizadoInterno,
} from "@/lib/internoAuth";
import { nomeEfetivo } from "@/lib/cliente";
import { variantesTelefoneBR } from "@/lib/phone";
import { normalizarTexto } from "@/lib/format";
import { StatusNeg } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT = {
  id: true,
  nome: true,
  pushName: true,
  nomeManual: true,
  telefone: true,
  criadoEm: true,
  enderecos: {
    where: { principal: true },
    select: { cidade: true, uf: true },
    take: 1,
  },
  negocios: {
    where: { status: StatusNeg.ABERTO },
    select: { finalidade: true },
    take: 1,
  },
  conversas: { select: { ultimaMensagemEm: true } },
} as const;

type LeadBusca = {
  id: string;
  nome: string | null;
  pushName: string | null;
  nomeManual: string | null;
  telefone: string;
  criadoEm: Date;
  enderecos: { cidade: string | null; uf: string | null }[];
  negocios: { finalidade: string }[];
  conversas: { ultimaMensagemEm: Date | null }[];
};

function limpar(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function ultimaInteracao(l: LeadBusca): Date {
  let max = l.criadoEm;
  for (const c of l.conversas) {
    if (c.ultimaMensagemEm && c.ultimaMensagemEm.getTime() > max.getTime()) {
      max = c.ultimaMensagemEm;
    }
  }
  return max;
}

export async function POST(req: NextRequest) {
  if (!autorizarInterno(req)) return naoAutorizadoInterno();

  let body: { telefone?: unknown; cpf?: unknown; cnpj?: unknown; nome?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonInterno({ erro: "corpo invalido" }, 400);
  }

  const telefone = limpar(body.telefone);
  const cpf = limpar(body.cpf);
  const cnpj = limpar(body.cnpj);
  const nome = limpar(body.nome);
  if (!telefone && !cpf && !cnpj && !nome) {
    return jsonInterno({ erro: "informe telefone, cpf, cnpj ou nome" }, 400);
  }

  // Variantes de telefone: tolera 9o digito e DDI (com/sem 55, com/sem o 9).
  const telVariantes = telefone ? variantesTelefoneBR(telefone) : [];
  // Variantes de documento: como veio e so digitos.
  const cpfVariantes = cpf
    ? [...new Set([cpf, cpf.replace(/\D/g, "")])].filter(Boolean)
    : [];
  const cnpjVariantes = cnpj
    ? [...new Set([cnpj, cnpj.replace(/\D/g, "")])].filter(Boolean)
    : [];
  const nomeTermo = nome ? normalizarTexto(nome) : "";

  // Rank de relevancia: telefone 0, documento (cpf OU cnpj) 1, nome 2.
  const [porTelefone, porCpf, porCnpj, porNome] = await Promise.all([
    telVariantes.length
      ? prisma.lead.findMany({
          where: { telefone: { in: telVariantes } },
          select: SELECT,
          take: 10,
        })
      : Promise.resolve([]),
    cpfVariantes.length
      ? prisma.lead.findMany({
          where: { cpf: { in: cpfVariantes } },
          select: SELECT,
          take: 10,
        })
      : Promise.resolve([]),
    cnpjVariantes.length
      ? prisma.lead.findMany({
          where: { cnpj: { in: cnpjVariantes } },
          select: SELECT,
          take: 10,
        })
      : Promise.resolve([]),
    nomeTermo
      ? prisma.lead.findMany({
          where: { nomeBusca: { contains: nomeTermo } },
          select: SELECT,
          take: 10,
        })
      : Promise.resolve([]),
  ]);

  // Merge mantendo o MENOR rank por lead (match mais forte vence; sem duplicar).
  const porId = new Map<string, { lead: LeadBusca; rank: number }>();
  const juntar = (leads: LeadBusca[], rank: number) => {
    for (const lead of leads) {
      const atual = porId.get(lead.id);
      if (!atual || rank < atual.rank) porId.set(lead.id, { lead, rank });
    }
  };
  juntar(porTelefone as LeadBusca[], 0);
  juntar(porCpf as LeadBusca[], 1);
  juntar(porCnpj as LeadBusca[], 1);
  juntar(porNome as LeadBusca[], 2);

  const candidatos = [...porId.values()]
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return ultimaInteracao(b.lead).getTime() - ultimaInteracao(a.lead).getTime();
    })
    .slice(0, 10)
    .map(({ lead }) => {
      const end = lead.enderecos[0];
      const cidadeUf =
        end && (end.cidade || end.uf)
          ? [end.cidade, end.uf].filter(Boolean).join("/")
          : null;
      return {
        leadId: lead.id,
        nome: nomeEfetivo(lead),
        telefone: lead.telefone,
        cidadeUf,
        temNegocioAberto: lead.negocios.length > 0,
        finalidadeAberta: lead.negocios[0]?.finalidade ?? null,
        ultimaInteracaoEm: ultimaInteracao(lead).toISOString(),
      };
    });

  return jsonInterno({ candidatos });
}
