// Consultas da CARTEIRA DE LEADS: lista com escopo (vendedor ve so os seus;
// admin ve tudo) + filtros (UF, categoria, status, classe, busca) e o selo
// "ja tem conversa/lead" (casa o telefone normalizado com Lead.telefone, que usa
// a MESMA normalizacao). Metricas agregadas para admin/supervisor.
import { prisma } from "@/lib/prisma";
import { Papel } from "@/generated/prisma/enums";
import type { CarteiraCategoria, CarteiraStatusContato } from "@/generated/prisma/enums";

export type FiltrosCarteira = {
  uf?: string | null;
  categoria?: string | null;
  status?: string | null;
  classe?: string | null;
  donoId?: string | null; // so admin usa (filtrar por vendedor)
  busca?: string | null;
  pagina?: number;
  porPagina?: number;
};

type AgenteMin = { id: string; papel: Papel };

const CATS = new Set(["REVENDA", "VAREJO", "LOCACAO", "OUTRO"]);
const STATUS = new Set(["NOVO", "EM_ABORDAGEM", "RESPONDEU", "CONVERTIDO", "DESCARTADO"]);

export async function listarContatos(agente: AgenteMin, f: FiltrosCarteira) {
  const ehAdmin = agente.papel === Papel.ADMIN;
  const porPagina = Math.min(Math.max(f.porPagina ?? 60, 1), 200);
  const pagina = Math.max(f.pagina ?? 1, 1);

  const where: Record<string, unknown> = {};
  // Escopo: vendedor ve SO os contatos de que e dono. Admin ve todos (e pode
  // filtrar por vendedor com donoId).
  if (ehAdmin) {
    if (f.donoId) where.donoId = f.donoId;
  } else {
    where.donoId = agente.id;
  }
  if (f.uf) where.uf = f.uf.toUpperCase();
  if (f.categoria && CATS.has(f.categoria.toUpperCase())) {
    where.categoria = f.categoria.toUpperCase() as CarteiraCategoria;
  }
  if (f.status && STATUS.has(f.status.toUpperCase())) {
    where.status = f.status.toUpperCase() as CarteiraStatusContato;
  }
  if (f.classe) where.classe = f.classe.toUpperCase();
  if (f.busca && f.busca.trim()) {
    const q = f.busca.trim();
    const qTel = q.replace(/\D/g, "");
    where.OR = [
      { nome: { contains: q, mode: "insensitive" } },
      { cidade: { contains: q, mode: "insensitive" } },
      ...(qTel ? [{ telefone: { contains: qTel } }] : []),
    ];
  }

  const [total, contatos] = await Promise.all([
    prisma.carteiraContato.count({ where }),
    prisma.carteiraContato.findMany({
      where,
      orderBy: [{ status: "asc" }, { score: { sort: "desc", nulls: "last" } }, { nome: "asc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      select: {
        id: true,
        telefone: true,
        nome: true,
        uf: true,
        cidade: true,
        bairro: true,
        endereco: true,
        categoria: true,
        segmento: true,
        notaGoogle: true,
        numAvaliacoes: true,
        score: true,
        classe: true,
        curvaCidade: true,
        emailPublico: true,
        linkFonte: true,
        perfilObs: true,
        status: true,
        donoId: true,
        leadId: true,
        ativadoEm: true,
        dono: { select: { id: true, nome: true } },
      },
    }),
  ]);

  // Selo "ja tem conversa/lead": casa o telefone (normalizado) com Lead.telefone.
  // Uma query so para a pagina inteira. leadId != null ja indica ativado por aqui.
  const telefones = contatos.map((c) => c.telefone);
  const leads =
    telefones.length > 0
      ? await prisma.lead.findMany({
          where: { telefone: { in: telefones } },
          select: { id: true, telefone: true },
        })
      : [];
  const leadPorTelefone = new Map(leads.map((l) => [l.telefone, l.id]));

  const resumo = await resumoPorStatus(where);

  return {
    total,
    pagina,
    porPagina,
    resumo,
    contatos: contatos.map((c) => ({
      ...c,
      jaTemLead: c.leadId != null || leadPorTelefone.has(c.telefone),
      leadExistenteId: c.leadId ?? leadPorTelefone.get(c.telefone) ?? null,
    })),
  };
}

async function resumoPorStatus(where: Record<string, unknown>) {
  const grupos = await prisma.carteiraContato.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  const base: Record<string, number> = {
    NOVO: 0,
    EM_ABORDAGEM: 0,
    RESPONDEU: 0,
    CONVERTIDO: 0,
    DESCARTADO: 0,
  };
  for (const g of grupos) base[g.status] = g._count._all;
  return base;
}

// Numeros disponiveis para iniciar a 1a mensagem (o vendedor escolhe). So linhas
// ATIVAS de VENDA (prospeccao e venda).
export async function numerosDisponiveis() {
  return prisma.instanciaWhatsApp.findMany({
    where: { ativo: true, finalidade: "VENDA" },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, numero: true, provider: true },
  });
}

// Metricas agregadas para o painel admin/supervisor.
export async function metricasCarteira() {
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);

  const [porVendedor, porStatusGlobal, atividadeHoje, ativadosHoje, totais] = await Promise.all([
    prisma.carteiraContato.groupBy({
      by: ["donoId", "status"],
      _count: { _all: true },
    }),
    prisma.carteiraContato.groupBy({ by: ["status"], _count: { _all: true } }),
    // Abordagens (ativacoes) de hoje por vendedor.
    prisma.carteiraAtividade.groupBy({
      by: ["agenteId"],
      where: { tipo: "ATIVOU", criadoEm: { gte: inicioHoje } },
      _count: { _all: true },
    }),
    prisma.carteiraContato.count({ where: { ativadoEm: { gte: inicioHoje } } }),
    prisma.carteiraContato.count(),
  ]);

  const vendedores = await prisma.agente.findMany({
    where: { ativo: true },
    select: { id: true, nome: true },
  });
  const nomePorId = new Map(vendedores.map((v) => [v.id, v.nome]));

  const porDono: Record<
    string,
    { nome: string; total: number; novo: number; emAbordagem: number; respondeu: number; convertido: number; descartado: number; ativadosHoje: number }
  > = {};
  for (const g of porVendedor) {
    const id = g.donoId ?? "SEM_DONO";
    if (!porDono[id]) {
      porDono[id] = {
        nome: g.donoId ? nomePorId.get(g.donoId) ?? "(desconhecido)" : "(sem dono)",
        total: 0,
        novo: 0,
        emAbordagem: 0,
        respondeu: 0,
        convertido: 0,
        descartado: 0,
        ativadosHoje: 0,
      };
    }
    const d = porDono[id];
    d.total += g._count._all;
    if (g.status === "NOVO") d.novo += g._count._all;
    else if (g.status === "EM_ABORDAGEM") d.emAbordagem += g._count._all;
    else if (g.status === "RESPONDEU") d.respondeu += g._count._all;
    else if (g.status === "CONVERTIDO") d.convertido += g._count._all;
    else if (g.status === "DESCARTADO") d.descartado += g._count._all;
  }
  for (const a of atividadeHoje) {
    const id = a.agenteId ?? "SEM_DONO";
    if (porDono[id]) porDono[id].ativadosHoje = a._count._all;
  }

  const statusGlobal: Record<string, number> = {
    NOVO: 0,
    EM_ABORDAGEM: 0,
    RESPONDEU: 0,
    CONVERTIDO: 0,
    DESCARTADO: 0,
  };
  for (const g of porStatusGlobal) statusGlobal[g.status] = g._count._all;

  return {
    totais: { contatos: totais, ativadosHoje },
    statusGlobal,
    vendedores,
    porVendedor: Object.entries(porDono)
      .map(([donoId, v]) => ({ donoId, ...v }))
      .sort((a, b) => b.total - a.total),
  };
}
