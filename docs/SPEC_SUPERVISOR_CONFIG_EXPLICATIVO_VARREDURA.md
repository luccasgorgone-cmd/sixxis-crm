# SPEC — Supervisor Comercial IA: Configurações, Explicativo e Varredura

**Status:** proposto (aguardando aprovação do Luccas antes de codar — Artigo 14).
**Data:** 2026-10-14.
**Classificação:** Architectural (novo subsistema de config editável + capacidade de escrita da IA + job agendado + superfície de documentação).
**Branch de trabalho:** `wip/atendimento-omnichannel-provider-abstract` (não-deploy). Deploy pra `main` só com OK direto do Luccas (catraca).

---

## 1. Objetivo

Dar ao Supervisor Comercial IA (`/admin/supervisor`, admin-only) três capacidades novas, mantendo-o como **consultor interno que nunca fala com cliente**:

1. **Configurações** — uma aba onde os parâmetros hoje fixos no código (prazos, limiares, metas do semáforo, cadência da varredura) ficam **visíveis e editáveis** — pelo gestor (formulário) e pela IA (comando no chat).
2. **Explicativo** — uma aba que **documenta o estado atual**: quais varreduras existem, com que frequência rodam, o que cada uma checa, e os valores de config vigentes. Gerada a partir da config real, nunca escrita à mão, nunca fica desatualizada.
3. **Varredura periódica** — um job que, de tempos em tempos, examina os atendimentos/negócios, registra o que precisa de ação na aba **Alertas** e deixa a ação corretiva **proposta** pro gestor confirmar com 1 clique (nunca executa sozinha).

## 2. Fronteiras inegociáveis (decididas com o Luccas em 14/10/2026)

- **F-A — Nunca mensagem a cliente.** O Supervisor não ganha, em hipótese alguma, ferramenta de envio. A trava estrutural `assertSemEnvioAoCliente` + `PADROES_PROIBIDOS` (`src/lib/supervisor/acoes/registro.ts:32-59`, quebra no boot) continua valendo e passa a cobrir **todas** as ferramentas de escrita novas. "Qualquer edição que a IA faz" = qualquer edição **interna**. Liberar envio a cliente é outro agente (Sol) e outra decisão — fora deste escopo.
- **F-B — Irreversível pede OK.** Edição reversível (com snapshot antes/depois e botão de desfazer) a IA executa direto quando comandada no chat. Edição destrutiva de verdade (sem volta) sempre pede confirmação explícita — catraca "ação destrutiva".

## 3. Modelo de autorização da IA (dois modos)

O ponto de entrada decide o poder da IA — isso torna a regra verificável, sem depender da IA "adivinhar" intenção:

| Entrada | Significado | Comportamento |
|---|---|---|
| **Chat** (admin mandou uma mensagem) | O comando do admin é a autorização | Edição **reversível** → executa direto, registra antes/depois, mostra "feito: X" com desfazer. Edição **irreversível** → vira card de confirmação. |
| **Varredura** (job de fundo, sem admin) | Ação não pedida | **Sempre** proposta (`SupervisorAcao(PROPOSTO)`); nunca executa. |

Salvaguarda extra no chat: a IA só executa quando o turno do admin é **instrução de agir** (a IA marca `acaoSolicitada:true` no envelope). Se ela quiser ir além do que foi pedido, cai em proposta (card). Se o modelo errar e marcar errado, o pior caso é uma edição **reversível** com desfazer — nada irreversível roda sem OK (F-B). Para pergunta/análise ("como está o funil?"), a IA responde e, no máximo, sugere em texto — não age.

## 4. Como a IA edita (segurança de dados)

A IA **não** recebe um "executa qualquer coisa no banco". As edições passam por **ferramentas tipadas e validadas** (cada uma com `validar()` read-only + `executar()` transacional + snapshot antes/depois), crescendo o conjunto conforme a necessidade. Hoje existem 7 ferramentas de escrita (`mover_etapa`, `registrar_ganho`, `registrar_perda`, `criar_lembrete`, `criar_nota`, `reatribuir_vendedor`, `arquivar_negocio`). Este trabalho adiciona:

- **`definir_config`** (W, reversível) — grava um subconjunto validado de `SupervisorConfig` (prazos, limiares, metas, pesos, cadência/itens da varredura). `antesJson`=config atual, `depoisJson`=nova. Desfazer = regravar `antesJson`. Rejeita chave desconhecida ou valor fora de faixa (ex.: cadência < 5 min, prazo negativo).

A diferença que o Luccas sente: ele pede, ela faz. A diferença que protege o sistema: o caminho é tipado, então não corrompe dado.

## 5. O que a varredura vigia (lista confirmada)

Detecção **determinística** (camada C1, sem LLM → custo de token zero, previsível, sem risco de orçamento). Para cada item achado, anexa uma **ação recomendada** (também determinística) como `SupervisorAcao(PROPOSTO)`:

| # | Sinal | Detecção | Ação proposta |
|---|---|---|---|
| 1 | **Cliente sem resposta** | Conversa cuja última mensagem é `IN` (do cliente) e passou de `semRespostaHoras` sem `OUT` | `criar_lembrete` ("responder cliente") pro dono |
| 2 | **Sem próximo passo** | Negócio ABERTO sem `Lembrete` PENDENTE futuro (mesma regra do painel, `indicadores.ts:214`) | `criar_lembrete` |
| 3 | **Parado além do limiar da etapa** | Negócio ABERTO parado > limiar **da etapa** — reusa `ConfigAlertaSla` (fonte única; substitui o `paradoDiasPadrao=7` global do painel) | `criar_lembrete` ou `mover_etapa` conforme etapa |
| 4 | **1ª resposta estourada** | Lead novo cujo tempo até 1ª resposta passou de `prazo1aRespostaSeg` | `criar_lembrete` ("priorizar lead novo") |

**Papéis distintos (não duplica):** o `slaAlertas` (60s) já avisa **o vendedor dono**. A varredura do Supervisor é a camada de **gestão**: junta tudo numa visão de admin e deixa a correção pronta pra você. Um não substitui o outro.

**Dedup:** antes de criar um `PROPOSTO`, consulta se já há um PROPOSTO aberto pro mesmo `negocioId`+tipo; se houver, não recria. Assim a aba Alertas não enche de duplicatas a cada ciclo.

## 6. Aba Explicativo (documentação viva)

Read-only, gerada de duas fontes reais (nunca texto fixo que envelhece):
- **Config vigente** — lê `SupervisorConfig` resolvido (`resolverLimiares`, `tipos.ts:170`) e mostra cada parâmetro com valor atual + o que ele significa + onde é usado.
- **Registro de varreduras** — um registro estático (no código) das rotinas de fundo (a varredura do Supervisor + as do sistema: `slaAlertas` 60s, `alertas` 90s, `recaptacao` 60s, `arquivamento` 24h, `manutencao` 24h), cada uma com: o que faz, cadência, o que lê, e se é editável e onde. A cadência exibida vem da constante/env real, não de um número digitado no doc.

Objetivo explícito do Luccas: "pra eu conseguir lembrar como está configurado as varreduras / como está no momento, pra não me perder."

## 7. Mudanças de dados (aditivas — zero DROP/TEMP)

- **`SupervisorConfig.varreduraJson Json?`** (nova coluna, nullable, aditiva) — `{ ativa:boolean, cadenciaMin:number, semRespostaHoras:number, vigia:{semResposta:bool, semProximoPasso:bool, parado:bool, primeiraResposta:bool} }`. Default aplicado por resolver quando ausente (varredura começa **desligada**, `ativa:false`, até o gestor ligar). Os limiares (prazo/metas/pesos) seguem em `limiaresJson`, que já existe.
- **`SupervisorAcao`** — **sem mudança de schema**. Reusado pra config (`ferramenta="definir_config"`, `negocioId/leadId` nulos, antes/depois em `antesJson/depoisJson`) e pras propostas da varredura (`ferramenta` da ação recomendada). O enum de status (`PROPOSTO/EXECUTADO/DESCARTADO/REVERTIDO/FALHOU`) já cobre tudo.

Migração validada contra o schema real de produção via transação com ROLLBACK (nada persiste), como nas migrações anteriores. Roda só no deploy pra `main`.

## 8. Rotas novas (admin-only, todas re-validam no servidor)

- `GET /api/admin/supervisor/config` — devolve a config resolvida (pra aba Configurações e Explicativo).
- `PUT /api/admin/supervisor/config` — grava config editada pelo **gestor** (formulário). Valida faixas. Grava `SupervisorAcao(EXECUTADO, ferramenta="definir_config")` pro histórico/undo.
- A escrita de config **pela IA** reusa o fluxo de chat existente: comando reversível → executa via `definir_config` e devolve "feito"; proposta → card. Sem rota nova pra isso.
- Confirmação/descarte de propostas da varredura: reusa `POST /api/admin/supervisor/acao/confirmar` (já existe).

## 9. UI (mesmo padrão visual já entregue — tokens tiffany/escuro, lucide, Inter)

`SupervisorConsole.tsx` ganha duas abas novas na tablist existente: **Configurações** (ícone `SlidersHorizontal`) e **Explicativo** (ícone `BookOpen`). Ordem proposta: Relatórios · Alertas · Chat · Configurações · Explicativo.
- `PainelConfiguracoes.tsx` (novo) — formulário por seções (Prazos & limiares / Metas do semáforo / Cobertura / Varredura on-off + cadência + itens). Salvar chama `PUT`. Estados de carregando/erro/salvo reais.
- `PainelExplicativo.tsx` (novo) — leitura estruturada (config vigente + registro de varreduras). Sem edição.
- `PainelPartes.tsx` — reusa primitivas; adiciona `CampoNumero`/`CampoToggle` se faltar.

## 10. Fases de entrega (cada fase: gates verdes → commit → push sob Artigo 1.7 → receipt; deploy só com OK direto)

- **F1 — Config editável:** coluna `varreduraJson` + resolver + `GET/PUT /config` + `PainelConfiguracoes` + ferramenta `definir_config` (chat comandado executa; não-pedido propõe). Testes de contrato: resolve/merge de config, faixas inválidas rejeitadas, undo regrava `antesJson`, `assertSemEnvioAoCliente` ainda barra nomes proibidos.
- **F2 — Explicativo:** registro estático de varreduras + `PainelExplicativo` lendo config real.
- **F3 — Varredura:** `iniciarVarreduraSupervisor` (setInterval, pulado em `SANDBOX_ONLY`, cadência da config, detecção determinística, dedup, cria PROPOSTO) + ligação na aba Alertas. Testes: fixtures → achados esperados pros 4 sinais; dedup não recria PROPOSTO.

## 11. Testes

- **Puros/contrato** (`scripts/contratos/c6-supervisor-config-varredura.ts`, novo): config resolve/merge, validação de faixas, undo, detecção dos 4 sinais com fixtures, dedup, guarda anti-envio.
- **Banco real:** só no docker descartável (`127.0.0.1:5433`), nunca na prod. `.env.local` aponta pra PROD — não serve pra teste.
- **Migração:** validada por transação com ROLLBACK contra o schema de produção.
- **Gates por commit:** `tsc --noEmit` 0, `next build` 0, contratos verdes (c1..c6).

## 12. Fora de escopo

- Ativar a Sol / qualquer envio a cliente (`ConfigAgenteIA.ativo` segue `false`).
- Mudar o `slaAlertas` ou a cadência das rotinas do sistema (o Explicativo só as **documenta**; editar a do Supervisor, sim).
- LLM dentro da varredura (ela é determinística de propósito — custo zero).
