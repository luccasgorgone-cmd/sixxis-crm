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
}
