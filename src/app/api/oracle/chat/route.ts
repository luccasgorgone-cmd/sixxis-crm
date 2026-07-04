// Chat do Oracle (agente de gestao). Autenticado (qualquer papel logado); o
// ESCOPO por usuario e aplicado DENTRO das ferramentas do motor. SO LEITURA.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
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

  let body: { historico?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

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

  // O motor aplica o escopo do usuario nas ferramentas (nunca vaza outro usuario).
  const resultado = await gerarRespostaOracle({ historico, agente });
  return NextResponse.json({ mensagens: resultado.mensagens });
}
