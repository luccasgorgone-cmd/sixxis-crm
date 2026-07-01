// Assistente de escrita ("varinha magica"): reescreve o texto do atendente
// aplicando um TOM, via Anthropic (Claude). Acessivel a QUALQUER agente logado
// (vendedores usam). Nunca derruba nada: todo caminho de erro e tratado.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXTO = 4000;
const TIMEOUT_MS = 20000;

const SYSTEM_BASE =
  "Voce reescreve mensagens de atendimento ao cliente de uma loja brasileira (Sixxis), em portugues do Brasil. Aplique a instrucao de tom ao texto do atendente. Responda APENAS com o texto reescrito: sem aspas, sem comentarios, sem preambulo, sem explicacao. Preserve o sentido e as informacoes (nomes, valores, prazos). Nunca invente dados.";

// Config singleton (cria default se ainda nao existir).
async function pegarConfig() {
  const existente = await prisma.assistenteConfig.findFirst();
  if (existente) return existente;
  return prisma.assistenteConfig.create({ data: {} });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  let body: { texto?: unknown; tomId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const texto = typeof body.texto === "string" ? body.texto.trim() : "";
  const tomId = typeof body.tomId === "string" ? body.tomId : "";
  if (!texto) {
    return NextResponse.json({ erro: "texto vazio" }, { status: 400 });
  }
  if (texto.length > MAX_TEXTO) {
    return NextResponse.json({ erro: "texto muito longo" }, { status: 400 });
  }
  if (!tomId) {
    return NextResponse.json({ erro: "tom invalido" }, { status: 400 });
  }

  const config = await pegarConfig();
  if (!config.ativo) {
    return NextResponse.json({ erro: "assistente desativado" }, { status: 400 });
  }

  const tom = await prisma.assistenteTom.findUnique({ where: { id: tomId } });
  if (!tom || !tom.ativo) {
    return NextResponse.json({ erro: "tom indisponivel" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[assistente] ANTHROPIC_API_KEY ausente no ambiente");
    return NextResponse.json(
      { erro: "assistente indisponivel" },
      { status: 503 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelo,
        max_tokens: 1024,
        system: `${SYSTEM_BASE}\n\n${tom.instrucao}`,
        messages: [{ role: "user", content: texto }],
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const corpo = (await resp.text().catch(() => "")).slice(0, 500);
      console.error(
        `[assistente] Anthropic status ${resp.status} (modelo=${config.modelo}): ${corpo || "(sem corpo)"}`,
      );
      return NextResponse.json({ erro: "falha ao reescrever" }, { status: 502 });
    }

    const data = (await resp.json().catch(() => null)) as {
      content?: { type?: string; text?: string }[];
    } | null;
    const bloco = data?.content?.find((b) => b?.type === "text") ?? data?.content?.[0];
    const textoNovo = typeof bloco?.text === "string" ? bloco.text.trim() : "";
    if (!textoNovo) {
      console.error(
        `[assistente] resposta sem texto (modelo=${config.modelo}): ${JSON.stringify(data).slice(0, 300)}`,
      );
      return NextResponse.json({ erro: "falha ao reescrever" }, { status: 502 });
    }

    return NextResponse.json({ textoNovo });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error(`[assistente] erro ao chamar Anthropic: ${motivo}`);
    return NextResponse.json({ erro: "falha ao reescrever" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
