// Chat do Oracle (agente de gestao). Autenticado (qualquer papel logado); o
// ESCOPO por usuario e aplicado DENTRO das ferramentas do motor. SO LEITURA.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { gerarRespostaOracle, type OracleMensagem } from "@/lib/oracle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Analise ampla de conversas pode levar mais que o padrao; libera ate 120s para a
// infra nao cortar antes do TIMEOUT_MS interno do Oracle. Fatia 2.91.
export const maxDuration = 120;

const MAX_HISTORICO = 40;
const MAX_TAM_MSG = 4000;

// Rate limit simples em memoria (por usuario): janela deslizante. Evita abuso/
// custo. Em memoria basta para o worker unico do app.
const JANELA_MS = 60_000;
const MAX_POR_JANELA = 15;
const acessos = new Map<string, number[]>();

function permitido(userId: string): boolean {
  const agora = Date.now();
  const lista = (acessos.get(userId) ?? []).filter((t) => agora - t < JANELA_MS);
  if (lista.length >= MAX_POR_JANELA) {
    acessos.set(userId, lista);
    return false;
  }
  lista.push(agora);
  acessos.set(userId, lista);
  return true;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  if (!permitido(agente.id)) {
    return NextResponse.json(
      { erro: "muitas perguntas em pouco tempo. Aguarde alguns segundos." },
      { status: 429 },
    );
  }

  let body: { historico?: unknown; conversaId?: unknown; pergunta?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const pergunta =
    typeof body.pergunta === "string" ? body.pergunta.trim() : "";

  // ------------------------------------------------------------------
  // FORMATO ANTIGO (compat): { historico } sem pergunta -> comportamento
  // inalterado, SEM persistir. Mantido durante a transicao.
  // ------------------------------------------------------------------
  if (!pergunta) {
    const bruto = Array.isArray(body.historico) ? body.historico : [];
    const historico: OracleMensagem[] = bruto
      .slice(-MAX_HISTORICO)
      .map((m): OracleMensagem | null => {
        if (!m || typeof m !== "object") return null;
        const o = m as Record<string, unknown>;
        const autor = o.autor === "oracle" ? "oracle" : "user";
        const texto = typeof o.texto === "string" ? o.texto : "";
        if (!texto.trim()) return null;
        return { autor, texto: texto.slice(0, MAX_TAM_MSG) };
      })
      .filter((m): m is OracleMensagem => m !== null);

    if (historico.length === 0) {
      return NextResponse.json(
        { erro: "envie ao menos uma pergunta" },
        { status: 400 },
      );
    }
    const resultado = await gerarRespostaOracle({ historico, agente });
    return NextResponse.json({ mensagens: resultado.mensagens });
  }

  // ------------------------------------------------------------------
  // FORMATO NOVO: { conversaId?, pergunta } -> persiste no banco.
  // ------------------------------------------------------------------
  let conversaId =
    typeof body.conversaId === "string" ? body.conversaId : "";

  if (conversaId) {
    // Escopo RIGIDO: a conversa precisa ser do proprio agente (admin incluso).
    const dona = await prisma.oracleConversa.findFirst({
      where: { id: conversaId, agenteId: agente.id },
      select: { id: true },
    });
    if (!dona) {
      return NextResponse.json(
        { erro: "conversa nao encontrada" },
        { status: 404 },
      );
    }
  } else {
    const titulo = pergunta.replace(/\s+/g, " ").trim().slice(0, 60) || "Conversa";
    const nova = await prisma.oracleConversa.create({
      data: { agenteId: agente.id, titulo },
      select: { id: true },
    });
    conversaId = nova.id;
  }

  // Grava a pergunta do usuario ANTES de chamar o motor: se ele falhar/timeout, a
  // pergunta fica registrada e o contexto sobrevive a retomada.
  await prisma.oracleMensagem.create({
    data: { conversaId, autor: "user", texto: pergunta },
  });

  // Historico DO BANCO: ultimas MAX_HISTORICO mensagens (inclui a recem-gravada),
  // em ordem cronologica.
  const recentes = await prisma.oracleMensagem.findMany({
    where: { conversaId },
    orderBy: { criadoEm: "desc" },
    take: MAX_HISTORICO,
    select: { autor: true, texto: true },
  });
  const historico: OracleMensagem[] = recentes
    .reverse()
    .map((m) => ({
      autor: m.autor === "oracle" ? "oracle" : "user",
      texto: (m.texto ?? "").slice(0, MAX_TAM_MSG),
    }));

  // O motor aplica o escopo do usuario nas ferramentas (nunca vaza outro usuario).
  let resultado;
  try {
    resultado = await gerarRespostaOracle({ historico, agente });
  } catch {
    // Falha do motor: a pergunta ja esta gravada; retorna erro normal.
    return NextResponse.json(
      { conversaId, erro: "nao consegui responder agora. Tente novamente." },
      { status: 502 },
    );
  }

  // Grava a resposta do Oracle (blocos unidos num unico registro).
  const respostaTexto = (resultado.mensagens ?? []).join("\n\n").trim();
  if (respostaTexto) {
    await prisma.oracleMensagem.create({
      data: { conversaId, autor: "oracle", texto: respostaTexto },
    });
  }
  // Toca a conversa para bumpar atualizadoEm (ordena a lista por recencia).
  await prisma.oracleConversa.update({
    where: { id: conversaId },
    data: {},
  });

  return NextResponse.json({ conversaId, mensagens: resultado.mensagens });
}
