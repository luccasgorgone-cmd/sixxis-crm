// Sandbox de Atendimento — envia uma mensagem "como cliente" para um negocio
// ficticio e chama a MESMA gerarRespostaLuna (lib/luna.ts, ja pura: nao envia
// WhatsApp, nao grava nada sozinha) para obter a decisao. A resposta e gravada
// SOMENTE como SandboxMensagem (texto) — NUNCA aciona envio real, nunca cria
// pedido/orcamento real.
//
// ISOLADO POR DESENHO: nunca importa prisma.lead/negocio/conversa/mensagem, o
// client Evolution, nem a fila real de mensagens.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { gerarRespostaLuna, type LunaMensagem } from "@/lib/luna";
import { registrarSolEvento } from "@/lib/solEvento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Acao gravada em SolEvento para as chamadas feitas DO SANDBOX — separada das
// acoes reativas reais (ver lib/solEvento.ts:ACOES_REATIVAS) para o dashboard
// distinguir gasto de teste de gasto de atendimento real. Conta pro MESMO
// teto mensal (nao existe orcamento "de brinde" — decisao explicita do
// Luccas em 18/08/2026: "nao tem problema gastar nos testes").
const ACAO_SANDBOX_PREFIXO = "sandbox_";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "sem permissao" }, { status: 403 });

  let body: { negocioId?: unknown; texto?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const negocioId = typeof body.negocioId === "string" ? body.negocioId : "";
  const texto = typeof body.texto === "string" ? body.texto.trim().slice(0, 4000) : "";
  if (!negocioId || !texto) {
    return NextResponse.json({ erro: "negocioId e texto sao obrigatorios" }, { status: 400 });
  }

  const negocio = await prisma.sandboxNegocio.findUnique({
    where: { id: negocioId },
    include: { mensagens: { orderBy: { criadoEm: "asc" } } },
  });
  if (!negocio) {
    return NextResponse.json({ erro: "negocio ficticio nao encontrado" }, { status: 404 });
  }

  // Grava a mensagem IN (cliente) primeiro — mesmo se a Luna falhar depois, a
  // mensagem do cliente fica registrada (comportamento honesto do sandbox).
  await prisma.sandboxMensagem.create({
    data: { negocioId, direcao: "IN", texto },
  });

  const config = await prisma.configAgenteIA.findFirst();
  const sandboxConfig = await prisma.sandboxConfig.findFirst();

  const historico: LunaMensagem[] = [
    ...negocio.mensagens.map((m) => ({
      autor: (m.direcao === "IN" ? "cliente" : "luna") as "cliente" | "luna",
      texto: m.texto,
    })),
    { autor: "cliente", texto },
  ];

  const promptExtra = [config?.promptSistema, sandboxConfig?.promptSistemaExtra]
    .filter((t): t is string => !!t && t.trim() !== "")
    .join("\n\n");

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

  // Telemetria best-effort (mesma trava de orcamento — verificarOrcamentoMensal
  // ja rodou DENTRO de gerarRespostaLuna, sem bypass). conversaId/leadId aqui
  // sao os IDs do SandboxNegocio/SandboxLead — SolEvento nao tem FK para eles
  // (campos String soltos), entao gravar isso nao cria nenhum vinculo real.
  await registrarSolEvento(
    negocio.id,
    negocio.leadId,
    `${ACAO_SANDBOX_PREFIXO}${resultado.acao}`,
    resultado.motivo,
    sandboxConfig?.modelo?.trim() || config?.modelo || "claude-haiku-4-5",
    { tokensEntrada: resultado.tokensEntrada, tokensSaida: resultado.tokensSaida },
  );

  // Grava a decisao como texto (nunca dispara nada real). Se nao houver
  // mensagem (handoff/silenciar sem texto), grava um marcador vazio-ciente
  // para a UI mostrar a acao mesmo sem bolha de texto.
  const textoResultado = resultado.mensagens.join("\n\n");
  if (textoResultado) {
    await prisma.sandboxMensagem.create({
      data: {
        negocioId,
        direcao: "OUT",
        texto: textoResultado,
        acao: resultado.acao,
        motivo: resultado.motivo ?? null,
      },
    });
  }

  // Move a etapa do Kanban ficticio conforme a decisao (visual, sem efeito
  // real): handoff -> TRANSFERIDO, silenciar -> ENCERRADO, responder ->
  // ATENDENDO (sai de "NOVO" assim que a Luna responde pela 1a vez).
  const novaEtapa =
    resultado.acao === "handoff"
      ? "TRANSFERIDO"
      : resultado.acao === "silenciar"
        ? "ENCERRADO"
        : "ATENDENDO";
  await prisma.sandboxNegocio.update({
    where: { id: negocioId },
    data: { etapa: novaEtapa },
  });

  return NextResponse.json({
    acao: resultado.acao,
    mensagens: resultado.mensagens,
    motivo: resultado.motivo,
    etapa: novaEtapa,
  });
}
