// Mapa: agregado por UF (centro de clientes georreferenciado). Cruza dados
// internos (clientes/negocios/valor/produto) com a populacao IBGE (potencial de
// mercado). UF via Endereco.uf -> fallback DDD do telefone. Sempre 200.
// Filtros opcionais (query) refinam os leads ANTES de agregar, entao recolorem o
// mapa e os KPIs: categoria, temperatura, situacao (abertos/ganhos/perdidos),
// periodo (30/90 dias por ultimo contato).
// GET /api/mapa/estados  (agente logado -> 401)
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, escopoLeadWhere } from "@/lib/autorizacao";
import { mapaPopulacao } from "@/lib/ibge";
import {
  selectLeadMapa,
  resolverUF,
  montarResumo,
  negocioPrincipal,
  classificarLead,
  ultimoContatoDoLead,
  type LeadMapa,
  type ResumoUF,
} from "@/lib/mapa";
import { CATEGORIAS_PRODUTO } from "@/lib/classificar-produto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Janelas de periodo aceitas (dias). null = "todos" (default, sem corte). O
// periodo filtra por ULTIMO CONTATO (ultimaMensagemEm) do lead — ver leadPassa.
const PERIODOS_VALIDOS = [7, 30, 90, 180] as const;
type Periodo = (typeof PERIODOS_VALIDOS)[number];

type Filtros = {
  categoria: string | null;
  temperatura: "QUENTE" | "MORNO" | "FRIO" | null;
  situacao: "abertos" | "ganhos" | "perdidos" | null;
  segmento: "VAREJO" | "ATACADO" | null;
  periodo: Periodo | null;
};

function lerFiltros(sp: URLSearchParams): Filtros {
  const cat = sp.get("categoria");
  const temp = sp.get("temperatura");
  const sit = sp.get("situacao");
  const seg = sp.get("segmento");
  const per = Number(sp.get("periodo"));
  return {
    categoria: cat && CATEGORIAS_PRODUTO.includes(cat as never) ? cat : null,
    temperatura:
      temp === "QUENTE" || temp === "MORNO" || temp === "FRIO" ? temp : null,
    situacao:
      sit === "abertos" || sit === "ganhos" || sit === "perdidos" ? sit : null,
    segmento: seg === "VAREJO" || seg === "ATACADO" ? seg : null,
    periodo: PERIODOS_VALIDOS.includes(per as Periodo) ? (per as Periodo) : null,
  };
}

function leadPassa(lead: LeadMapa, f: Filtros): boolean {
  if (f.categoria && classificarLead(lead) !== f.categoria) return false;
  if (f.segmento && lead.segmento !== f.segmento) return false;
  if (f.temperatura) {
    const p = negocioPrincipal(lead);
    if (!p || p.temperatura !== f.temperatura) return false;
  }
  if (f.situacao) {
    const alvo =
      f.situacao === "abertos"
        ? "ABERTO"
        : f.situacao === "ganhos"
          ? "GANHO"
          : "PERDIDO";
    if (!lead.negocios.some((n) => n.status === alvo)) return false;
  }
  if (f.periodo) {
    const uc = ultimoContatoDoLead(lead);
    if (!uc) return false;
    if (uc.getTime() < Date.now() - f.periodo * 24 * 60 * 60 * 1000) return false;
  }
  return true;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const filtros = lerFiltros(req.nextUrl.searchParams);

  // Escopo por dono: colaborador ve so os seus; admin ve tudo (ou ?agenteId/
  // ?semDono). Os filtros em memoria (leadPassa) combinam por cima (AND).
  const where = escopoLeadWhere(agente, req.nextUrl.searchParams);

  const [leadsTodos, populacaoPorUF] = await Promise.all([
    prisma.lead.findMany({ where, select: selectLeadMapa }),
    mapaPopulacao(),
  ]);
  const leads = leadsTodos.filter((l) => leadPassa(l, filtros));

  // Agrupa os leads por UF (ou conta como semUF quando nao da para inferir).
  const porUFLeads = new Map<string, LeadMapa[]>();
  let semUF = 0;
  for (const lead of leads) {
    const uf = resolverUF(lead);
    if (!uf) {
      semUF++;
      continue;
    }
    const lista = porUFLeads.get(uf);
    if (lista) lista.push(lead);
    else porUFLeads.set(uf, [lead]);
  }

  const porUF: ResumoUF[] = [];
  const totais = {
    clientes: 0,
    abertos: 0,
    ganhos: 0,
    perdidos: 0,
    valorAberto: 0,
    faturamento: 0,
  };
  for (const [uf, lista] of porUFLeads) {
    const resumo = montarResumo(uf, lista, populacaoPorUF.get(uf) ?? null);
    porUF.push(resumo);
    totais.clientes += resumo.clientes;
    totais.abertos += resumo.negocios.abertos;
    totais.ganhos += resumo.negocios.ganhos;
    totais.perdidos += resumo.negocios.perdidos;
    totais.valorAberto += resumo.valorAberto;
    totais.faturamento += resumo.faturamento;
  }
  porUF.sort((a, b) => b.clientes - a.clientes);

  return NextResponse.json({
    porUF,
    totais,
    semUF,
    fontePopulacao: "IBGE — Estimativas de Populacao",
  });
}
