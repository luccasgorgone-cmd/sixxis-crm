// Seed idempotente do agente ADMIN, executado no boot do servidor.
// Se nao existir Agente com email = ADMIN_EMAIL, cria um ADMIN com a senha
// (bcrypt) de ADMIN_SENHA. Se ja existir, garante que tem senha definida.
// Nunca derruba o boot: erros sao logados e engolidos.
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import {
  Papel,
  TipoEtapa,
  Finalidade,
  FinalidadeEtapa,
} from "../generated/prisma/enums";
import { garantirNegocioParaLead } from "./negocio";

export async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const senha = process.env.ADMIN_SENHA;

  if (!email || !senha) {
    console.warn(
      "[seed] ADMIN_EMAIL/ADMIN_SENHA ausentes; seed do admin ignorado",
    );
    return;
  }

  try {
    const existente = await prisma.agente.findUnique({ where: { email } });

    if (existente) {
      // Garante senha caso o registro tenha vindo de fases anteriores sem ela.
      if (!existente.senha) {
        const hash = await bcrypt.hash(senha, 10);
        await prisma.agente.update({
          where: { id: existente.id },
          data: { senha: hash, papel: Papel.ADMIN, ativo: true },
        });
        console.log("[seed] admin ok (senha definida)");
      } else {
        console.log("[seed] admin ok");
      }
      return;
    }

    const hash = await bcrypt.hash(senha, 10);
    await prisma.agente.create({
      data: {
        nome: "Administrador",
        email,
        senha: hash,
        papel: Papel.ADMIN,
        ativo: true,
      },
    });
    console.log("[seed] admin criado");
  } catch (erro) {
    console.error(
      `[seed] falha ao semear admin: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Etapas padrao do funil. So semeia se NENHUMA etapa existir (idempotente).
const ETAPAS_PADRAO: {
  nome: string;
  cor: string;
  tipo: TipoEtapa;
  ordem: number;
}[] = [
  { nome: "Novo", cor: "#64748b", tipo: TipoEtapa.ABERTA, ordem: 1 },
  { nome: "Em atendimento", cor: "#3cbfb3", tipo: TipoEtapa.ABERTA, ordem: 2 },
  { nome: "Negociando", cor: "#0ea5e9", tipo: TipoEtapa.ABERTA, ordem: 3 },
  {
    nome: "Aguardando pagamento",
    cor: "#f59e0b",
    tipo: TipoEtapa.ABERTA,
    ordem: 4,
  },
  { nome: "Vendido", cor: "#16a34a", tipo: TipoEtapa.GANHO, ordem: 5 },
  { nome: "Perdido", cor: "#dc2626", tipo: TipoEtapa.PERDIDO, ordem: 6 },
];

// Etiquetas padrao. So semeia se NENHUMA existir (idempotente).
const ETIQUETAS_PADRAO: { nome: string; cor: string }[] = [
  { nome: "Quente", cor: "#dc2626" },
  { nome: "Morno", cor: "#f59e0b" },
  { nome: "Frio", cor: "#0ea5e9" },
  { nome: "VIP", cor: "#7c3aed" },
  { nome: "Aguardando", cor: "#64748b" },
  { nome: "Pos-venda", cor: "#16a34a" },
];

export async function seedFunil(): Promise<void> {
  try {
    const totalEtapas = await prisma.etapa.count();
    if (totalEtapas === 0) {
      await prisma.etapa.createMany({ data: ETAPAS_PADRAO });
      console.log(`[seed] funil: ${ETAPAS_PADRAO.length} etapas criadas`);
    } else {
      console.log("[seed] funil ok");
    }

    const totalEtiquetas = await prisma.etiqueta.count();
    if (totalEtiquetas === 0) {
      await prisma.etiqueta.createMany({ data: ETIQUETAS_PADRAO });
      console.log(`[seed] ${ETIQUETAS_PADRAO.length} etiquetas criadas`);
    } else {
      console.log("[seed] etiquetas ok");
    }
  } catch (erro) {
    console.error(
      `[seed] falha ao semear funil: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Vendedor de teste opcional (para validar papeis). So cria se as envs
// existirem e ainda nao houver Agente com esse email.
export async function seedVendedorTeste(): Promise<void> {
  const email = process.env.VENDEDOR_EMAIL?.toLowerCase().trim();
  const senha = process.env.VENDEDOR_SENHA;
  if (!email || !senha) return;

  try {
    const existente = await prisma.agente.findUnique({ where: { email } });
    if (existente) {
      console.log("[seed] vendedor de teste ok");
      return;
    }
    const hash = await bcrypt.hash(senha, 10);
    await prisma.agente.create({
      data: {
        nome: "Vendedor de Teste",
        email,
        senha: hash,
        papel: Papel.VENDEDOR,
        ativo: true,
      },
    });
    console.log("[seed] vendedor de teste criado");
  } catch (erro) {
    console.error(
      `[seed] falha ao semear vendedor de teste: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Observacoes pre-definidas semeadas se a tabela estiver vazia.
const OBSERVACOES_PADRAO: string[] = [
  "Cliente pediu desconto",
  "Aguardando pagamento",
  "Sem resposta ha 24h",
  "Pos-venda: acompanhar entrega",
  "Lead frio - reengajar",
  "Interessado em outro produto",
];

export async function seedRoteamentoEPresets(): Promise<void> {
  try {
    const config = await prisma.configRoteamento.findFirst();
    if (!config) {
      await prisma.configRoteamento.create({ data: {} });
      console.log("[seed] config de roteamento criada");
    } else {
      console.log("[seed] config de roteamento ok");
    }

    const totalObs = await prisma.observacaoPreset.count();
    if (totalObs === 0) {
      await prisma.observacaoPreset.createMany({
        data: OBSERVACOES_PADRAO.map((texto, i) => ({ texto, ordem: i + 1 })),
      });
      console.log(
        `[seed] ${OBSERVACOES_PADRAO.length} observacoes pre-definidas criadas`,
      );
    } else {
      console.log("[seed] observacoes pre-definidas ok");
    }
  } catch (erro) {
    console.error(
      `[seed] falha ao semear roteamento/presets: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Funil padrao de POS-VENDA (criado uma vez junto da migracao de finalidade).
const ETAPAS_POSVENDA: { nome: string; cor: string; tipo: TipoEtapa }[] = [
  { nome: "Aberto", cor: "#64748b", tipo: TipoEtapa.ABERTA },
  { nome: "Em atendimento", cor: "#3cbfb3", tipo: TipoEtapa.ABERTA },
  { nome: "Aguardando cliente", cor: "#f59e0b", tipo: TipoEtapa.ABERTA },
  { nome: "Resolvido", cor: "#16a34a", tipo: TipoEtapa.GANHO },
  { nome: "Encerrado sem solucao", cor: "#dc2626", tipo: TipoEtapa.PERDIDO },
];

// Instancia atual + backfill de finalidade/instancia + funil de pos-venda.
export async function seedFinalidadeEInstancias(): Promise<void> {
  try {
    // 1) Instancia atual (numero de vendas).
    const instNome = process.env.EVOLUTION_INSTANCE || "sixxis-wa1";
    let instancia = await prisma.instanciaWhatsApp.findUnique({
      where: { instanciaEvolution: instNome },
    });
    if (!instancia) {
      instancia = await prisma.instanciaWhatsApp.create({
        data: {
          nome: "Sixxis Vendas 1",
          instanciaEvolution: instNome,
          numero: "5518997257602",
          finalidade: Finalidade.VENDA,
          ativo: true,
        },
      });
      console.log("[seed] instancia WhatsApp criada");
    } else {
      console.log("[seed] instancia WhatsApp ok");
    }

    // 2) Backfill: conversas sem instancia -> a instancia atual (legado = venda).
    const upd = await prisma.conversa.updateMany({
      where: { instanciaId: null },
      data: { instanciaId: instancia.id },
    });
    if (upd.count > 0) {
      console.log(`[seed] backfill instancia em ${upd.count} conversas`);
    }

    // 3) Funil de POS-VENDA + 2.3 etapas -> AMBAS (uma vez, guardado).
    const temPosVenda = await prisma.etapa.count({
      where: { finalidade: FinalidadeEtapa.POS_VENDA },
    });
    if (temPosVenda === 0) {
      const ultima = await prisma.etapa.findFirst({
        orderBy: { ordem: "desc" },
        select: { ordem: true },
      });
      let ordem = ultima?.ordem ?? 0;
      await prisma.etapa.createMany({
        data: ETAPAS_POSVENDA.map((e) => ({
          ...e,
          ordem: ++ordem,
          finalidade: FinalidadeEtapa.POS_VENDA,
        })),
      });
      console.log(
        `[seed] funil pos-venda criado (${ETAPAS_POSVENDA.length} etapas)`,
      );
    } else {
      console.log("[seed] funil pos-venda ok");
    }

    // A1 (2.5): as etapas da 2.3 deixam de ser AMBAS e passam a VENDA, para o
    // funil de venda e o de pos-venda ficarem proprios e limpos. Idempotente.
    const nomes23 = ETAPAS_PADRAO.map((e) => e.nome);
    const flip = await prisma.etapa.updateMany({
      where: { nome: { in: nomes23 }, finalidade: FinalidadeEtapa.AMBAS },
      data: { finalidade: FinalidadeEtapa.VENDA },
    });
    if (flip.count > 0) {
      console.log(`[seed] ${flip.count} etapas AMBAS -> VENDA`);
    }
  } catch (erro) {
    console.error(
      `[seed] falha em finalidade/instancias: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Backfill de acesso por papel (legado). Idempotente. Agentes editados pela
// tela de Equipe passam a ter papel COLABORADOR/ADMIN e nao sao mais tocados.
export async function backfillAcesso(): Promise<void> {
  try {
    await prisma.agente.updateMany({
      where: { papel: Papel.VENDEDOR },
      data: { acessoVenda: true, acessoPosVenda: false },
    });
    await prisma.agente.updateMany({
      where: { papel: Papel.POS_VENDA },
      data: { acessoVenda: false, acessoPosVenda: true },
    });
    await prisma.agente.updateMany({
      where: { papel: Papel.ADMIN },
      data: { acessoVenda: true, acessoPosVenda: true },
    });
    console.log("[seed] backfill de acesso ok");
  } catch (erro) {
    console.error(
      `[seed] falha no backfill de acesso: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Espelha retroativamente o dono do lead nas conversas sem agente (A1), para
// que conversas legadas aparecam no "meus" do inbox. So preenche nulos.
export async function backfillDonoConversas(): Promise<void> {
  try {
    const leadsVenda = await prisma.lead.findMany({
      where: { donoId: { not: null } },
      select: { id: true, donoId: true },
    });
    let n = 0;
    for (const l of leadsVenda) {
      const r = await prisma.conversa.updateMany({
        where: { leadId: l.id, finalidade: Finalidade.VENDA, agenteId: null },
        data: { agenteId: l.donoId },
      });
      n += r.count;
    }
    const leadsPos = await prisma.lead.findMany({
      where: { donoPosVendaId: { not: null } },
      select: { id: true, donoPosVendaId: true },
    });
    for (const l of leadsPos) {
      const r = await prisma.conversa.updateMany({
        where: {
          leadId: l.id,
          finalidade: Finalidade.POS_VENDA,
          agenteId: null,
        },
        data: { agenteId: l.donoPosVendaId },
      });
      n += r.count;
    }
    if (n > 0) console.log(`[seed] backfill dono em ${n} conversas`);
  } catch (erro) {
    console.error(
      `[seed] falha no backfill de dono: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Purga idempotente dos dados de teste usados na validacao ao vivo da 2.3.
export async function purgarDadosTeste(): Promise<void> {
  const emailsTeste = [
    "teste.vendedora@sixxis.local",
    "teste.vendedorb@sixxis.local",
    "teste.ambos@sixxis.local",
  ];
  const telefonesTeste = ["5500000000001", "5500000000002"];
  try {
    const leads = await prisma.lead.findMany({
      where: { telefone: { in: telefonesTeste } },
      select: { id: true },
    });
    const leadIds = leads.map((l) => l.id);

    if (leadIds.length > 0) {
      const conversas = await prisma.conversa.findMany({
        where: { leadId: { in: leadIds } },
        select: { id: true },
      });
      const convIds = conversas.map((c) => c.id);
      const negocios = await prisma.negocio.findMany({
        where: { leadId: { in: leadIds } },
        select: { id: true },
      });
      const negIds = negocios.map((n) => n.id);

      // Remove filhos antes dos pais (FKs RESTRICT).
      await prisma.$transaction([
        prisma.mensagem.deleteMany({ where: { conversaId: { in: convIds } } }),
        prisma.atividade.deleteMany({ where: { leadId: { in: leadIds } } }),
        prisma.historicoNegocio.deleteMany({
          where: { negocioId: { in: negIds } },
        }),
        prisma.nota.deleteMany({ where: { leadId: { in: leadIds } } }),
        prisma.leadEtiqueta.deleteMany({ where: { leadId: { in: leadIds } } }),
        prisma.conversa.deleteMany({ where: { leadId: { in: leadIds } } }),
        prisma.negocio.deleteMany({ where: { leadId: { in: leadIds } } }),
        prisma.lead.deleteMany({ where: { id: { in: leadIds } } }),
      ]);
      console.log(`[seed] purga: ${leadIds.length} leads de teste removidos`);
    }

    // Agentes de teste (FKs para Agente sao SET NULL).
    const delAg = await prisma.agente.deleteMany({
      where: { email: { in: emailsTeste } },
    });
    if (delAg.count > 0) {
      console.log(`[seed] purga: ${delAg.count} agentes de teste removidos`);
    }

    // Zera os ponteiros de roteamento (venda e pos-venda).
    const config = await prisma.configRoteamento.findFirst();
    if (config) {
      await prisma.configRoteamento.update({
        where: { id: config.id },
        data: { ponteiroAgenteId: null, ponteiroPosVendaId: null },
      });
    }
    console.log("[seed] purga de dados de teste ok");
  } catch (erro) {
    console.error(
      `[seed] falha na purga de teste: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Backfill: garante um negocio aberto para cada lead que ainda nao tem.
// Roda no boot, sem emitir socket (io ainda nao tem clientes / ruido).
export async function backfillNegocios(): Promise<void> {
  try {
    const etapa = await prisma.etapa.findFirst({
      where: { tipo: TipoEtapa.ABERTA, ativo: true },
      orderBy: { ordem: "asc" },
    });
    if (!etapa) return;

    const leads = await prisma.lead.findMany({
      where: { negocios: { none: { status: "ABERTO" } } },
      select: { id: true },
    });
    for (const l of leads) {
      await garantirNegocioParaLead(l.id, Finalidade.VENDA, false);
    }
    if (leads.length > 0) {
      console.log(`[seed] backfill: ${leads.length} negocios criados`);
    } else {
      console.log("[seed] backfill ok");
    }
  } catch (erro) {
    console.error(
      `[seed] falha no backfill de negocios: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}
