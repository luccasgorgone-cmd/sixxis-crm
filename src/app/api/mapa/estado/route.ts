// Mapa: detalhe completo de UMA UF (drill-down do drawer). Resumo (mesmos campos
// do agregado) + lista de clientes enriquecida + recortes: top compradores,
// recorrentes, perdidos e pendentes (negocios abertos). UF via Endereco.uf ->
// fallback DDD. Sempre 200 (400 so para uf invalida). Somente leitura.
// GET /api/mapa/estado?uf=XX  (agente logado -> 401)
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, escopoLeadWhere } from "@/lib/autorizacao";
import { CAPITAIS } from "@/lib/capitais";
import { mapaPopulacao } from "@/lib/ibge";
import { nomeEfetivo } from "@/lib/cliente";
import { formatarTelefone } from "@/lib/format";
import { rotuloMotivo } from "@/lib/motivosPerda";
import {
  selectLeadMapa,
  resolverUF,
  montarResumo,
  negocioPrincipal,
  statusDoLead,
  classificarLead,
  cidadeDoLead,
  ultimoContatoDoLead,
  toNum,
} from "@/lib/mapa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE = 200;

type ClienteMapa = {
  leadId: string;
  negocioId: string | null;
  conversaId: string | null;
  nome: string;
  telefone: string;
  temperatura: "QUENTE" | "MORNO" | "FRIO" | null;
  finalidade: "VENDA" | "POS_VENDA" | null;
  garantia: boolean | null;
  segmento: "VAREJO" | "ATACADO" | null;
  temRastreio: boolean;
  status: "ABERTO" | "GANHO" | "PERDIDO" | "PENDENTE" | null;
  etapa: string | null;
  etapaId: string | null;
  valorAberto: number;
  produtoClassificado: string;
  origem: string | null;
  anuncioTitulo: string | null;
  cidade: string | null;
  criadoEm: string;
  ultimoContato: string | null;
  totalCompras: number;
  valorComprado: number;
  motivoPerda: string | null;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const uf = (req.nextUrl.searchParams.get("uf") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf) || !CAPITAIS[uf]) {
    return NextResponse.json({ erro: "uf invalida" }, { status: 400 });
  }

  // Escopo por dono: o vendedor abrindo uma UF so ve os SEUS clientes de la;
  // admin ve todos (ou ?agenteId/?semDono). A UF continua filtrada em memoria.
  const where = escopoLeadWhere(agente, req.nextUrl.searchParams);

  const [leadsTodos, populacaoPorUF] = await Promise.all([
    prisma.lead.findMany({ where, select: selectLeadMapa }),
    mapaPopulacao(),
  ]);

  const leads = leadsTodos.filter((l) => resolverUF(l) === uf);
  const resumo = montarResumo(uf, leads, populacaoPorUF.get(uf) ?? null);

  const clientes: ClienteMapa[] = leads.map((lead) => {
    const principal = negocioPrincipal(lead);

    // Conversa de referencia: a de contato mais recente.
    let conversaId: string | null = lead.conversas[0]?.id ?? null;
    let maxContato: Date | null = null;
    for (const c of lead.conversas) {
      if (c.ultimaMensagemEm && (!maxContato || c.ultimaMensagemEm > maxContato)) {
        maxContato = c.ultimaMensagemEm;
        conversaId = c.id;
      }
    }

    const valorAberto = lead.negocios
      .filter((n) => n.status === "ABERTO")
      .reduce((s, n) => s + toNum(n.valor), 0);
    const ganhos = lead.negocios.filter((n) => n.status === "GANHO");
    const valorComprado = ganhos.reduce((s, n) => s + toNum(n.valor), 0);

    // Motivo do perdido mais recente (para a aba Perdidos).
    const perdidos = lead.negocios
      .filter((n) => n.status === "PERDIDO")
      .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());
    const motivoPerda = perdidos[0]?.motivoPerda
      ? rotuloMotivo(perdidos[0].motivoPerda)
      : null;

    const uc = ultimoContatoDoLead(lead);

    return {
      leadId: lead.id,
      negocioId: principal?.id ?? null,
      conversaId,
      nome: nomeEfetivo(lead),
      telefone: formatarTelefone(lead.telefone),
      temperatura: principal?.temperatura ?? null,
      finalidade: principal?.finalidade ?? null,
      garantia: lead.garantia,
      segmento: lead.segmento,
      temRastreio: lead.negocios.some((n) => n.rastreios.length > 0),
      status: statusDoLead(lead),
      etapa: principal?.etapa?.nome ?? null,
      etapaId: principal?.etapaId ?? null,
      valorAberto,
      produtoClassificado: classificarLead(lead),
      origem: lead.origem,
      anuncioTitulo: lead.anuncioTitulo,
      cidade: cidadeDoLead(lead),
      criadoEm: lead.criadoEm.toISOString(),
      ultimoContato: uc ? uc.toISOString() : null,
      totalCompras: ganhos.length,
      valorComprado,
      motivoPerda,
    };
  });

  // Recortes derivados (calculados sobre o conjunto completo, depois limitados).
  const topCompradores = clientes
    .filter((c) => c.valorComprado > 0)
    .sort((a, b) => b.valorComprado - a.valorComprado)
    .slice(0, LIMITE);
  const recorrentes = clientes
    .filter((c) => c.totalCompras >= 2)
    .sort((a, b) => b.totalCompras - a.totalCompras)
    .slice(0, LIMITE);
  const perdidos = clientes
    .filter((c) => c.status === "PERDIDO" || c.motivoPerda != null)
    .slice(0, LIMITE);
  const pendentes = clientes
    .filter((c) => c.status === "ABERTO" || c.status === "PENDENTE")
    .sort((a, b) => b.valorAberto - a.valorAberto)
    .slice(0, LIMITE);

  // Lista principal ordenada por ultimo contato desc.
  const clientesOrdenados = [...clientes].sort((a, b) => {
    const ta = a.ultimoContato ? new Date(a.ultimoContato).getTime() : 0;
    const tb = b.ultimoContato ? new Date(b.ultimoContato).getTime() : 0;
    return tb - ta;
  });

  return NextResponse.json({
    uf,
    resumo,
    total: clientes.length,
    clientes: clientesOrdenados.slice(0, LIMITE),
    topCompradores,
    recorrentes,
    perdidos,
    pendentes,
  });
}
