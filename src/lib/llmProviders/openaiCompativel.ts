// Provider "OpenAI-compativel" (Chat Completions API, formato usado por
// OpenAI de verdade E por praticamente todo provider barato citado no
// WORKORDER_ATENDIMENTO_OMNICHANNEL: GPT-4.1 Nano, DeepSeek, Qwen via
// endpoints compativeis, Llama 4 Scout via varios hosts). Configuravel por
// BASE URL + chave, entao a MESMA implementacao serve para varios provedores
// — nao precisa de um arquivo por fornecedor.
//
// DESIGN, NAO EXECUCAO: nao chama nada sem uma chave/URL configuradas (mesmo
// principio de "sem chave -> nunca quebra" de luna.ts). Uso previsto:
// registrar UMA instancia por variavel de ambiente prefixada, ex.:
//   criarProviderOpenAICompativel({
//     nome: "openai",
//     envUrl: "OPENAI_BASE_URL",       // default: api.openai.com/v1
//     envChave: "OPENAI_API_KEY",
//   })
import type {
  ChatProvider,
  ProviderBloco,
  ProviderChamada,
  ProviderMensagem,
  ProviderResposta,
} from "../llmProvider";

const URL_PADRAO_OPENAI = "https://api.openai.com/v1/chat/completions";

type MsgOpenAI = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
    // Ecoa de volta o extra_content que o provider mandou na resposta
    // original (ex.: thought_signature do Gemini) — ver metadadosProvider em
    // llmProvider.ts. Ausente para providers que nao usam isso.
    extra_content?: unknown;
  }[];
  tool_call_id?: string;
};

// Chat Completions nao tem "system" separado: vira a(s) primeira(s)
// mensagem(ns) role=system. Blocos de tool_use/tool_result do formato
// normalizado viram tool_calls (assistant) e role=tool (resultado).
function paraMensagensOpenAI(
  system: ProviderChamada["system"],
  mensagens: ProviderMensagem[],
): MsgOpenAI[] {
  const out: MsgOpenAI[] = system
    .map((s) => s.text.trim())
    .filter(Boolean)
    .map((text) => ({ role: "system" as const, content: text }));

  for (const m of mensagens) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    // Turno com blocos: separa texto (vira content), tool_use (vira
    // tool_calls do assistant) e tool_result (vira mensagens role=tool).
    const textos = m.content
      .filter((b): b is Extract<ProviderBloco, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const usosFerramenta = m.content.filter(
      (b): b is Extract<ProviderBloco, { type: "tool_use" }> => b.type === "tool_use",
    );
    const resultadosFerramenta = m.content.filter(
      (b): b is Extract<ProviderBloco, { type: "tool_result" }> => b.type === "tool_result",
    );

    if (m.role === "assistant" && usosFerramenta.length > 0) {
      out.push({
        role: "assistant",
        content: textos || null,
        tool_calls: usosFerramenta.map((u) => ({
          id: u.id,
          type: "function" as const,
          function: { name: u.name, arguments: JSON.stringify(u.input) },
          ...(u.metadadosProvider !== undefined
            ? { extra_content: u.metadadosProvider }
            : {}),
        })),
      });
      continue;
    }
    if (resultadosFerramenta.length > 0) {
      for (const r of resultadosFerramenta) {
        out.push({ role: "tool", content: r.content, tool_call_id: r.tool_use_id });
      }
      continue;
    }
    if (textos) out.push({ role: m.role, content: textos });
  }
  return out;
}

function paraFerramentasOpenAI(ferramentas: ProviderChamada["ferramentas"]) {
  if (!ferramentas?.length) return undefined;
  return ferramentas.map((f) => ({
    type: "function" as const,
    function: {
      name: f.name,
      description: f.description,
      parameters: f.inputSchema,
    },
  }));
}

export type ConfigProviderOpenAICompativel = {
  // Nome logico deste provider no registro (ex.: "openai", "deepseek",
  // "qwen"). Varias instancias podem coexistir com nomes diferentes.
  nome: string;
  // Env var com a BASE URL da API (ex.: "https://api.deepseek.com/v1"). Se
  // ausente/vazia, cai no default da OpenAI.
  envUrl?: string;
  urlPadrao?: string;
  // Env var com a chave de API. Obrigatoria — sem ela, temChaveConfigurada()
  // e false e chamar() nunca executa.
  envChave: string;
};

export function criarProviderOpenAICompativel(
  cfg: ConfigProviderOpenAICompativel,
): ChatProvider {
  const urlBase = () =>
    (cfg.envUrl ? process.env[cfg.envUrl] : undefined) ||
    cfg.urlPadrao ||
    URL_PADRAO_OPENAI;

  return {
    nome: cfg.nome,

    temChaveConfigurada(): boolean {
      return !!process.env[cfg.envChave];
    },

    async chamar(chamada, opcoes): Promise<ProviderResposta> {
      const apiKey = process.env[cfg.envChave];
      if (!apiKey) {
        return { ok: false, erro: `${cfg.envChave} ausente` };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opcoes.timeoutMs);
      const onExternalAbort = () => controller.abort();
      opcoes.signal?.addEventListener("abort", onExternalAbort);

      try {
        const resp = await fetch(urlBase(), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: chamada.modelo,
            max_tokens: chamada.maxTokens,
            messages: paraMensagensOpenAI(chamada.system, chamada.mensagens),
            ...(paraFerramentasOpenAI(chamada.ferramentas)
              ? { tools: paraFerramentasOpenAI(chamada.ferramentas) }
              : {}),
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const corpo = (await resp.text().catch(() => "")).slice(0, 500);
          return { ok: false, erro: corpo || `erro ${resp.status}`, status: resp.status };
        }

        const data = (await resp.json().catch(() => null)) as {
          choices?: {
            finish_reason?: string;
            message?: {
              content?: string | null;
              tool_calls?: {
                id: string;
                function: { name: string; arguments: string };
                // Google (Gemini) anexa aqui extra_content.google.thought_signature
                // — precisa ser ecoado de volta no proximo turno, ver
                // metadadosProvider em llmProvider.ts.
                extra_content?: unknown;
              }[];
            };
          }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        } | null;

        const escolha = data?.choices?.[0];
        const blocos: ProviderBloco[] = [];
        if (escolha?.message?.content) {
          blocos.push({ type: "text", text: escolha.message.content });
        }
        for (const tc of escolha?.message?.tool_calls ?? []) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(tc.function.arguments || "{}");
          } catch {
            // arguments malformado: segue com input vazio, o chamador decide
            // como reagir (mesma tolerancia que luna.ts ja aplica ao parsear
            // a decisao final).
          }
          blocos.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input,
            ...(tc.extra_content !== undefined
              ? { metadadosProvider: tc.extra_content }
              : {}),
          });
        }

        return {
          ok: true,
          blocos,
          pararPorFerramenta: escolha?.finish_reason === "tool_calls",
          tokensEntrada: Number(data?.usage?.prompt_tokens ?? 0) || 0,
          tokensSaida: Number(data?.usage?.completion_tokens ?? 0) || 0,
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
}
