// Rastreio de PENDENCIAS (Fatia 3.17): agrega, NO SERVIDOR, os negocios atualmente
// pendentes (pendente=true, nao fechados) no escopo do usuario. Admin ve tudo
// (com ?agenteId opcional); colaborador ve so os seus (via escopoLeadWhere).
// Retorna totais + quebras por motivo, por usuario (dono) e por tempo, e a lista
// enxuta de negocios pendentes (para o link -> /inbox?lead= / kanban).
// Filtros: ?motivo=CODE, ?agenteId=<id> (admin), ?periodo=hoje|7d|15d|30d|custom.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin, escopoLeadWhere } from "@/lib/autorizacao";
import { janelaDeParams } from "@/lib/metricas";
import { rotuloPendencia } from "@/lib/motivosPendencia";
import { nomeEfetivo } from "@/lib/cliente";
import { Prisma } from "@/generated/prisma/client";
import { StatusNeg, Finalidade, AtividadeTipo } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEM_MOTIVO = "SEM_MOTIVO";
const SEM_DONO = "SEM_DONO";

function rotuloDe(code: string): string {
  return code === SEM_MOTIVO ? "Sem motivo" : rotuloPendencia(code);
}

// Faixa de tempo (dias pendente) para a quebra por tempo.
function faixaTempo(dias: number): string {
  if (dias <= 2) return "0-2d";
  if (dias <= 7) return "3-7d";
  if (dias <= 15) return "8-15d";
  return "15+";
}
const FAIXAS: { faixa: string; label: string }[] = [
  { faixa: "0-2d", label: "Até 2 dias" },
  { faixa: "3-7d", label: "3 a 7 dias" },
  { faixa: "8-15d", label: "8 a 15 dias" },
  { faixa: "15+", label: "Mais de 15 dias" },
];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const sp = req.nextUrl.searchParams;

  const where: Prisma.NegocioWhereInput = {
    pendente: true,
    status: { notIn: [StatusNeg.GANHO, StatusNeg.PERDIDO] },
    // Escopo canonico: admin => tudo (ou ?agenteId); colaborador => so os seus.
    lead: escopoLeadWhere(agente, sp),
  };
  const motivo = sp.get("motivo");
  if (motivo) where.motivoPendenciaCode = motivo;
  const janela = janelaDeParams(sp);
  if (janela) where.criadoEm = { gte: janela.inicio, lte: janela.fim };

  const negocios = await prisma.negocio.findMany({
    where,
    select: {
      id: true,
      finalidade: true,
      criadoEm: true,
      motivoPendenciaCode: true,
      motivoPendencia: true,
      lead: {
        select: {
          id: true,
          nome: true,
          pushName: true,
          nomeManual: true,
          telefone: true,
          dono: { select: { id: true, nome: true } },
          donoPosVenda: { select: { id: true, nome: true } },
        },
      },
    },
    orderBy: { criadoEm: "desc" },
  });

  // "Pendente desde" ~ ultima Atividade(PENDENCIA) do negocio (best-effort; nao ha
  // timestamp dedicado). Um negocio pendente teve como ultima PENDENCIA o "marcado".
  const ids = negocios.map((n) => n.id);
  const pendenteDesde = new Map<string, Date>();
  if (ids.length) {
    const ativs = await prisma.atividade.findMany({
      where: { tipo: AtividadeTipo.PENDENCIA, negocioId: { in: ids } },
      orderBy: { criadoEm: "desc" },
      select: { negocioId: true, criadoEm: true },
    });
    for (const a of ativs) {
      if (a.negocioId && !pendenteDesde.has(a.negocioId)) {
        pendenteDesde.set(a.negocioId, a.criadoEm);
      }
    }
  }

  const porMotivoMap = new Map<string, number>();
  const porUsuario = new Map<
    string,
    { nome: string; quantidade: number; motivos: Map<string, number> }
  >();
  const porTempoMap = new Map<string, number>();
  const leads = new Set<string>();
  const agora = Date.now();

  const lista = negocios.map((n) => {
    leads.add(n.lead.id);
    const code = n.motivoPendenciaCode ?? SEM_MOTIVO;
    porMotivoMap.set(code, (porMotivoMap.get(code) ?? 0) + 1);

    // Dono responsavel pela finalidade do negocio (mesma base do escopo).
    const dono =
      n.finalidade === Finalidade.VENDA ? n.lead.dono : n.lead.donoPosVenda;
    const donoId = dono?.id ?? SEM_DONO;
    const donoNome = dono?.nome ?? "Sem dono";
    let u = porUsuario.get(donoId);
    if (!u) {
      u = { nome: donoNome, quantidade: 0, motivos: new Map() };
      porUsuario.set(donoId, u);
    }
    u.quantidade += 1;
    u.motivos.set(code, (u.motivos.get(code) ?? 0) + 1);

    const desde = pendenteDesde.get(n.id) ?? n.criadoEm;
    const dias = (agora - desde.getTime()) / 86_400_000;
    const faixa = faixaTempo(dias);
    porTempoMap.set(faixa, (porTempoMap.get(faixa) ?? 0) + 1);

    return {
      negocioId: n.id,
      leadId: n.lead.id,
      clienteNome: nomeEfetivo(n.lead),
      telefone: n.lead.telefone,
      finalidade: n.finalidade,
      motivoCode: n.motivoPendenciaCode,
      motivoLabel: n.motivoPendenciaCode ? rotuloPendencia(n.motivoPendenciaCode) : null,
      observacao: n.motivoPendencia,
      donoNome,
      pendenteDesde: pendenteDesde.get(n.id)?.toISOString() ?? null,
    };
  });

  const porMotivo = [...porMotivoMap.entries()]
    .map(([code, quantidade]) => ({ code, label: rotuloDe(code), quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);

  const porUsuarioArr = [...porUsuario.entries()]
    .map(([agenteId, u]) => {
      const top = [...u.motivos.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        agenteId: agenteId === SEM_DONO ? null : agenteId,
        nome: u.nome,
        quantidade: u.quantidade,
        topMotivo: top
          ? { code: top[0], label: rotuloDe(top[0]), quantidade: top[1] }
          : null,
      };
    })
    .sort((a, b) => b.quantidade - a.quantidade);

  const porTempo = FAIXAS.map((f) => ({
    ...f,
    quantidade: porTempoMap.get(f.faixa) ?? 0,
  }));

  return NextResponse.json({
    totalClientes: leads.size,
    totalNegocios: negocios.length,
    porMotivo,
    porUsuario: porUsuarioArr,
    porTempo,
    negocios: lista,
    ehAdmin: ehAdmin(agente.papel),
  });
}
