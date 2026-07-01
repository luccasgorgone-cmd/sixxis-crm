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
import { excluirLeadsCompleto } from "./exclusao";

// Backfill (idempotente): metas sem autor (criadas antes da 2.18) recebem
// criadoPorId = primeiro ADMIN, para a trava de edicao funcionar. Metas de
// EQUIPE tambem ficam atreladas ao admin (so admin edita).
export async function backfillCriadorMetas(): Promise<void> {
  try {
    const pendentes = await prisma.meta.count({ where: { criadoPorId: null } });
    if (pendentes === 0) {
      console.log("[seed] metas com autor ok");
      return;
    }
    const admin = await prisma.agente.findFirst({
      where: { papel: Papel.ADMIN },
      orderBy: { criadoEm: "asc" },
      select: { id: true },
    });
    if (!admin) {
      console.warn("[seed] backfill de metas adiado: nenhum admin ainda");
      return;
    }
    const r = await prisma.meta.updateMany({
      where: { criadoPorId: null },
      data: { criadoPorId: admin.id },
    });
    console.log(`[seed] backfill criadoPorId em ${r.count} metas`);
  } catch (erro) {
    console.error(
      `[seed] falha no backfill de metas: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

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

// Etiquetas de pos-venda. Semeadas por nome (so cria a que faltar), com
// finalidade POS_VENDA, para organizar as marcacoes da carteira de pos-venda.
const ETIQUETAS_POS_VENDA: { nome: string; cor: string }[] = [
  { nome: "Aguardando orçamento", cor: "#0ea5e9" },
  { nome: "Aguardando pagamento", cor: "#f59e0b" },
  { nome: "Orçamento aprovado", cor: "#16a34a" },
  { nome: "Aguardando peça", cor: "#7c3aed" },
];

// Correcao idempotente: acentua nomes semeados sem acento em producao. Renomeia
// somente quando o nome acentuado ainda nao existe (nao cria duplicatas).
const RENOMEAR_ETIQUETAS: { de: string; para: string }[] = [
  { de: "Aguardando orcamento", para: "Aguardando orçamento" },
  { de: "Orcamento aprovado", para: "Orçamento aprovado" },
  { de: "Aguardando peca", para: "Aguardando peça" },
];

// Modelos de mensagem profissionais (categoria + finalidade + variacoes). Cada
// intencao tem 2-3 redacoes da MESMA mensagem com palavras diferentes; o sistema
// sorteia uma por destinatario. Tom caloroso, educado e direto: {primeiro_nome}
// trata o cliente (com fallback gracioso da normalizacao) e {vendedor} assina
// pelo atendente logado. Idempotente: cria os que faltam, completa variacoes
// vazias e ATUALIZA a copy das mensagens de sistema ja existentes (por titulo).
const MODELOS_PADRAO: {
  titulo: string;
  categoria: string;
  finalidade: Finalidade | null;
  texto: string;
  variacoes: string[];
}[] = [
  {
    titulo: "Feliz aniversario",
    categoria: "aniversario",
    finalidade: null,
    texto:
      "Olá {primeiro_nome}, é o seu dia! Toda a equipe da {loja} deseja um feliz aniversário, cheio de saúde e alegria. Para comemorar com você, preparamos o cupom {cupom} como nosso presente. Aproveite! {vendedor}",
    variacoes: [
      "Parabéns {primeiro_nome}! Que este novo ciclo venha repleto de conquistas. A {loja} deixa um mimo para você: o cupom {cupom}. Um grande abraço! {vendedor}",
      "Feliz aniversário {primeiro_nome}! Hoje a data é toda sua e a {loja} faz questão de celebrar. Use o cupom {cupom} e aproveite uma condição especial. {vendedor}",
    ],
  },
  {
    titulo: "Cupom exclusivo",
    categoria: "cupom",
    finalidade: null,
    texto:
      "Oi {primeiro_nome}, tudo bem? Separei um presente para você: o cupom {cupom} dá {desconto} de desconto na {loja}, válido até {validade}. Qualquer dúvida, é só me chamar por aqui: {link}. {vendedor}",
    variacoes: [
      "{primeiro_nome}, uma condição exclusiva para você: com o cupom {cupom} você garante {desconto} de desconto na {loja} até {validade}. Aproveite: {link}. {vendedor}",
      "Olá {primeiro_nome}! Você ganhou o cupom {cupom}, que dá {desconto} de desconto na {loja}. Vale até {validade} — acesse {link} e aproveite. {vendedor}",
    ],
  },
  {
    titulo: "Data comemorativa",
    categoria: "data_comemorativa",
    finalidade: null,
    texto:
      "Olá {primeiro_nome}! Hoje é uma data especial e a {loja} preparou algo para celebrar com você: o cupom {cupom} com {desconto} de desconto, válido até {validade}. Vai ser um prazer atender você: {link}. {vendedor}",
    variacoes: [
      "{primeiro_nome}, é dia de comemorar! Para marcar a data, a {loja} liberou o cupom {cupom} com {desconto} de desconto até {validade}. Confira: {link}. {vendedor}",
      "Para celebrar esta data com você, {primeiro_nome}, a {loja} deixou o cupom {cupom} ({desconto} de desconto) válido até {validade}. Aproveite: {link}. {vendedor}",
    ],
  },
  {
    titulo: "Desconto relampago",
    categoria: "desconto_relampago",
    finalidade: null,
    texto:
      "{primeiro_nome}, é agora! Oferta relâmpago na {loja}: o cupom {cupom} garante {desconto} de desconto, mas só até {validade}. Corre que é por tempo limitado: {link}. {vendedor}",
    variacoes: [
      "Rápido {primeiro_nome}! Só até {validade}, o cupom {cupom} dá {desconto} de desconto na {loja}. Não deixe passar: {link}. {vendedor}",
      "Promoção relâmpago, {primeiro_nome}: {desconto} de desconto com o cupom {cupom} na {loja}, válido até {validade}. Aproveite agora: {link}. {vendedor}",
    ],
  },
  {
    titulo: "Retomada de interesse",
    categoria: "retomada",
    finalidade: Finalidade.VENDA,
    texto:
      "Oi {primeiro_nome}, tudo bem? Vi que você teve interesse no {produto} e passei para saber se posso te ajudar a concluir com calma. Se fizer sentido, consigo uma condição especial com o cupom {cupom}. Fico à disposição! {vendedor}",
    variacoes: [
      "{primeiro_nome}, estou retomando a nossa conversa. Ainda posso te ajudar com o {produto}? Deixei o cupom {cupom} reservado caso queira seguir. {vendedor}",
      "Olá {primeiro_nome}! Lembrei do seu interesse no {produto}. Se ainda fizer sentido para você, consigo o cupom {cupom} para facilitar. Como posso ajudar? {vendedor}",
    ],
  },
  {
    titulo: "Boas-vindas",
    categoria: "boas_vindas",
    finalidade: null,
    texto:
      "Olá {primeiro_nome}, tudo bem? Me chamo {vendedor}, da {loja}. Seja muito bem-vindo! Estou por aqui para ajudar no que você precisar.",
    variacoes: [
      "Oi {primeiro_nome}! Me chamo {vendedor} e sou da {loja}. Que bom ter você com a gente — qualquer dúvida sobre produtos ou pedidos, é só me chamar.",
      "{primeiro_nome}, seja bem-vindo à {loja}! Aqui é o {vendedor} e vou te acompanhar por aqui. Conte comigo para escolher ou comprar com tranquilidade.",
    ],
  },
  {
    titulo: "Agradecimento pos-compra",
    categoria: "agradecimento",
    finalidade: Finalidade.POS_VENDA,
    texto:
      "{primeiro_nome}, muito obrigado pela sua compra na {loja}! Já estamos cuidando de tudo para você. Qualquer dúvida sobre o seu pedido, é só falar comigo. {vendedor}",
    variacoes: [
      "Obrigado pela confiança, {primeiro_nome}! A sua compra na {loja} foi registrada e estamos preparando tudo com carinho. Estou à disposição. {vendedor}",
      "{primeiro_nome}, agradecemos por comprar na {loja}! Foi um prazer atender você. Se precisar de qualquer suporte com o pedido, me avise. {vendedor}",
    ],
  },
  {
    titulo: "Pedido de avaliacao",
    categoria: "avaliacao",
    finalidade: Finalidade.POS_VENDA,
    texto:
      "{primeiro_nome}, tudo certo com o seu pedido da {loja}? A sua opinião vale muito para a gente. Se puder, conte como foi a sua experiência — leva só um minutinho: {link}. {vendedor}",
    variacoes: [
      "Oi {primeiro_nome}! Esperamos que esteja gostando da sua compra na {loja}. Pode deixar uma avaliação rápida? Isso nos ajuda demais: {link}. {vendedor}",
      "{primeiro_nome}, como foi a sua experiência com a {loja}? Adoraríamos saber a sua opinião. Avalie aqui quando puder: {link}. {vendedor}",
    ],
  },
  {
    titulo: "Follow-up pos-venda",
    categoria: "follow_up",
    finalidade: Finalidade.POS_VENDA,
    texto:
      "Olá {primeiro_nome}, tudo bem? Passei só para saber se está tudo certo com o seu pedido da {loja}. Qualquer necessidade, estou por aqui para ajudar. {vendedor}",
    variacoes: [
      "{primeiro_nome}, tudo certo com a sua compra na {loja}? Se surgir qualquer dúvida ou você precisar de suporte, é só me chamar. {vendedor}",
      "Oi {primeiro_nome}! Passando para acompanhar o seu pedido da {loja}. Está tudo funcionando como esperado? Conte comigo para o que precisar. {vendedor}",
    ],
  },
  {
    titulo: "Ainda interessado",
    categoria: "retomada",
    finalidade: Finalidade.VENDA,
    texto:
      "{primeiro_nome}, você ainda tem interesse no {produto}? Posso te ajudar a seguir com ele e tirar qualquer dúvida. Fico no aguardo! {vendedor}",
    variacoes: [
      "Oi {primeiro_nome}! Passando para saber se você ainda quer seguir com o {produto}. Estou aqui para ajudar no que precisar. {vendedor}",
      "{primeiro_nome}, posso te ajudar a concluir o {produto}? Se ainda fizer sentido, é só me dizer que cuido de tudo para você. {vendedor}",
    ],
  },
];

// Compara duas listas de variacoes (ordem importa) para evitar writes inuteis.
function variacoesIguais(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export async function seedModelos(): Promise<void> {
  try {
    const existentes = await prisma.respostaRapida.findMany({
      select: { id: true, titulo: true, texto: true, variacoes: true },
    });
    const porTitulo = new Map(
      existentes.map((e) => [e.titulo.toLowerCase(), e]),
    );
    const ultima = await prisma.respostaRapida.findFirst({
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });
    let ordem = ultima?.ordem ?? 0;
    let criados = 0;
    let atualizados = 0;

    for (const m of MODELOS_PADRAO) {
      const existente = porTitulo.get(m.titulo.toLowerCase());
      if (!existente) {
        await prisma.respostaRapida.create({
          data: {
            titulo: m.titulo,
            categoria: m.categoria,
            finalidade: m.finalidade,
            texto: m.texto,
            variacoes: m.variacoes,
            ordem: ++ordem,
          },
        });
        criados++;
        continue;
      }
      // Mensagem de SISTEMA ja existente (casada por titulo): atualiza a copy
      // (texto + variacoes) para a nova redacao oficial. So mensagens com titulo
      // dos MODELOS_PADRAO sao tocadas — as criadas pelo usuario tem outro titulo
      // e ficam intactas.
      if (
        existente.texto !== m.texto ||
        !variacoesIguais(existente.variacoes ?? [], m.variacoes)
      ) {
        await prisma.respostaRapida.update({
          where: { id: existente.id },
          data: {
            texto: m.texto,
            variacoes: m.variacoes,
            categoria: m.categoria,
            finalidade: m.finalidade,
          },
        });
        atualizados++;
      }
    }
    console.log(
      `[seed] modelos: ${criados} criados, ${atualizados} atualizados (copy de sistema)`,
    );
  } catch (erro) {
    console.error(
      `[seed] falha ao semear modelos: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Empresas faturadas padrao (ordem fixa). Idempotente: cria por nome apenas as
// que faltarem; nao mexe nas ja existentes (admin gerencia pela tela).
const EMPRESAS_FATURADAS_PADRAO: string[] = [
  "Sixxis Comercial Goiânia",
  "Sixxis Comercial",
  "Sixxis São Paulo",
  "Sixxis Importação",
  "AR Brasil",
  "Axial",
];

// Lista pre-definida de produtos de interesse (ordem 0..16). Formato exato do
// nome: espaco-hifen-espaco entre nome e voltagem.
const PRODUTOS_INTERESSE_PADRAO: string[] = [
  "Aspirador Bravo",
  "Sixxis Cardio",
  "Sixxis Life",
  "M45 Trend - 110V",
  "M45 Trend - 220V",
  "SX040 Trend - 110V",
  "SX040 Trend - 220V",
  "SX060 Prime - 110V",
  "SX060 Prime - 220V",
  "SX070 Trend - 110V",
  "SX070 Trend - 220V",
  "SX100 Trend - 110V",
  "SX100 Trend - 220V",
  "SX120 Prime - 220V",
  "SX180 Trend - 220V",
  "SX200 Trend - 220V",
  "SX200 Prime - 220V",
];

export async function seedProdutosInteresse(): Promise<void> {
  try {
    const existentes = new Set(
      (await prisma.produtoInteresse.findMany({ select: { nome: true } })).map(
        (p) => p.nome,
      ),
    );
    let criados = 0;
    for (let i = 0; i < PRODUTOS_INTERESSE_PADRAO.length; i++) {
      const nome = PRODUTOS_INTERESSE_PADRAO[i];
      if (existentes.has(nome)) continue;
      await prisma.produtoInteresse.create({
        data: { nome, ordem: i, ativo: true },
      });
      criados++;
    }
    console.log(
      criados > 0
        ? `[seed] ${criados} produtos de interesse criados`
        : "[seed] produtos de interesse ok",
    );
  } catch (erro) {
    console.error(
      `[seed] falha ao semear produtos de interesse: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

export async function seedEmpresasFaturadas(): Promise<void> {
  try {
    const existentes = new Set(
      (await prisma.empresaFaturada.findMany({ select: { nome: true } })).map(
        (e) => e.nome,
      ),
    );
    let criadas = 0;
    for (let i = 0; i < EMPRESAS_FATURADAS_PADRAO.length; i++) {
      const nome = EMPRESAS_FATURADAS_PADRAO[i];
      if (existentes.has(nome)) continue;
      await prisma.empresaFaturada.create({
        data: { nome, ordem: i, ativo: true },
      });
      criadas++;
    }
    console.log(
      criadas > 0
        ? `[seed] ${criadas} empresas faturadas criadas`
        : "[seed] empresas faturadas ok",
    );
  } catch (erro) {
    console.error(
      `[seed] falha ao semear empresas faturadas: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

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

    // Correcao de dados: acentua etiquetas pos-venda criadas sem acento. So
    // renomeia se o nome acentuado ainda nao existir (idempotente, sem duplicar).
    for (const { de, para } of RENOMEAR_ETIQUETAS) {
      const jaTemAcentuado = await prisma.etiqueta.count({ where: { nome: para } });
      if (jaTemAcentuado === 0) {
        const r = await prisma.etiqueta.updateMany({
          where: { nome: de },
          data: { nome: para },
        });
        if (r.count > 0) {
          console.log(`[seed] etiqueta renomeada: "${de}" -> "${para}"`);
        }
      }
    }

    // Etiquetas de pos-venda: cria por nome apenas as que faltarem (nao
    // sobrescreve nem duplica), com finalidade POS_VENDA.
    const existentes = new Set(
      (await prisma.etiqueta.findMany({ select: { nome: true } })).map((e) =>
        e.nome.toLowerCase(),
      ),
    );
    const faltantes = ETIQUETAS_POS_VENDA.filter(
      (e) => !existentes.has(e.nome.toLowerCase()),
    );
    if (faltantes.length > 0) {
      await prisma.etiqueta.createMany({
        data: faltantes.map((e) => ({
          ...e,
          finalidade: Finalidade.POS_VENDA,
        })),
      });
      console.log(`[seed] ${faltantes.length} etiquetas de pos-venda criadas`);
    } else {
      console.log("[seed] etiquetas pos-venda ok");
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

// Horario comercial padrao (0=Dom ... 6=Sab).
export const HORARIOS_PADRAO = [
  { dia: 0, aberto: false, faixas: [] as { inicio: string; fim: string }[] },
  { dia: 1, aberto: true, faixas: [{ inicio: "09:00", fim: "18:00" }] },
  { dia: 2, aberto: true, faixas: [{ inicio: "09:00", fim: "18:00" }] },
  { dia: 3, aberto: true, faixas: [{ inicio: "09:00", fim: "18:00" }] },
  { dia: 4, aberto: true, faixas: [{ inicio: "09:00", fim: "18:00" }] },
  { dia: 5, aberto: true, faixas: [{ inicio: "09:00", fim: "18:00" }] },
  { dia: 6, aberto: true, faixas: [{ inicio: "09:00", fim: "13:00" }] },
];

// Atalhos de resposta rapida (categoria "atalho"). Acentuacao correta, tom
// caloroso e profissional, com {primeiro_nome} no inicio (a normalizacao de
// aplicarModelo limpa a pontuacao quando o nome vem vazio) e {vendedor} ao
// assinar quando faz sentido.
const RESPOSTAS_PADRAO: { titulo: string; atalho: string; texto: string }[] = [
  {
    titulo: "Saudacao",
    atalho: "/saudacao",
    texto:
      "Olá {primeiro_nome}! Tudo bem? Me chamo {vendedor}, da {loja}. Como posso ajudar você hoje?",
  },
  {
    titulo: "Pedir CEP",
    atalho: "/cep",
    texto:
      "Olá {primeiro_nome}! Para calcular o frete certinho, pode me informar o seu CEP, por favor?",
  },
  {
    titulo: "Enviar PIX",
    atalho: "/pix",
    texto:
      "Pronto {primeiro_nome}! Segue a nossa chave PIX para o pagamento. Assim que você enviar, me avise por aqui que eu confirmo na hora.",
  },
  {
    titulo: "Agradecimento",
    atalho: "/obrigado",
    texto:
      "Obrigado {primeiro_nome}! Foi um prazer falar com você. Qualquer coisa, estou à disposição. {vendedor}",
  },
  {
    titulo: "Fechamento",
    atalho: "/fechamento",
    texto:
      "Perfeito {primeiro_nome}! Posso fechar o seu pedido agora? Qualquer dúvida, é só me chamar. {vendedor}",
  },
];

// Singletons de configuracao + respostas rapidas padrao. Idempotente.
export async function seedConfiguracoes(): Promise<void> {
  try {
    const crm = await prisma.configuracaoCRM.findFirst();
    if (!crm) {
      await prisma.configuracaoCRM.create({
        data: {
          nomeEmpresa: "Sixxis",
          fuso: "America/Sao_Paulo",
          horarios: HORARIOS_PADRAO,
        },
      });
      console.log("[seed] configuracao CRM criada");
    } else {
      console.log("[seed] configuracao CRM ok");
    }

    const ia = await prisma.configAgenteIA.findFirst();
    if (!ia) {
      await prisma.configAgenteIA.create({ data: {} });
      console.log("[seed] config Agente IA criada");
    } else {
      console.log("[seed] config Agente IA ok");
    }

    const totalResp = await prisma.respostaRapida.count();
    if (totalResp === 0) {
      await prisma.respostaRapida.createMany({
        data: RESPOSTAS_PADRAO.map((r, i) => ({ ...r, ordem: i + 1 })),
      });
      console.log(
        `[seed] ${RESPOSTAS_PADRAO.length} respostas rapidas criadas`,
      );
    } else {
      console.log("[seed] respostas rapidas ok");
    }

    // Atualiza a copy dos ATALHOS de sistema (por titulo, categoria "atalho")
    // para a nova redacao acentuada/com {primeiro_nome}, mesmo quando ja
    // existiam no banco. Nao toca em atalhos criados pelo usuario (outro titulo).
    let atalhosAtualizados = 0;
    for (const r of RESPOSTAS_PADRAO) {
      const upd = await prisma.respostaRapida.updateMany({
        where: { titulo: r.titulo, categoria: "atalho", texto: { not: r.texto } },
        data: { texto: r.texto, atalho: r.atalho },
      });
      atalhosAtualizados += upd.count;
    }
    if (atalhosAtualizados > 0) {
      console.log(`[seed] ${atalhosAtualizados} atalhos atualizados (copy nova)`);
    } else {
      console.log("[seed] atalhos ok");
    }
  } catch (erro) {
    console.error(
      `[seed] falha ao semear configuracoes: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

// Tons padrao do assistente de escrita ("varinha magica"). Semeados SE a tabela
// estiver vazia (nao duplica em re-seed). A config singleton e criada sempre que
// faltar.
const ASSISTENTE_TONS_PADRAO: { nome: string; instrucao: string }[] = [
  {
    nome: "Corrigir",
    instrucao:
      "Corrija apenas ortografia, gramatica e pontuacao. NAO mude o tom nem reescreva o conteudo; mantenha o texto o mais fiel possivel ao original.",
  },
  {
    nome: "Suavizar",
    instrucao:
      "Reescreva deixando o texto mais gentil, caloroso e acolhedor, sem perder objetividade nem informacoes.",
  },
  {
    nome: "Profissional",
    instrucao:
      "Reescreva deixando o texto mais formal e profissional, claro, educado e organizado.",
  },
  {
    nome: "Vendedor",
    instrucao:
      "Reescreva deixando o texto mais persuasivo e comercial: destaque beneficios e inclua uma chamada para acao natural, sem exagero e sem inventar informacao.",
  },
  {
    nome: "Encurtar",
    instrucao:
      "Reescreva deixando o texto mais curto e direto, mantendo todas as informacoes essenciais.",
  },
];

// Config singleton do assistente + tons padrao. Idempotente.
export async function seedAssistenteEscrita(): Promise<void> {
  try {
    const config = await prisma.assistenteConfig.findFirst();
    if (!config) {
      await prisma.assistenteConfig.create({ data: {} });
      console.log("[seed] config do assistente de escrita criada");
    } else {
      console.log("[seed] config do assistente de escrita ok");
    }

    const totalTons = await prisma.assistenteTom.count();
    if (totalTons === 0) {
      await prisma.assistenteTom.createMany({
        data: ASSISTENTE_TONS_PADRAO.map((t, i) => ({
          nome: t.nome,
          instrucao: t.instrucao,
          ordem: i + 1,
          ativo: true,
        })),
      });
      console.log(
        `[seed] ${ASSISTENTE_TONS_PADRAO.length} tons do assistente criados`,
      );
    } else {
      console.log("[seed] tons do assistente ok");
    }
  } catch (erro) {
    console.error(
      `[seed] falha ao semear assistente de escrita: ${erro instanceof Error ? erro.message : String(erro)}`,
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
    "teste.sup@sixxis.local",
  ];
  const telefonesTeste = ["5500000000001", "5500000000002"];
  try {
    const leads = await prisma.lead.findMany({
      where: { telefone: { in: telefonesTeste } },
      select: { id: true },
    });
    const leadIds = leads.map((l) => l.id);

    if (leadIds.length > 0) {
      // Remove o lead sintetico e TODAS as dependencias na ordem correta de FKs
      // (incl. Lembrete/Tarefa/Orcamento/AlertaNegocio/etc., que antes faltavam e
      // causavam o erro "Lembrete_leadId_fkey"). Reusa o helper de exclusao.
      await excluirLeadsCompleto(leadIds);
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
