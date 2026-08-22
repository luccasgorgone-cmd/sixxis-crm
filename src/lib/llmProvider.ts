// Abstracao de PROVIDER de modelo de chat (WORKORDER_ATENDIMENTO_OMNICHANNEL,
// fase 1: "provider-abstraido... trocavel sem reescrever nada"). Define um
// formato NORMALIZADO de chamada/resposta que qualquer provider (Anthropic,
// OpenAI-compatible, e futuramente outros) implementa — quem chama (luna.ts)
// nao sabe qual API real esta por tras.
//
// DESIGN, NAO EXECUCAO: este modulo e puramente estrutural. Nao consome
// ANTHROPIC_API_KEY nem nenhuma chave nova por si so — cada implementacao de
// provider so roda quando alguem a invoca com uma chave configurada (mesma
// regra de "sem chave -> nunca quebra" que luna.ts ja segue).
//
// FORMATO NORMALIZADO (inspirado no shape da Anthropic, que ja e o que luna.ts
// usa, mas GENERICO o bastante para OpenAI-style function calling mapear sem
// perda): blocos de texto e blocos de tool_use/tool_result. Cada provider
// concreto converte DE/PARA este formato na fronteira do modulo dele — o
// resto do sistema (luna.ts, oracle.ts no futuro) nunca ve o formato nativo.
export type ProviderBlocoTexto = { type: "text"; text: string };
export type ProviderBlocoToolUse = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
  // Dado opaco especifico do provider que precisa ser ecoado de volta
  // exatamente como veio no proximo turno (ex.: extra_content.google.
  // thought_signature do Gemini, exigido pela API em respostas com tool use
  // multi-turno — sem isso a chamada seguinte quebra com 400). Providers que
  // nao usam isso simplesmente nunca preenchem.
  metadadosProvider?: unknown;
};
export type ProviderBlocoToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};
export type ProviderBloco =
  | ProviderBlocoTexto
  | ProviderBlocoToolUse
  | ProviderBlocoToolResult;

export type ProviderMensagem = {
  role: "user" | "assistant";
  // string = texto simples (turno normal). Lista de blocos = turno de tool
  // use/tool result (mesma dualidade que a API da Anthropic ja usa).
  content: string | ProviderBloco[];
};

// Bloco de system prompt. `cache` e uma DICA de otimizacao (ex.: prompt
// caching da Anthropic) — providers que nao suportam simplesmente ignoram.
export type ProviderSystemBloco = { text: string; cache?: boolean };

export type ProviderFerramenta = {
  name: string;
  description: string;
  // JSON Schema (o mesmo formato que Anthropic tool `input_schema` e OpenAI
  // function `parameters` ja usam — nao precisa de traducao de schema).
  inputSchema: Record<string, unknown>;
};

// Pede ao provider para FORCAR a resposta final (texto) a seguir este JSON
// Schema, usando o mecanismo estrutural da API (response_format/json_schema),
// nao so instrucao de prompt. Motivo: a bateria adversarial da Sol achou que
// alguns modelos (ex.: Gemini Flash-Lite) simplesmente ignoram "responda so
// com JSON" escrito no prompt e devolvem prosa livre — um fail-open serio,
// porque sem o envelope JSON as acoes "handoff"/"silenciar" nunca disparam.
// Providers que nao suportam response_format estruturado (ou nao precisam,
// porque ja obedecem por instrucao) simplesmente ignoram este campo — o texto
// livre ainda passa pelo parser tolerante de quem chamou.
export type ProviderFormatoResposta = {
  nome: string;
  schema: Record<string, unknown>;
};

export type ProviderChamada = {
  modelo: string;
  system: ProviderSystemBloco[];
  mensagens: ProviderMensagem[];
  ferramentas?: ProviderFerramenta[];
  maxTokens: number;
  // Alguns providers (chat completions classico) nao tem "system" separado do
  // array de mensagens — cada implementacao decide como embutir.
  formatoResposta?: ProviderFormatoResposta;
};

export type ProviderRespostaOk = {
  ok: true;
  // Blocos do turno do assistente (texto e/ou tool_use), na ordem em que o
  // modelo os produziu.
  blocos: ProviderBloco[];
  pararPorFerramenta: boolean;
  tokensEntrada: number;
  tokensSaida: number;
};
export type ProviderRespostaErro = {
  ok: false;
  erro: string;
  status?: number;
};
export type ProviderResposta = ProviderRespostaOk | ProviderRespostaErro;

// Cada provider concreto implementa isto. `chamar` NUNCA lanca — erros de
// rede/API viram { ok: false }, seguindo o mesmo principio de "nunca quebra"
// que luna.ts ja aplica no chamador.
export interface ChatProvider {
  readonly nome: string;
  // Chave de env necessaria para operar (para o chamador decidir handoff
  // automatico sem instanciar nada, igual luna.ts faz hoje com
  // ANTHROPIC_API_KEY).
  temChaveConfigurada(): boolean;
  chamar(
    chamada: ProviderChamada,
    opcoes: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<ProviderResposta>;
}

// Registro simples por nome. Cada arquivo de provider concreto
// (llmProviders/anthropic.ts, llmProviders/openaiCompativel.ts, ...) se
// registra aqui OU e importado direto por quem decide o provider (luna.ts).
// Mantido minimo de proposito — nao e um DI container, so uma tabela.
const registro = new Map<string, ChatProvider>();

export function registrarProvider(p: ChatProvider): void {
  registro.set(p.nome, p);
}

export function obterProvider(nome: string): ChatProvider | undefined {
  return registro.get(nome);
}

export function providersRegistrados(): string[] {
  return [...registro.keys()];
}
