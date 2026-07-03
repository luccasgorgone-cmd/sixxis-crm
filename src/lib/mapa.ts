// Camada de agregacao do Mapa (centro de clientes georreferenciado). Compartilha
// entre /api/mapa/estados (agregado por UF) e /api/mapa/estado (detalhe de 1 UF):
// resolucao de UF do lead, classificacao de produto, negocio principal e o
// "resumo" por UF (mesmos campos nos dois endpoints, sem drift). Somente leitura.
import { Prisma } from "@/generated/prisma/client";
import { ufPorTelefone, infoPorUF } from "./ddd";
import { classificarProduto, type CategoriaProduto } from "./classificar-produto";

// Shape minimo do lead lido do banco (select em selectLeadMapa). valor fica como
// unknown porque o Prisma retorna Decimal; converta sempre com toNum.
export type NegocioMapa = {
  id: string;
  status: "ABERTO" | "GANHO" | "PERDIDO";
  pendente: boolean;
  temperatura: "QUENTE" | "MORNO" | "FRIO";
  finalidade: "VENDA" | "POS_VENDA";
  valor: unknown;
  etapaId: string | null;
  criadoEm: Date;
  fechadoEm: Date | null;
  motivoPerda: string | null;
  motivoPerdaObs: string | null;
  etapa: { nome: string } | null;
};
export type LeadMapa = {
  id: string;
  nome: string | null;
  pushName: string | null;
  nomeManual: string | null;
  telefone: string;
  origem: string | null;
  anuncioTitulo: string | null;
  garantia: boolean | null;
  criadoEm: Date;
  enderecos: { uf: string | null; cidade: string | null }[];
  conversas: { id: string; ultimaMensagemEm: Date | null }[];
  negocios: NegocioMapa[];
  produtosInteresse: { produtoInteresse: { nome: string } }[];
};

// Select reusavel nas duas rotas (mesma base de dados -> mesmos numeros).
export const selectLeadMapa = {
  id: true,
  nome: true,
  pushName: true,
  nomeManual: true,
  telefone: true,
  origem: true,
  anuncioTitulo: true,
  garantia: true,
  criadoEm: true,
  enderecos: {
    select: { uf: true, cidade: true },
    orderBy: [{ principal: "desc" }, { criadoEm: "asc" }],
  },
  conversas: { select: { id: true, ultimaMensagemEm: true } },
  negocios: {
    select: {
      id: true,
      status: true,
      pendente: true,
      temperatura: true,
      finalidade: true,
      valor: true,
      etapaId: true,
      criadoEm: true,
      fechadoEm: true,
      motivoPerda: true,
      motivoPerdaObs: true,
      etapa: { select: { nome: true } },
    },
  },
  produtosInteresse: {
    select: { produtoInteresse: { select: { nome: true } } },
  },
} satisfies Prisma.LeadSelect;

export function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v as number);
  return Number.isFinite(n) ? n : 0;
}

// UF do lead: 1o endereco com uf valida de 2 letras, senao DDD do telefone.
export function resolverUF(lead: LeadMapa): string | null {
  for (const e of lead.enderecos) {
    const u = (e.uf ?? "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(u)) return u;
  }
  return ufPorTelefone(lead.telefone);
}

// Cidade do lead (1o endereco com cidade preenchida), ou null.
export function cidadeDoLead(lead: LeadMapa): string | null {
  for (const e of lead.enderecos) {
    const c = (e.cidade ?? "").trim();
    if (c) return c;
  }
  return null;
}

// Negocio principal para status/temperatura/link: aberto > mais recente por criacao.
export function negocioPrincipal(lead: LeadMapa): NegocioMapa | null {
  const aberto = lead.negocios.find((n) => n.status === "ABERTO");
  if (aberto) return aberto;
  const ordenados = [...lead.negocios].sort(
    (a, b) => b.criadoEm.getTime() - a.criadoEm.getTime(),
  );
  return ordenados[0] ?? null;
}

// Status "do lead" para a lista (mesma regra do /api/inteligencia/clientes).
export function statusDoLead(
  lead: LeadMapa,
): "ABERTO" | "GANHO" | "PERDIDO" | "PENDENTE" | null {
  if (lead.negocios.some((n) => n.pendente)) return "PENDENTE";
  if (lead.negocios.some((n) => n.status === "ABERTO")) return "ABERTO";
  if (lead.negocios.some((n) => n.status === "GANHO")) return "GANHO";
  if (lead.negocios.some((n) => n.status === "PERDIDO")) return "PERDIDO";
  return null;
}

export function classificarLead(lead: LeadMapa): CategoriaProduto {
  return classificarProduto({
    interesses: lead.produtosInteresse.map((p) => p.produtoInteresse.nome),
    anuncioTitulo: lead.anuncioTitulo,
    // Nomes das etapas dos negocios do lead (ex.: funil "Climatizador - ...").
    etapasNomes: lead.negocios.map((n) => n.etapa?.nome ?? null),
    origem: lead.origem,
  });
}

export function ultimoContatoDoLead(lead: LeadMapa): Date | null {
  let max: Date | null = null;
  for (const c of lead.conversas) {
    if (c.ultimaMensagemEm && (!max || c.ultimaMensagemEm > max)) {
      max = c.ultimaMensagemEm;
    }
  }
  return max;
}

export type ResumoUF = {
  uf: string;
  estado: string;
  regiao: string;
  clientes: number;
  porTemperatura: { quente: number; morno: number; frio: number };
  negocios: { abertos: number; ganhos: number; perdidos: number };
  valorAberto: number;
  faturamento: number;
  ticketMedio: number | null;
  populacao: number | null;
  clientesPor100k: number | null;
  produtosTop: { rotulo: CategoriaProduto; qtd: number }[];
  // Leads criados nas ultimas janelas (dimensao de tempo). Derivado de criadoEm,
  // sem migracao: agregacao em memoria sobre o que ja vem no select.
  novosPorMes: { ultimos30: number; ultimos90: number };
  ultimoContato: string | null;
};

// Monta o resumo de uma UF a partir dos leads dela. populacao vem do cache IBGE.
export function montarResumo(
  uf: string,
  leads: LeadMapa[],
  populacao: number | null,
): ResumoUF {
  const info = infoPorUF(uf);
  const porTemperatura = { quente: 0, morno: 0, frio: 0 };
  const negocios = { abertos: 0, ganhos: 0, perdidos: 0 };
  let valorAberto = 0;
  let faturamento = 0;
  const catCount = new Map<CategoriaProduto, number>();
  let ultimo: Date | null = null;
  const novosPorMes = { ultimos30: 0, ultimos90: 0 };
  const agora = Date.now();
  const dia = 24 * 60 * 60 * 1000;

  for (const lead of leads) {
    // Temperatura do lead = a do negocio principal (se houver).
    const principal = negocioPrincipal(lead);
    if (principal) {
      if (principal.temperatura === "QUENTE") porTemperatura.quente++;
      else if (principal.temperatura === "MORNO") porTemperatura.morno++;
      else if (principal.temperatura === "FRIO") porTemperatura.frio++;
    }

    for (const n of lead.negocios) {
      if (n.status === "ABERTO") {
        negocios.abertos++;
        valorAberto += toNum(n.valor);
      } else if (n.status === "GANHO") {
        negocios.ganhos++;
        faturamento += toNum(n.valor);
      } else if (n.status === "PERDIDO") {
        negocios.perdidos++;
      }
    }

    const cat = classificarLead(lead);
    catCount.set(cat, (catCount.get(cat) ?? 0) + 1);

    // Dimensao de tempo: leads criados nas ultimas janelas (30/90 dias).
    const idade = agora - lead.criadoEm.getTime();
    if (idade <= 30 * dia) novosPorMes.ultimos30++;
    if (idade <= 90 * dia) novosPorMes.ultimos90++;

    const uc = ultimoContatoDoLead(lead);
    if (uc && (!ultimo || uc > ultimo)) ultimo = uc;
  }

  const produtosTop = [...catCount.entries()]
    .map(([rotulo, qtd]) => ({ rotulo, qtd }))
    .sort((a, b) => b.qtd - a.qtd);

  const clientes = leads.length;
  const clientesPor100k =
    populacao && populacao > 0
      ? Math.round((clientes / populacao) * 100000 * 100) / 100
      : null;

  return {
    uf,
    estado: info?.estado ?? uf,
    regiao: info?.regiao ?? "",
    clientes,
    porTemperatura,
    negocios,
    valorAberto,
    faturamento,
    ticketMedio: negocios.ganhos > 0 ? faturamento / negocios.ganhos : null,
    populacao: populacao ?? null,
    clientesPor100k,
    produtosTop,
    novosPorMes,
    ultimoContato: ultimo ? ultimo.toISOString() : null,
  };
}
