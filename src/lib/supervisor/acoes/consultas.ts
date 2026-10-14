// Ferramentas de LEITURA do Supervisor (SPEC §5). São as ferramentas que a IA
// pode chamar no loop de tool-use para aprofundar o diagnóstico ALÉM do painel
// que já vem no contexto. Diferença crucial para as de escrita (acoes/registro):
// LEITURA NUNCA muda nada — só consulta. Todo número agregado vem da Camada 1
// (montarPainel/indicadores), não de SQL livre da IA; as listagens existem para
// a IA ter os `negocioId`/`agenteId`/`etapaId` REAIS que ela precisa para
// formar uma proposta de escrita VÁLIDA (o servidor revalida na confirmação).
import { prisma } from "../../prisma";
import { montarPainel } from "../painel";
import { valorEfetivo } from "../indicadores";
import type { SupervisorLimiares, Janela } from "../tipos";
import { Finalidade, StatusNeg } from "../../../generated/prisma/enums";
import type { Prisma } from "../../../generated/prisma/client";
import { lerId, lerNumero, lerTexto, type Args } from "./tipos";

// Contexto passado pelo orquestrador (ia.ts): limiares do semáforo (da config),
// escopo padrão do chat (finalidade/vendedor em foco) e o relógio. A IA pode
// sobrescrever finalidade/agenteId nos args de cada ferramenta.
export type ContextoLeitura = {
  limiares: SupervisorLimiares;
  escopoPadrao: { finalidade?: Finalidade; agenteId?: string };
  agora: Date;
};

export type FerramentaLeitura = {
  nome: string;
  descricao: string;
  inputSchema: Record<string, unknown>;
  executar: (args: Args, ctx: ContextoLeitura) => Promise<string>;
};

const LIMITE_PADRAO = 20;
const LIMITE_MAX = 50;

function limite(args: Args): number {
  const n = lerNumero(args, "limite");
  if (n == null) return LIMITE_PADRAO;
  return Math.max(1, Math.min(LIMITE_MAX, Math.trunc(n)));
}

function finalidadeDe(args: Args, ctx: ContextoLeitura): Finalidade | undefined {
  const bruto = (lerTexto(args, "finalidade") ?? "").trim().toUpperCase();
  if (bruto === "VENDA") return Finalidade.VENDA;
  if (bruto === "POS_VENDA") return Finalidade.POS_VENDA;
  return ctx.escopoPadrao.finalidade;
}

function agenteDe(args: Args, ctx: ContextoLeitura): string | undefined {
  return lerId(args, "agenteId") ?? ctx.escopoPadrao.agenteId;
}

// Janela dos últimos N dias (default 30), no mesmo shape que montarPainel usa.
function janelaDias(args: Args, agora: Date): Janela {
  const diasBruto = lerNumero(args, "dias");
  const dias = diasBruto != null && diasBruto > 0 ? Math.trunc(diasBruto) : 30;
  const fim = agora;
  const inicio = new Date(agora);
  inicio.setDate(inicio.getDate() - dias);
  return { inicio, fim };
}

function diasDesde(d: Date | null, agora: Date): number | null {
  if (!d) return null;
  return Math.floor((agora.getTime() - d.getTime()) / 86_400_000);
}

// ───────────────────────── consultar_painel ─────────────────────────
const consultarPainel: FerramentaLeitura = {
  nome: "consultar_painel",
  descricao:
    "Recalcula o painel de indicadores (métricas, funil, perdas, ranking de vendedores, semáforos) para uma janela/escopo específico. Use para recortar por vendedor, finalidade ou período diferente do painel já mostrado. Todos os números são calculados pelo servidor — nunca invente valores.",
  inputSchema: {
    type: "object",
    properties: {
      dias: { type: "number", description: "janela em dias (default 30)" },
      finalidade: {
        type: "string",
        enum: ["VENDA", "POS_VENDA"],
        description: "recorte por finalidade (default: escopo do chat)",
      },
      agenteId: {
        type: "string",
        description: "recorte por vendedor (id). Omita para a equipe toda.",
      },
    },
    additionalProperties: false,
  },
  async executar(args, ctx) {
    const painel = await montarPainel(
      janelaDias(args, ctx.agora),
      finalidadeDe(args, ctx) ?? null,
      ctx.limiares,
      { agenteId: agenteDe(args, ctx) },
      ctx.agora,
    );
    // Retorna o painel enxuto (sem repetir limiares, que a IA não precisa citar).
    const { limiares: _omit, ...resto } = painel;
    void _omit;
    return JSON.stringify(resto);
  },
};

// ───────────────────────── listar_negocios ─────────────────────────
const listarNegocios: FerramentaLeitura = {
  nome: "listar_negocios",
  descricao:
    "Lista negócios ABERTOS com seus ids reais, cliente, etapa atual, vendedor, temperatura, valor e há quantos dias estão parados na etapa. Use para encontrar o negocioId exato antes de propor uma ação (mover etapa, reatribuir, etc.) e para investigar negócios parados ou sem próximo passo.",
  inputSchema: {
    type: "object",
    properties: {
      finalidade: { type: "string", enum: ["VENDA", "POS_VENDA"] },
      agenteId: { type: "string", description: "filtra por vendedor (id)" },
      etapaId: { type: "string", description: "filtra por etapa (id)" },
      temperatura: { type: "string", enum: ["QUENTE", "MORNO", "FRIO"] },
      paradoDiasMin: {
        type: "number",
        description: "só negócios parados há pelo menos N dias na etapa atual",
      },
      semProximoPasso: {
        type: "boolean",
        description: "só negócios sem lembrete futuro pendente (sem próximo passo agendado)",
      },
      limite: { type: "number", description: `máx de itens (default ${LIMITE_PADRAO}, teto ${LIMITE_MAX})` },
    },
    additionalProperties: false,
  },
  async executar(args, ctx) {
    const finalidade = finalidadeDe(args, ctx);
    const agenteId = agenteDe(args, ctx);
    const etapaId = lerId(args, "etapaId");
    const tempBruto = (lerTexto(args, "temperatura") ?? "").trim().toUpperCase();
    const paradoDiasMin = lerNumero(args, "paradoDiasMin");
    const semProximo = args.semProximoPasso === true;

    const and: Prisma.NegocioWhereInput[] = [{ status: StatusNeg.ABERTO }];
    if (finalidade) and.push({ finalidade });
    if (agenteId) and.push({ agenteId });
    if (etapaId) and.push({ etapaId });
    if (tempBruto === "QUENTE" || tempBruto === "MORNO" || tempBruto === "FRIO") {
      and.push({ temperatura: tempBruto });
    }
    if (paradoDiasMin != null && paradoDiasMin > 0) {
      const corte = new Date(ctx.agora);
      corte.setDate(corte.getDate() - Math.trunc(paradoDiasMin));
      and.push({ entrouEtapaEm: { lte: corte } });
    }
    if (semProximo) {
      and.push({
        NOT: {
          lembretes: { some: { status: "PENDENTE", dataHora: { gte: ctx.agora } } },
        },
      });
    }

    const negocios = await prisma.negocio.findMany({
      where: { AND: and },
      select: {
        id: true,
        temperatura: true,
        valor: true,
        valorAjustado: true,
        entrouEtapaEm: true,
        criadoEm: true,
        lead: { select: { nome: true } },
        agente: { select: { nome: true } },
        etapa: { select: { nome: true } },
      },
      orderBy: { entrouEtapaEm: "asc" }, // mais parados primeiro
      take: limite(args),
    });

    const itens = negocios.map((n) => ({
      negocioId: n.id,
      cliente: n.lead?.nome ?? "(sem nome)",
      etapa: n.etapa?.nome ?? "(sem etapa)",
      vendedor: n.agente?.nome ?? null,
      temperatura: n.temperatura,
      valor: valorEfetivo(n.valor, n.valorAjustado),
      diasParado: diasDesde(n.entrouEtapaEm, ctx.agora),
      diasAberto: diasDesde(n.criadoEm, ctx.agora),
    }));
    return JSON.stringify({ total: itens.length, itens });
  },
};

// ───────────────────────── listar_vendedores ─────────────────────────
const listarVendedores: FerramentaLeitura = {
  nome: "listar_vendedores",
  descricao:
    "Lista os vendedores ATIVOS com id, nome e a quais finalidades têm acesso (venda/pós-venda). Use para obter o agenteId real antes de propor uma reatribuição.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  async executar() {
    const agentes = await prisma.agente.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        acessoVenda: true,
        acessoPosVenda: true,
      },
      orderBy: { nome: "asc" },
    });
    return JSON.stringify({ total: agentes.length, vendedores: agentes });
  },
};

// ───────────────────────── listar_etapas ─────────────────────────
const listarEtapas: FerramentaLeitura = {
  nome: "listar_etapas",
  descricao:
    "Lista as etapas ATIVAS do funil (id, nome, tipo ABERTA/GANHO/PERDIDO, ordem, finalidade). Use para obter o etapaId real antes de propor mover um negócio de etapa.",
  inputSchema: {
    type: "object",
    properties: {
      finalidade: { type: "string", enum: ["VENDA", "POS_VENDA"] },
    },
    additionalProperties: false,
  },
  async executar(args, ctx) {
    const finalidade = finalidadeDe(args, ctx);
    const etapas = await prisma.etapa.findMany({
      where: {
        ativo: true,
        ...(finalidade ? { finalidade: { in: [finalidade, "AMBAS"] } } : {}),
      },
      select: { id: true, nome: true, tipo: true, ordem: true, finalidade: true },
      orderBy: [{ finalidade: "asc" }, { ordem: "asc" }],
    });
    return JSON.stringify({ total: etapas.length, etapas });
  },
};

export const FERRAMENTAS_LEITURA: FerramentaLeitura[] = [
  consultarPainel,
  listarNegocios,
  listarVendedores,
  listarEtapas,
];

const POR_NOME = new Map<string, FerramentaLeitura>(
  FERRAMENTAS_LEITURA.map((f) => [f.nome, f]),
);

// Executa uma ferramenta de leitura por nome. NUNCA lança: erro de consulta vira
// um JSON de erro (a IA segue o loop sem quebrar o chat), mesmo princípio de
// "nunca quebra" do resto do pipeline de IA.
export async function executarLeitura(
  nome: string,
  args: Args,
  ctx: ContextoLeitura,
): Promise<string> {
  const f = POR_NOME.get(nome);
  if (!f) return JSON.stringify({ ok: false, erro: `ferramenta de leitura desconhecida: ${nome}` });
  try {
    return await f.executar(args, ctx);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error(`[supervisor] falha na leitura "${nome}": ${motivo}`);
    return JSON.stringify({ ok: false, erro: `falha ao consultar: ${motivo}` });
  }
}
