// Provider Anthropic (implementacao concreta de ChatProvider). Mesmo padrao de
// chamada que luna.ts/oracle.ts ja usam hoje (fetch direto em
// api.anthropic.com/v1/messages, x-api-key, anthropic-version 2023-06-01) —
// esta extracao NAO muda comportamento, so isola atras da interface comum de
// src/lib/llmProvider.ts para o modelo poder ser trocado sem reescrever
// luna.ts (WORKORDER_ATENDIMENTO_OMNICHANNEL fase 1).
import type {
  ChatProvider,
  ProviderBloco,
  ProviderChamada,
  ProviderResposta,
} from "../llmProvider";

const URL_ANTHROPIC = "https://api.anthropic.com/v1/messages";
const VERSAO_API = "2023-06-01";

type BlocoAnthropicBruto = Record<string, unknown>;

function paraSystemAnthropic(
  system: ProviderChamada["system"],
): { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[] {
  return system.map((b) => ({
    type: "text" as const,
    text: b.text,
    ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
}

function paraFerramentasAnthropic(
  ferramentas: ProviderChamada["ferramentas"],
): { name: string; description: string; input_schema: Record<string, unknown> }[] {
  if (!ferramentas) return [];
  return ferramentas.map((f) => ({
    name: f.name,
    description: f.description,
    input_schema: f.inputSchema,
  }));
}

// mensagens ja estao no formato Anthropic-compativel (role/content), entao e
// so um repasse — mas tipado explicitamente para nao acoplar o chamador ao
// shape bruto da API.
function paraMensagensAnthropic(
  mensagens: ProviderChamada["mensagens"],
): { role: "user" | "assistant"; content: string | BlocoAnthropicBruto[] }[] {
  return mensagens.map((m) => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : (m.content as BlocoAnthropicBruto[]),
  }));
}

function dosBlocosAnthropic(blocos: BlocoAnthropicBruto[]): ProviderBloco[] {
  const out: ProviderBloco[] = [];
  for (const b of blocos) {
    if (b?.type === "text" && typeof b.text === "string") {
      out.push({ type: "text", text: b.text });
    } else if (b?.type === "tool_use") {
      out.push({
        type: "tool_use",
        id: typeof b.id === "string" ? b.id : "",
        name: typeof b.name === "string" ? b.name : "",
        input: (b.input as Record<string, unknown>) ?? {},
      });
    }
    // tool_result nunca vem DO modelo (so vai PARA ele) — ignorado aqui.
  }
  return out;
}

export const anthropicProvider: ChatProvider = {
  nome: "anthropic",

  temChaveConfigurada(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  },

  async chamar(chamada, opcoes): Promise<ProviderResposta> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { ok: false, erro: "ANTHROPIC_API_KEY ausente" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opcoes.timeoutMs);
    // Encadeia com um AbortSignal externo, se fornecido (ex.: cancelamento do
    // chamador) — sem depender de AbortSignal.any (compat mais ampla).
    const onExternalAbort = () => controller.abort();
    opcoes.signal?.addEventListener("abort", onExternalAbort);

    try {
      const resp = await fetch(URL_ANTHROPIC, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": VERSAO_API,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: chamada.modelo,
          max_tokens: chamada.maxTokens,
          system: paraSystemAnthropic(chamada.system),
          messages: paraMensagensAnthropic(chamada.mensagens),
          ...(chamada.ferramentas?.length
            ? { tools: paraFerramentasAnthropic(chamada.ferramentas) }
            : {}),
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const corpo = (await resp.text().catch(() => "")).slice(0, 500);
        return {
          ok: false,
          erro: corpo || `erro ${resp.status}`,
          status: resp.status,
        };
      }

      const data = (await resp.json().catch(() => null)) as {
        stop_reason?: string;
        content?: BlocoAnthropicBruto[];
        usage?: { input_tokens?: number; output_tokens?: number };
      } | null;

      const blocosBrutos = Array.isArray(data?.content) ? data.content : [];
      return {
        ok: true,
        blocos: dosBlocosAnthropic(blocosBrutos),
        pararPorFerramenta:
          data?.stop_reason === "tool_use" &&
          blocosBrutos.some((b) => b?.type === "tool_use"),
        tokensEntrada: Number(data?.usage?.input_tokens ?? 0) || 0,
        tokensSaida: Number(data?.usage?.output_tokens ?? 0) || 0,
      };
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      return { ok: false, erro: motivo };
    } finally {
      clearTimeout(timer);
      opcoes.signal?.removeEventListener("abort", onExternalAbort);
    }
  },
};
