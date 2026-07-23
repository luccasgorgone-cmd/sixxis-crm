// Monta o EstadoCrm (estado atual do lead) para a mesclagem CRM x Loja. PONTO
// UNICO, usado pela rota antiga (por leadId) e pelas rotas internas da Fatia AB
// (previa/aplicar). codigosRastreio = null quando nao ha negocio resolvido — o
// rastreio entao nem e oferecido.
import { prisma } from "./prisma";
import { nomeEfetivo } from "./cliente";
import { StatusNeg } from "@/generated/prisma/enums";
import type { EstadoCrm } from "./sincronizarLoja";

export async function montarEstadoLead(
  leadId: string,
  negocioId: string | null,
): Promise<{ estado: EstadoCrm; telefone: string } | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      nome: true,
      pushName: true,
      nomeManual: true,
      telefone: true,
      cpf: true,
      email: true,
      empresa: true,
    },
  });
  if (!lead) return null;

  const principal = await prisma.endereco.findFirst({
    where: { leadId, principal: true },
    select: {
      cep: true,
      logradouro: true,
      numero: true,
      complemento: true,
      bairro: true,
      cidade: true,
      uf: true,
    },
  });

  const nfs = await prisma.notaFiscal.findMany({
    where: { leadId },
    select: { numero: true },
  });

  // Rastreio so faz sentido com um negocio DO PROPRIO lead.
  let codigosRastreio: string[] | null = null;
  if (negocioId) {
    const negocio = await prisma.negocio.findFirst({
      where: { id: negocioId, leadId },
      select: { rastreios: { select: { codigo: true } } },
    });
    if (negocio) codigosRastreio = negocio.rastreios.map((r) => r.codigo);
  }

  return {
    telefone: lead.telefone,
    estado: {
      nomeEfetivo: nomeEfetivo(lead),
      temNomeReal: !!(
        lead.nomeManual?.trim() ||
        lead.pushName?.trim() ||
        lead.nome?.trim()
      ),
      cpf: lead.cpf ?? null,
      email: lead.email ?? null,
      empresa: lead.empresa ?? null,
      endereco: {
        cep: principal?.cep ?? null,
        logradouro: principal?.logradouro ?? null,
        numero: principal?.numero ?? null,
        complemento: principal?.complemento ?? null,
        bairro: principal?.bairro ?? null,
        cidade: principal?.cidade ?? null,
        uf: principal?.uf ?? null,
      },
      numerosNF: nfs.map((n) => n.numero),
      codigosRastreio,
    },
  };
}

// Resolve o negocio para vincular NF/rastreio: o informado (se e do lead), senao
// o UNICO negocio ABERTO do lead. Ambiguo (varios abertos) -> null + flag.
export async function resolverNegocioLead(
  leadId: string,
  negocioIdBody: string | null,
): Promise<{ id: string | null; ambiguo: boolean }> {
  if (negocioIdBody) {
    const n = await prisma.negocio.findFirst({
      where: { id: negocioIdBody, leadId },
      select: { id: true },
    });
    if (n) return { id: n.id, ambiguo: false };
  }
  const abertos = await prisma.negocio.findMany({
    where: { leadId, status: StatusNeg.ABERTO },
    select: { id: true },
  });
  if (abertos.length === 1) return { id: abertos[0].id, ambiguo: false };
  return { id: null, ambiguo: abertos.length > 1 };
}
