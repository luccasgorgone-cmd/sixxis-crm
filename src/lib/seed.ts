// Seed idempotente do agente ADMIN, executado no boot do servidor.
// Se nao existir Agente com email = ADMIN_EMAIL, cria um ADMIN com a senha
// (bcrypt) de ADMIN_SENHA. Se ja existir, garante que tem senha definida.
// Nunca derruba o boot: erros sao logados e engolidos.
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { Papel, TipoEtapa } from "../generated/prisma/enums";
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
      await garantirNegocioParaLead(l.id, false);
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
