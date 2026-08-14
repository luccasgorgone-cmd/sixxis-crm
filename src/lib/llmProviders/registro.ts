// Registro central dos providers de chat disponiveis (WORKORDER_ATENDIMENTO_
// OMNICHANNEL fase 1: "provider-abstraido... dá pra trocar de modelo/
// fornecedor sem reescrever nada"). Chamado uma vez na inicializacao de quem
// precisa resolver um provider por nome (luna.ts).
//
// Providers listados aqui SO fazem alguma chamada de rede se a env var da
// chave correspondente estiver setada — registrar nao ativa nada.
import { registrarProvider } from "../llmProvider";
import { anthropicProvider } from "./anthropic";
import { criarProviderOpenAICompativel } from "./openaiCompativel";

let registrado = false;

export function garantirProvidersRegistrados(): void {
  if (registrado) return;
  registrado = true;

  registrarProvider(anthropicProvider);

  // OpenAI (ou compativel via OPENAI_BASE_URL, ex.: proxy/gateway proprio).
  registrarProvider(
    criarProviderOpenAICompativel({
      nome: "openai",
      envChave: "OPENAI_API_KEY",
      envUrl: "OPENAI_BASE_URL",
    }),
  );

  // DeepSeek (endpoint OpenAI-compativel oficial).
  registrarProvider(
    criarProviderOpenAICompativel({
      nome: "deepseek",
      envChave: "DEEPSEEK_API_KEY",
      urlPadrao: "https://api.deepseek.com/chat/completions",
    }),
  );

  // Qwen / Alibaba Cloud (DashScope, endpoint OpenAI-compativel).
  registrarProvider(
    criarProviderOpenAICompativel({
      nome: "qwen",
      envChave: "QWEN_API_KEY",
      envUrl: "QWEN_BASE_URL",
      urlPadrao:
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    }),
  );

  // Gemini / Google AI (endpoint OpenAI-compativel oficial do Google). Modelo
  // escolhido pelo Luccas em 14/08/2026 (via `main`) pra Fase 1 do work order
  // de atendimento: Gemini Flash-Lite, teto $10/mes — ver src/lib/orcamentoIA.ts
  // (a checagem de teto roda em luna.ts ANTES de qualquer chamada a este
  // provider, independente de qual provider seja).
  registrarProvider(
    criarProviderOpenAICompativel({
      nome: "gemini",
      envChave: "GEMINI_API_KEY",
      envUrl: "GEMINI_BASE_URL",
      urlPadrao:
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    }),
  );
}
