// Analise de negocios PERDIDOS: agrega por motivo e lista os itens. Escopo por
// dono (donoId/donoPosVendaId) e periodo por fechadoEm. Reusado pela carteira,
// pela analise dedicada e pela pagina de detalhe da meta.
import { prisma } from "./prisma";
import { campoDono } from "./dono";
import { nomeEfetivo } from "./cliente";
import { rotuloMotivo } from "./motivosPerda";
import { Finalidade, StatusNeg } from "../generated/prisma/enums";
import type { Prisma } from "../generated/prisma/client";

export type PerdidoPorMotivo = {
  code: string;
  label: string;
  count: number;
  valor: number;
  pct: number;
};

export type PerdidoItem = {
  negocioId: string;
  leadId: string;
  nome: string;
  telefone: string;
  fotoUrl: string | null;
  motivoCode: string | null;
  motivoLabel: string;
  obs: string | null;
  valor: number | null;
  fechadoEm: Date | null;
};

export type AnalisePerdidos = {
  total: number;
  valorTotal: number;
  porMotivo: PerdidoPorMotivo[];
  itens: PerdidoItem[];
};

export async function analisarPerdidos(opts: {
  finalidade: Finalidade;
  alvoId: string | null;
  inicio?: Date | null;
  fim?: Date | null;
}): Promise<AnalisePerdidos> {
  const { finalidade, alvoId, inicio, fim } = opts;
  const campo = campoDono(finalidade);

  const where: Prisma.NegocioWhereInput = {
    finalidade,
    status: StatusNeg.PERDIDO,
  };
  if (alvoId) where.lead = { [campo]: alvoId };
  if (inicio || fim) {
    where.fechadoEm = {};
    if (inicio) where.fechadoEm.gte = inicio;
    if (fim) where.fechadoEm.lte = fim;
  }

  const negocios = await prisma.negocio.findMany({
    where,
    orderBy: { fechadoEm: "desc" },
    select: {
      id: true,
      valor: true,
      motivoPerda: true,
      motivoPerdaObs: true,
      fechadoEm: true,
      lead: {
        select: {
          id: true,
          nome: true,
          pushName: true,
          nomeManual: true,
          telefone: true,
          fotoUrl: true,
        },
      },
    },
  });

  const itens: PerdidoItem[] = negocios.map((n) => ({
    negocioId: n.id,
    leadId: n.lead.id,
    nome: nomeEfetivo(n.lead),
    telefone: n.lead.telefone,
    fotoUrl: n.lead.fotoUrl,
    motivoCode: n.motivoPerda,
    motivoLabel: rotuloMotivo(n.motivoPerda),
    obs: n.motivoPerdaObs,
    valor: n.valor != null ? Number(n.valor) : null,
    fechadoEm: n.fechadoEm,
  }));

  const total = itens.length;
  const valorTotal = itens.reduce((s, i) => s + (i.valor ?? 0), 0);

  // Agrupa por motivo (chave = code, ou "" quando sem motivo).
  const mapa = new Map<string, { label: string; count: number; valor: number }>();
  for (const i of itens) {
    const chave = i.motivoCode ?? "";
    const atual = mapa.get(chave) ?? { label: i.motivoLabel, count: 0, valor: 0 };
    atual.count += 1;
    atual.valor += i.valor ?? 0;
    mapa.set(chave, atual);
  }
  const porMotivo: PerdidoPorMotivo[] = [...mapa.entries()]
    .map(([code, v]) => ({
      code,
      label: v.label,
      count: v.count,
      valor: v.valor,
      pct: total > 0 ? Math.round((v.count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { total, valorTotal, porMotivo, itens };
}
