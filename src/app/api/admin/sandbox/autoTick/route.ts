// Sandbox de Atendimento — "clientes ficticios que entram sozinhos". Chamado
// periodicamente pelo timer client-side (so roda com a tela do sandbox
// aberta — sem cron/worker server-side, sem custo quando ninguem esta
// olhando). A cada chamada: ou cria um lead ficticio novo com um roteiro
// aleatorio, ou avanca um lead existente que ainda tem passo pendente no
// roteiro, reaproveitando a mesma logica de POST /mensagens.
//
// ISOLADO POR DESENHO: nunca importa prisma.lead/negocio/conversa/mensagem, o
// client Evolution, nem a fila real de mensagens.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { gerarRespostaLuna, type LunaMensagem } from "@/lib/luna";
import { registrarSolEvento } from "@/lib/solEvento";
import { obterRoteiro, roteiroAleatorio, nomeFicticioAleatorio } from "@/lib/sandboxSimulador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACAO_SANDBOX_PREFIXO = "sandbox_";

export async function POST(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "sem permissao" }, { status: 403 });

  // Procura um lead ficticio com roteiro ainda incompleto para avancar.
  const candidatos = await prisma.sandboxLead.findMany({
    where: { roteiro: { not: null } },
    include: { negocios: { include: { mensagens: { orderBy: { criadoEm: "asc" } } } } },
  });
  const pendente = candidatos.find((c) => {
    const roteiro = obterRoteiro(c.roteiro);
    return roteiro && c.roteiroPasso < roteiro.passos.length;
  });

  let lead = pendente;
  let criouNovo = false;
  if (!lead) {
    // ~40% de chance de nascer um lead ficticio novo nesta rodada (evita
    // encher o sandbox de leads a cada tick quando nao ha nada pendente).
    if (Math.random() > 0.4) {
      return NextResponse.json({ acao: "nada" });
    }
    const roteiro = roteiroAleatorio();
    lead = await prisma.sandboxLead.create({
      data: {
        nome: nomeFicticioAleatorio(),
        roteiro: roteiro.id,
        negocios: { create: { finalidade: roteiro.finalidade, etapa: "NOVO" } },
      },
      include: { negocios: { include: { mensagens: { orderBy: { criadoEm: "asc" } } } } },
    });
    criouNovo = true;
  }

  const roteiro = obterRoteiro(lead.roteiro);
  if (!roteiro) return NextResponse.json({ acao: "nada" });

  const negocio = lead.negocios[0];
  if (!negocio) return NextResponse.json({ acao: "nada" });

  const textoCliente = roteiro.passos[lead.roteiroPasso];
  if (!textoCliente) return NextResponse.json({ acao: "nada" });

  await prisma.sandboxMensagem.create({
    data: { negocioId: negocio.id, direcao: "IN", texto: textoCliente },
  });

  const config = await prisma.configAgenteIA.findFirst();
  const sandboxConfig = await prisma.sandboxConfig.findFirst();
  const promptExtra = [config?.promptSistema, sandboxConfig?.promptSistemaExtra]
    .filter((t): t is string => !!t && t.trim() !== "")
    .join("\n\n");

  const historico: LunaMensagem[] = [
    ...negocio.mensagens.map((m) => ({
      autor: (m.direcao === "IN" ? "cliente" : "luna") as "cliente" | "luna",
      texto: m.texto,
    })),
    { autor: "cliente", texto: textoCliente },
  ];

  const resultado = await gerarRespostaLuna({
    finalidade: negocio.finalidade === "POS_VENDA" ? "POS_VENDA" : "VENDA",
    historico,
    config: {
      modelo: sandboxConfig?.modelo?.trim() || config?.modelo || "claude-haiku-4-5",
      provider: sandboxConfig?.provider ?? undefined,
      promptSistema: promptExtra || null,
      maxMensagensAntesHandoff: config?.maxMensagensAntesHandoff ?? null,
      cupomPrimeiraCompra: config?.cupomPrimeiraCompra ?? null,
      cupomDescricao: config?.cupomDescricao ?? null,
      cupomAtivo: config?.cupomAtivo ?? null,
    },
    catalogo: config?.baseConhecimento ?? "",
  });

  await registrarSolEvento(
    negocio.id,
    lead.id,
    `${ACAO_SANDBOX_PREFIXO}${resultado.acao}`,
    resultado.motivo,
    sandboxConfig?.modelo?.trim() || config?.modelo || "claude-haiku-4-5",
    { tokensEntrada: resultado.tokensEntrada, tokensSaida: resultado.tokensSaida },
  );

  const textoResultado = resultado.mensagens.join("\n\n");
  if (textoResultado) {
    await prisma.sandboxMensagem.create({
      data: {
        negocioId: negocio.id,
        direcao: "OUT",
        texto: textoResultado,
        acao: resultado.acao,
        motivo: resultado.motivo ?? null,
      },
    });
  }

  const novaEtapa =
    resultado.acao === "handoff"
      ? "TRANSFERIDO"
      : resultado.acao === "silenciar"
        ? "ENCERRADO"
        : "ATENDENDO";

  await prisma.sandboxNegocio.update({
    where: { id: negocio.id },
    data: { etapa: novaEtapa },
  });
  await prisma.sandboxLead.update({
    where: { id: lead.id },
    data: { roteiroPasso: lead.roteiroPasso + 1 },
  });

  return NextResponse.json({
    acao: criouNovo ? "novo_lead" : "avancou",
    leadId: lead.id,
    negocioId: negocio.id,
  });
}
