// Camada 2 do Supervisor Comercial IA (SPEC §5/§6): o orquestrador que conversa
// com o GESTOR (admin), não com o cliente. Replica EXATAMENTE o laço provado da
// Luna (luna.ts): provider abstraído, teto de gasto como HARD STOP antes de
// qualquer chamada paga, saída estruturada (ProviderFormatoResposta) para o
// modelo não "fugir" do formato, fail-closed quando não há envelope válido, e
// SolEvento gravado para o mesmo teto mensal contar o gasto do supervisor.
//
// DUAS CLASSES DE FERRAMENTA, tratadas de formas OPOSTAS de propósito:
//   • LEITURA (acoes/consultas) — EXECUTÁVEIS no laço de tool-use. Só consultam
//     (painel, listagens). A IA chama à vontade para aprofundar o diagnóstico.
//   • ESCRITA (acoes/registro) — NUNCA executáveis pela IA. Elas NÃO são
//     passadas como "tools" ao provider. O máximo que a IA faz é PROPOR uma
//     (campo `proposta` do envelope). Nada é gravado aqui: a proposta vira um
//     SupervisorAcao(PROPOSTO) que o admin confirma numa segunda etapa
//     (human-in-the-loop, §6). Fail-closed por desenho: o modelo não tem como
//     auto-executar uma escrita, só sugerir.
import { prisma } from "../prisma";
import {
  obterProvider,
  type ProviderBloco,
  type ProviderFerramenta,
  type ProviderFormatoResposta,
  type ProviderMensagem,
  type ProviderSystemBloco,
} from "../llmProvider";
import { garantirProvidersRegistrados } from "../llmProviders/registro";
import { verificarOrcamentoMensal } from "../orcamentoIA";
import { registrarSolEvento } from "../solEvento";
import { montarPainel } from "./painel";
import {
  resolverLimiares,
  resolverVarredura,
  type Janela,
  type PainelSupervisor,
  type SupervisorLimiares,
  type VarreduraConfig,
} from "./tipos";
import {
  executarLeitura,
  FERRAMENTAS_LEITURA,
  type ContextoLeitura,
} from "./acoes/consultas";
import { acharFerramenta, nomesFerramentas } from "./acoes/registro";
import type { AdminCtx, Args } from "./acoes/tipos";

// ───────────────────────── tipos públicos ─────────────────────────
export type SupervisorMensagem = { autor: "gestor" | "assistente"; texto: string };

// Proposta de escrita que a IA sugere — SEM efeito até o admin confirmar.
export type SupervisorProposta = {
  ferramenta: string;
  args: Args;
  // Resumo humano (preview da própria ferramenta) para o card de confirmação.
  preview: string;
};

export type SupervisorResultado = {
  // Texto para o gestor (markdown). Nunca vai a cliente.
  resposta: string;
  // Proposta de ação pendente de confirmação, ou null.
  proposta: SupervisorProposta | null;
  // true quando a IA indicou que o GESTOR comandou esta ação (o chat pode
  // executá-la direto, se reversível). Só relevante quando proposta != null.
  acaoSolicitada: boolean;
  // Quando a IA tentou propor algo que não passou na validação do servidor:
  // a proposta é DESCARTADA (fail-closed) e o motivo fica aqui para log/UI.
  propostaRejeitada?: string;
  modelo: string | null;
  tokensEntrada: number;
  tokensSaida: number;
  // Motivo interno (log/telemetria) — nunca exibido como resposta.
  motivo?: string;
};

export type SupervisorEntrada = {
  historico: SupervisorMensagem[];
  admin: AdminCtx;
  agora?: Date;
};

// ───────────────────────── constantes ─────────────────────────
const MAX_ITER_FERRAMENTA = 4; // o supervisor costuma encadear 1-2 consultas
const MAX_TOKENS = 1500;
const TIMEOUT_MS = 45_000;
const PROVIDER_PADRAO = "gemini";
const MODELO_PADRAO = "gemini-3.1-flash-lite";
const JANELA_PADRAO_DIAS = 30;

// Sentinela: SolEvento exige conversaId/leadId NOT NULL, mas o supervisor não
// está preso a uma conversa. Usamos "supervisor" nos dois para o gasto entrar
// no mesmo teto mensal sem fingir vínculo com um lead real.
const SENTINELA = "supervisor";

const RESPOSTA_INDISPONIVEL =
  "Não consegui montar a análise agora (IA indisponível). Os números do painel continuam válidos — tente de novo em instantes.";

// ───────────────────────── config ─────────────────────────
type ConfigSupervisor = {
  provider: string;
  modelo: string;
  limiares: SupervisorLimiares;
  varredura: VarreduraConfig;
};

// Lê a (única) linha de SupervisorConfig. Ausente/incompleta → defaults seguros.
async function carregarConfig(): Promise<ConfigSupervisor> {
  let row: {
    provider: string | null;
    modelo: string | null;
    limiaresJson: unknown;
    varreduraJson: unknown;
  } | null = null;
  try {
    row = await prisma.supervisorConfig.findFirst({
      select: { provider: true, modelo: true, limiaresJson: true, varreduraJson: true },
      orderBy: { atualizadoEm: "desc" },
    });
  } catch (e) {
    console.warn(
      `[supervisor] falha ao ler SupervisorConfig, usando defaults: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
  return {
    provider: row?.provider?.trim() || PROVIDER_PADRAO,
    modelo: row?.modelo?.trim() || MODELO_PADRAO,
    limiares: resolverLimiares(row?.limiaresJson),
    varredura: resolverVarredura(row?.varreduraJson),
  };
}

function janelaPadrao(agora: Date): Janela {
  const inicio = new Date(agora);
  inicio.setDate(inicio.getDate() - JANELA_PADRAO_DIAS);
  return { inicio, fim: agora };
}

// ───────────────────────── system prompt ─────────────────────────
function montarSystem(
  painel: PainelSupervisor,
  cfg: ConfigSupervisor,
): ProviderSystemBloco[] {
  const base = `Você é o Supervisor Comercial da Sixxis — um CONSULTOR INTERNO que ajuda o GESTOR a ler o funil de vendas/pós-venda e a decidir o próximo passo. Você fala com o gestor, NUNCA com o cliente.

REGRAS DURAS:
1. Você NÃO envia mensagem, e-mail, WhatsApp ou qualquer coisa a clientes. Você não tem essa capacidade e nunca deve prometê-la.
2. Todo número que você citar tem que vir do painel/config abaixo ou de uma ferramenta de consulta. NUNCA invente métrica, valor ou nome. Se não sabe, diga que não sabe e sugira qual consulta faria.
3. Você pode AGIR no CRM: mover etapa, registrar ganho/perda, criar lembrete/nota, reatribuir vendedor, arquivar negócio, e ALTERAR A CONFIGURAÇÃO (definir_config). REGRA DE OURO do agir:
   • Só aja quando o GESTOR te MANDAR fazer aquilo. Nesse caso marque "acaoSolicitada": true — o comando dele é a autorização e a ação (sendo reversível) é aplicada na hora, com opção de desfazer.
   • Se a ideia for SUA (ele não pediu, só perguntou/analisou), marque "acaoSolicitada": false — vira uma SUGESTÃO que ele confirma depois. Na dúvida, false.
   Proponha no máximo UMA ação por resposta. Para ações sobre um negócio, use o id real (obtenha pelas consultas).
4. Seja direto e objetivo. O gestor quer diagnóstico e recomendação, não texto longo.

PARA ALTERAR CONFIGURAÇÃO use ferramenta "definir_config" com argsJson contendo só os campos que mudam, no formato {"limiares":{...},"varredura":{...}}. Campos de limiares: prazo1aRespostaSeg (segundos), metaPeriodoReais (reais, 0/null = sem meta), paradoDiasPadrao (dias), pesosCobertura {QUENTE,MORNO,FRIO} (0..1), metas (por indicador). Campos de varredura: ativa (bool), cadenciaMin (5..1440), semRespostaHoras (1..168), vigia {semResposta,semProximoPasso,parado,primeiraResposta} (bool). Ex.: gestor pede "prazo de 1ª resposta para 30 min" → ferramenta "definir_config", argsJson "{\\"limiares\\":{\\"prazo1aRespostaSeg\\":1800}}", acaoSolicitada true.

FERRAMENTAS DE CONSULTA (use para aprofundar além do painel): consultar_painel (recorta por vendedor/período), listar_negocios (ids reais, parados, sem próximo passo), listar_vendedores (ids para reatribuir), listar_etapas (ids para mover).

AÇÕES DISPONÍVEIS: ${nomesFerramentas().join(", ")}.

Responda SEMPRE no envelope JSON estruturado:
- "resposta": seu texto para o gestor (markdown curto).
- "temProposta": true quando houver uma ação concreta (proposta OU comandada).
- "acaoSolicitada": true se o GESTOR pediu explicitamente ESTA ação agora; false se é sugestão sua. Só vale quando temProposta=true.
- "ferramenta": o nome da ação (uma das disponíveis) ou "" se nenhuma.
- "argsJson": os argumentos da ação como JSON (ex.: {"negocioId":"...","etapaId":"..."}) ou "{}" se nenhuma.`;

  // Config atual como contexto factual (para a IA RESPONDER "como está configurado").
  const configCtx = `CONFIGURAÇÃO ATUAL (use como verdade factual ao explicar a config):\n${JSON.stringify(
    { limiares: cfg.limiares, varredura: cfg.varredura },
  )}`;

  // Painel serializado como contexto factual (a IA lê, nunca recalcula).
  const contexto = `PAINEL ATUAL (janela ${painel.janela.inicio} → ${painel.janela.fim}, use como verdade factual):\n${JSON.stringify(
    {
      metricas: painel.metricas,
      indicadores: painel.indicadores,
      funil: painel.funil,
      semProximoPasso: painel.semProximoPasso,
      cobertura: painel.cobertura,
      pctDentroDoPrazo: painel.pctDentroDoPrazo,
      perdas: painel.perdas,
      parados: painel.parados,
      origens: painel.origens,
      ranking: painel.ranking,
    },
  )}`;

  return [{ text: base, cache: true }, { text: configCtx }, { text: contexto }];
}

// Envelope estruturado (mesma técnica da Luna: força o formato pela API, não só
// por instrução de prompt). Todos os campos required + additionalProperties
// false para o modo strict do adapter fechar a porta a campo fora do schema. Os
// argumentos vão como STRING JSON (argsJson) de propósito: cada ferramenta de
// escrita tem um conjunto diferente de campos, e enumerar todos num schema
// strict forçaria o modelo a emitir chaves irrelevantes — validamos o JSON no
// servidor (validar() de cada ferramenta), que é onde a regra real mora.
const ENVELOPE_SUPERVISOR: ProviderFormatoResposta = {
  nome: "resposta_supervisor",
  schema: {
    type: "object",
    properties: {
      resposta: { type: "string" },
      temProposta: { type: "boolean" },
      acaoSolicitada: { type: "boolean" },
      ferramenta: { type: "string", enum: ["", ...nomesFerramentas()] },
      argsJson: { type: "string" },
    },
    required: ["resposta", "temProposta", "acaoSolicitada", "ferramenta", "argsJson"],
    additionalProperties: false,
  },
};

type EnvelopeBruto = {
  resposta: string;
  temProposta: boolean;
  // true só quando o GESTOR comandou a ação (autoriza execução direta reversível).
  // Default seguro = false (proposta/card). Um glitch nunca executa sozinho.
  acaoSolicitada: boolean;
  ferramenta: string;
  argsJson: string;
};

// Parser tolerante: tenta JSON direto e, se falhar, extrai o primeiro objeto
// {...} do texto (alguns modelos cercam com prosa apesar do structured output).
function parsearEnvelope(texto: string): EnvelopeBruto | null {
  const tentativas: string[] = [];
  const t = texto.trim();
  if (t) tentativas.push(t);
  const ini = t.indexOf("{");
  const fim = t.lastIndexOf("}");
  if (ini >= 0 && fim > ini) tentativas.push(t.slice(ini, fim + 1));

  for (const cand of tentativas) {
    try {
      const o = JSON.parse(cand) as Record<string, unknown>;
      if (typeof o.resposta !== "string") continue;
      return {
        resposta: o.resposta,
        temProposta: o.temProposta === true,
        acaoSolicitada: o.acaoSolicitada === true,
        ferramenta: typeof o.ferramenta === "string" ? o.ferramenta : "",
        argsJson: typeof o.argsJson === "string" ? o.argsJson : "{}",
      };
    } catch {
      // tenta o próximo candidato
    }
  }
  return null;
}

// Converte as ferramentas de LEITURA no formato do provider (só estas são
// expostas ao modelo como executáveis).
function ferramentasProvider(): ProviderFerramenta[] {
  return FERRAMENTAS_LEITURA.map((f) => ({
    name: f.nome,
    description: f.descricao,
    inputSchema: f.inputSchema,
  }));
}

function textoDosBlocos(blocos: ProviderBloco[]): string {
  return blocos
    .filter((b): b is Extract<ProviderBloco, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// Monta a proposta a partir do envelope. Fail-closed: se a ferramenta não
// existe, o JSON não parseia, ou o validar() da ferramenta recusa, NÃO há
// proposta — devolve o motivo em `rejeicao` para a UI/log, nada é persistido.
async function montarProposta(
  env: EnvelopeBruto,
  admin: AdminCtx,
): Promise<{ proposta: SupervisorProposta | null; rejeicao?: string }> {
  if (!env.temProposta || !env.ferramenta) return { proposta: null };

  const ferramenta = acharFerramenta(env.ferramenta);
  if (!ferramenta) {
    return { proposta: null, rejeicao: `ferramenta desconhecida: ${env.ferramenta}` };
  }

  let args: Args;
  try {
    const bruto = JSON.parse(env.argsJson || "{}");
    if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) {
      return { proposta: null, rejeicao: "argsJson não é um objeto" };
    }
    args = bruto as Args;
  } catch {
    return { proposta: null, rejeicao: "argsJson inválido (JSON malformado)" };
  }

  // validar() é read-only (existência/escopo/regra) — roda já na proposta, com o
  // admin do chat como autor-contexto. A gravação real só acontece no confirmar.
  const validacao = await ferramenta.validar(args, admin);
  if (!validacao.ok) {
    return { proposta: null, rejeicao: validacao.erro ?? "argumentos inválidos" };
  }

  let preview = ferramenta.titulo;
  try {
    preview = await ferramenta.preview(args);
  } catch {
    // preview é best-effort; cai no título
  }
  return { proposta: { ferramenta: ferramenta.nome, args, preview } };
}

// Converte o histórico do chat no formato do provider.
function montarMensagens(historico: SupervisorMensagem[]): ProviderMensagem[] {
  return historico
    .filter((m) => m.texto.trim().length > 0)
    .map((m) => ({
      role: m.autor === "gestor" ? "user" : "assistant",
      content: m.texto,
    }));
}

// ───────────────────────── orquestrador ─────────────────────────
export async function gerarRespostaSupervisor(
  entrada: SupervisorEntrada,
): Promise<SupervisorResultado> {
  const agora = entrada.agora ?? new Date();
  const uso = { tokensEntrada: 0, tokensSaida: 0 };
  const config = await carregarConfig();

  const base = (extra: Partial<SupervisorResultado> = {}): SupervisorResultado => ({
    resposta: RESPOSTA_INDISPONIVEL,
    proposta: null,
    acaoSolicitada: false,
    modelo: config.modelo,
    tokensEntrada: uso.tokensEntrada,
    tokensSaida: uso.tokensSaida,
    ...extra,
  });

  // Provider resolvido + chave presente. Sem isso → não chama nada.
  garantirProvidersRegistrados();
  const provider = obterProvider(config.provider);
  if (!provider) {
    return base({ motivo: `provider "${config.provider}" não registrado` });
  }
  if (!provider.temChaveConfigurada()) {
    return base({ motivo: `chave do provider "${config.provider}" ausente` });
  }

  // TETO DE GASTO: HARD STOP antes de qualquer chamada paga. Nunca lança;
  // recusa por segurança (inclui modelo sem preço cadastrado).
  const orcamento = await verificarOrcamentoMensal(config.modelo, agora);
  if (!orcamento.ok) {
    await registrarSolEvento(
      SENTINELA,
      SENTINELA,
      "supervisor_chat",
      orcamento.motivo ?? "teto de gasto atingido",
      config.modelo,
      uso,
    );
    return base({
      resposta:
        "O teto mensal de gasto de IA foi atingido. A análise automática está pausada até o próximo ciclo — os números do painel seguem disponíveis.",
      motivo: orcamento.motivo,
    });
  }

  // Painel inicial (janela padrão, equipe toda) como contexto factual.
  let painel: PainelSupervisor;
  try {
    painel = await montarPainel(janelaPadrao(agora), null, config.limiares, {}, agora);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error(`[supervisor] falha ao montar painel: ${motivo}`);
    return base({ motivo: `falha ao montar painel: ${motivo}` });
  }

  const system = montarSystem(painel, config);
  const mensagens = montarMensagens(entrada.historico);
  if (mensagens.length === 0) {
    return base({ resposta: "Em que posso ajudar com o funil hoje?", motivo: "histórico vazio" });
  }

  const ctxLeitura: ContextoLeitura = {
    limiares: config.limiares,
    escopoPadrao: {},
    agora,
  };
  const ferramentas = ferramentasProvider();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let tentouDeNovoPorTextoVazio = false;

  const finalizar = async (r: SupervisorResultado): Promise<SupervisorResultado> => {
    await registrarSolEvento(
      SENTINELA,
      SENTINELA,
      "supervisor_chat",
      r.motivo ?? (r.proposta ? `propôs ${r.proposta.ferramenta}` : null),
      config.modelo,
      uso,
    );
    return { ...r, tokensEntrada: uso.tokensEntrada, tokensSaida: uso.tokensSaida };
  };

  try {
    for (let iter = 0; iter <= MAX_ITER_FERRAMENTA; iter++) {
      const resp = await provider.chamar(
        {
          modelo: config.modelo,
          maxTokens: MAX_TOKENS,
          system,
          mensagens,
          ferramentas,
          formatoResposta: ENVELOPE_SUPERVISOR,
        },
        { timeoutMs: TIMEOUT_MS, signal: controller.signal },
      );

      if (!resp.ok) {
        console.error(`[supervisor] provider=${config.provider}: ${resp.erro}`);
        return finalizar(base({ motivo: `falha do provider: ${resp.erro}` }));
      }

      uso.tokensEntrada += resp.tokensEntrada;
      uso.tokensSaida += resp.tokensSaida;
      const blocos = resp.blocos;

      const usosFerramenta = blocos.filter(
        (b): b is Extract<ProviderBloco, { type: "tool_use" }> => b.type === "tool_use",
      );
      if (resp.pararPorFerramenta && usosFerramenta.length > 0 && iter < MAX_ITER_FERRAMENTA) {
        mensagens.push({ role: "assistant", content: blocos });
        const resultados: ProviderBloco[] = [];
        for (const u of usosFerramenta) {
          const saida = await executarLeitura(u.name, (u.input ?? {}) as Args, ctxLeitura);
          resultados.push({ type: "tool_result", tool_use_id: u.id, content: saida });
        }
        mensagens.push({ role: "user", content: resultados });
        continue;
      }

      const texto = textoDosBlocos(blocos);
      const env = parsearEnvelope(texto);
      if (env) {
        const { proposta, rejeicao } = await montarProposta(env, entrada.admin);
        return finalizar(
          base({
            resposta: env.resposta.trim() || RESPOSTA_INDISPONIVEL,
            proposta,
            acaoSolicitada: proposta ? env.acaoSolicitada : false,
            ...(rejeicao ? { propostaRejeitada: rejeicao } : {}),
            motivo: undefined,
          }),
        );
      }

      // Texto vazio/sem envelope: retentativa ÚNICA sem ferramentas (mesmo
      // glitch de response_format+tools observado no Gemini na Luna).
      if (!tentouDeNovoPorTextoVazio) {
        tentouDeNovoPorTextoVazio = true;
        const retry = await provider.chamar(
          { modelo: config.modelo, maxTokens: MAX_TOKENS, system, mensagens, formatoResposta: ENVELOPE_SUPERVISOR },
          { timeoutMs: TIMEOUT_MS, signal: controller.signal },
        );
        if (retry.ok) {
          uso.tokensEntrada += retry.tokensEntrada;
          uso.tokensSaida += retry.tokensSaida;
          const envRetry = parsearEnvelope(textoDosBlocos(retry.blocos));
          if (envRetry) {
            const { proposta, rejeicao } = await montarProposta(envRetry, entrada.admin);
            return finalizar(
              base({
                resposta: envRetry.resposta.trim() || RESPOSTA_INDISPONIVEL,
                proposta,
                acaoSolicitada: proposta ? envRetry.acaoSolicitada : false,
                ...(rejeicao ? { propostaRejeitada: rejeicao } : {}),
                motivo: undefined,
              }),
            );
          }
        }
      }

      // Sem envelope mesmo após a retentativa: fail-closed. Não inventa
      // resposta nem executa nada — devolve indisponível com motivo.
      return finalizar(base({ motivo: "resposta sem envelope JSON (fail-closed)" }));
    }

    return finalizar(base({ motivo: "limite de rodadas de ferramenta atingido" }));
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error(`[supervisor] erro ao chamar provider "${config.provider}": ${motivo}`);
    return finalizar(base({ motivo: `exceção: ${motivo}` }));
  } finally {
    clearTimeout(timer);
  }
}
