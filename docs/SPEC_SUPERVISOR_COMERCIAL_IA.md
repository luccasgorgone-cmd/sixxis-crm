# Spec — Supervisor Comercial com IA (aba admin)

> Status: SPEC / PLANEJAMENTO (Artigo 14 — **Architectural**). Nada implementado.
> Data: 2026-10-13. Autor: Jarvis CRM. Base: documento "O papel do supervisor de
> vendas" (Marcello de Santi, 13/10/2026) + recon do código (ver §12).
> Aprovação conversacional do Luccas trava o ESCOPO abaixo; este arquivo precisa
> ser revisado por ele antes de virar plano de implementação (writing-plans).

## 1. Objetivo

Criar, numa **aba só para admins** do CRM, um **Supervisor Comercial** que:

1. **Mostra um painel** com os indicadores de **esforço/processo** (os que
   antecipam o resultado) e de resultado, calculados de forma **determinística**
   (SQL/código — fonte da verdade, auditável, nunca inventados por IA).
2. Tem um **chat** com visão ampla do sistema ("sabe de tudo") que, sobre esses
   números, **diagnostica o gargalo, escreve plano de ação** e responde perguntas.
3. Pelo chat, **propõe e executa alterações** no estado interno do CRM —
   **sempre com confirmação humana** (human-in-the-loop), reusando a mesma
   validação de quando um admin faz na mão, com log e reversibilidade.

O papel-alvo é o do doc: dono da execução comercial (demanda, funil, pessoas,
governança, análise), com o diagnóstico da SIXXIS já apontado (1ª resposta de
12-14h, perdas quase nunca registradas → conversão falsa de 99%, FollowUp 3 virou
depósito, sem revisão de atendimento).

## 2. Escopo travado (V1) e linhas vermelhas

### V1 entrega
- **Painel determinístico** (§4): indicadores com **meta + semáforo**.
- **Chat de diagnóstico/consulta** com IA (§5), leitura ampla.
- **Escrita Nível 1** via chat, **propõe-e-confirma** (§6): mover etapa,
  registrar ganho, registrar perda com motivo, criar lembrete, criar nota,
  reatribuir vendedor, arquivar negócio.

### Fase 2 (fora da V1, desenhado mas não construído agora)
- **Escrita Nível 2 (lote)** com teto por operação (ex.: "arquivar parados há
  +30d sem próximo passo").
- **Coaching**: IA lê conversas de atendimento e dá **nota com roteiro
  padronizado** (processa conteúdo de mensagem — mais custo/privacidade).
- **Relatórios agendados** (cron): resumo diário / revisão semanal empurrados.
- **Governança ativa**: forçar motivo na perda, alerta de "depósito".

### Linhas vermelhas (não-objetivos, fixos)
- **NUNCA manda mensagem a cliente** por este agente. Não existe ferramenta de
  envio no registry do supervisor (barreira estrutural, não só de prompt). Isso é
  a catraca de *mensagem a terceiro* (motivo da Sol/Luna estar dormente) e só
  mudaria por decisão direta e separada do Luccas.
- **Escrita Nível 3 (configuração)** — etapas, metas globais, tabelas de preço,
  cupons, papéis de usuário — **fora** do agente na V1. Admin faz na tela.
- **Nenhuma escrita silenciosa.** Toda mutação passa por confirmação na UI.
- `ConfigAgenteIA.ativo` **não é tocado** — este subsistema é independente da
  Sol/Luna de atendimento.
- Números **nunca** saem do LLM. O LLM recebe números já calculados e/ou usa
  ferramentas de leitura tipadas; ele narra, não aritmetiza.

## 2.1 Reuso do que já existe (descoberta no código — NÃO é greenfield)

O recon do código achou duas fundações que mudam o custo da entrega. A spec
**reusa**, não reconstrói.

**(a) Oracle — chat de gestão/BI já pronto** (`src/lib/oracle.ts`, `gerarRespostaOracle`;
UI `src/app/(app)/oracle/page.tsx`; API `src/app/api/oracle/chat/route.ts`):
- **19 ferramentas, já quase toda a camada de métricas determinística** que a §4
  pedia: `consultar_vendas`, `consultar_funil`, `consultar_desempenho_vendedores`,
  `consultar_metas`, `consultar_tempo_resposta`, `comparar_periodos`,
  `consultar_motivos_perda`, `consultar_atendimentos`, `analisar_padroes_atendimento`,
  + `diagnosticar_sistema` (admin-only, 9 checagens de integridade) — todas batem
  nas libs `metricas.ts`/`vendasPeriodo.ts`/etc. **O "diagnóstico" do doc do
  supervisor já tem base pronta aqui.** Registry `FERRAMENTAS` em `oracle.ts:1631`,
  dispatch `executarFerramenta` em `:1528`.
- **Barreira de mensagem a cliente já é um fato**: nenhuma das 19 ferramentas
  envia WhatsApp/SMS/e-mail. A única "de mensagem" (`criar_rascunho_campanha`,
  `:571`) cria `Campanha` em `RASCUNHO` e **nunca dispara** (`:630` "Você NUNCA
  dispara"; disparo é ação humana em `/campanhas`). Preservar.

**Três lacunas reais do Oracle (o que de fato falta):**
1. **Não é admin-only** — `obterAgente()` (qualquer papel) com escopo por-ferramenta
   (`oracle.ts:237` `escopoOracle`, `agenteId: self` pra não-admin). O Supervisor é
   **superfície admin-only separada** (não relaxar o Oracle).
2. **Bypassa `llmProvider.ts` e `orcamentoIA`** — fala direto com a Anthropic via
   `fetch` (`oracle.ts:2013`), modelo `claude-sonnet-4-6` (`ORACLE_MODEL`), **sem
   teto de gasto e sem logar custo** (não grava `SolEvento`). Pra rodar em
   Ollama/modelo barato sob o teto de $10, **isto precisa ser corrigido** (ver D4).
3. **Sem máquina preview→confirma pro LLM** e **sem auditoria/undo** das ações —
   as 2 escritas do Oracle (`criar_rascunho_campanha`, `salvar_guia_atendimento_sol`)
   executam na hora da tool-call, sem passo de confirmação.

**(b) Harness propõe→confirma→aplica já existe** (`src/lib/aplicarSync.ts` +
`src/app/api/interno/crm/{previa,aplicar}/route.ts`): `previa` classifica
campo-a-campo e **não escreve**; `aplicar` **recomputa no servidor** e só aplica os
campos marcados pelo humano (`aplicar/route.ts:41`), em `$transaction`
(`aplicarSync.ts:59`), idempotente, logado via `registrarAtividade` (`:182`). **É
exatamente o padrão da §6** — porém hoje só cobre dado de cadastro/endereço/NF/
rastreio (sync da Loja, auth `x-internal-key`, **não ligado ao LLM**) e
**exclui explicitamente etapa/ganho/perda/valor** (`aplicarSync.ts:4`). Serve de
**molde** pro harness do supervisor; não é reaproveitável direto.

**Conclusão de reuso:** a Camada 1 (métricas) é **majoritariamente montagem**
sobre as ferramentas do Oracle; o diagnóstico idem; o padrão de confirmação já
tem molde em `aplicarSync.ts`. O que é **construção real**: (i) superfície
admin-only + painel; (ii) ferramentas de **escrita Nível 1** (inexistentes); (iii)
a máquina preview→confirma ligada ao LLM + auditoria/undo; (iv) rota do LLM por
`llmProvider`+`orcamentoIA` (teto + log) — ver D4.

## 3. Arquitetura — 3 camadas

```
┌─────────────────────────────────────────────────────────────┐
│  UI  /admin/supervisor  (admin-only, obterAdmin + middleware)│
│  ┌─────────────┐   ┌───────────────────────────────────────┐ │
│  │  Painel      │   │  Chat do Supervisor                   │ │
│  │ (semáforo,   │   │  - mensagens                          │ │
│  │  funil,      │   │  - cards de AÇÃO PROPOSTA [Confirmar]  │ │
│  │  ranking)    │   │                                       │ │
│  └─────┬───────┘   └───────────────┬───────────────────────┘ │
└────────┼───────────────────────────┼─────────────────────────┘
         │ GET /api/admin/supervisor/painel   │ POST /api/admin/supervisor/chat
         │                                     │ POST /api/admin/supervisor/acao/confirmar
   ┌─────▼─────────────┐           ┌───────────▼──────────────────────────┐
   │ CAMADA 1          │           │ CAMADA 2 — IA                        │
   │ Motor de métricas │◄──────────│ provider-agnóstico (Ollama/nuvem)    │
   │ (determinístico)  │  leitura  │ - contexto = métricas calculadas     │
   │ reuso + lacunas   │           │ - ferramentas de LEITURA tipadas     │
   │                   │           │ - ferramentas de ESCRITA = PROPOSTA  │
   └───────────────────┘           │ - orçamento (verificarOrcamento)     │
                                    │ - fail-closed                        │
                                    └───────────┬──────────────────────────┘
                                                │ grava proposta
                                    ┌───────────▼──────────────────────────┐
                                    │ Harness de escrita (human-in-loop)   │
                                    │ SupervisorAcao: proposto→confirmado  │
                                    │ →executado | revertido  (log+undo)   │
                                    │ execução = MESMA lógica do admin      │
                                    └──────────────────────────────────────┘
```

## 4. Camada 1 — Motor de métricas (determinístico)

> Boa parte já está exposta como **ferramentas do Oracle** (§2.1) sobre estas
> mesmas libs. O painel e o contexto da IA consomem as libs direto (números
> auditáveis); a IA do chat pode chamar as ferramentas do Oracle como leitura.

**Reuso direto (não reimplementar):**
- `src/lib/metricas.ts` `calcularMetricas(periodo, {agenteId?, finalidade?})`:
  conversão (ganhos/finalizados), ticket médio, **tempo de 1ª resposta**
  (SQL avg(firstOUT−firstIN)), valor vendido `SUM(COALESCE(valorAjustado,valor))`,
  ganhos/perdidos. Por vendedor = chamar por `agenteId` (já é a fonte do ranking
  do admin).
- `src/lib/vendasPeriodo.ts` `whereVendaNoPeriodo` — faturamento por "houve ganho
  no período" (regra correta, sem conversão falsa). Usar via `comEscopo`.
- `src/lib/perdidos.ts` `analisarPerdidos(...)` → `{total, valorTotal, porMotivo[]}`
  (ganhos×perdas por motivo).
- `src/lib/slaAlertas.ts` — **negócio parado** por tempo na etapa (`entrouEtapaEm`
  vs `ConfigAlertaSla`).
- `src/lib/supervisao.ts` `contagemAtendimentos`/`listaAtendimentos` — trabalho de
  cada vendedor em ao-vivo/pendente/finalizado.

**Lacunas novas a construir (puras, testáveis por contrato):**
- `src/lib/supervisor/indicadores.ts`:
  - `pctDentroDoPrazo1aResposta(janela, limiarSeg)` — % de conversas cujo
    (first OUT − first IN) ≤ limiar. (O avg já existe; falta o %.)
  - `conversaoPorEtapa(janela, finalidade)` — contagem de negócios por etapa e
    taxa de passagem (entradas/saídas por etapa, ciclo médio na etapa).
  - `semProximoPasso(janela)` — negócios ABERTOS sem `Lembrete` futuro (via
    `Lembrete`/`alertas.ts`); hoje não existe essa métrica.
  - `coberturaFunil(janela, finalidade)` — Σ(valorEmAberto × peso) ÷ meta
    restante. Peso por `temperatura`: QUENTE 0.8 / MORNO 0.5 / FRIO 0.2
    (default configurável em `SupervisorConfig`; referência do doc: 3-4×).
  - `ganhosPerdasPorOrigem(janela)` — agrega por `Lead.origem`/`anuncioId`
    (dado existe no schema, falta rollup): receita e venda por campanha, não só
    lead ("origem para o marketing").
- Agregador `src/lib/supervisor/painel.ts` `montarPainel(janela)` → objeto único
  `PainelSupervisor` consumido pela UI e pelo contexto da IA (uma forma só).

**Metas/semáforo:** cada indicador tem meta e cor (verde/amarelo/vermelho).
Defaults iniciais vêm do doc (ex.: 1ª resposta dentro de prazo combinado,
cobertura 3-4×) e ficam em `SupervisorConfig` editável (ver §8 e Decisão D2).

## 5. Camada 2 — IA (provider-agnóstico, Ollama ou nuvem)

> Depende de **D4**. O texto abaixo assume o caminho recomendado D4(a): loop do
> supervisor roteado por `llmProvider`+`orcamentoIA`, **reusando as ferramentas de
> leitura do Oracle** (`oracle.ts` `FERRAMENTAS`/`executarFerramenta`) como
> biblioteca, sem tocar no chat Oracle existente.

**Provider:** reusa toda a abstração existente (`llmProvider.ts`,
`llmProviders/registro.ts`, `openaiCompativel.ts`). Adiciona um provider
`ollama` apontando pra endpoint OpenAI-compatível
(`http://<host>:11434/v1/chat/completions`, via `OLLAMA_BASE_URL`). **Nada no
`luna.ts` nem no `oracle.ts` muda** — o supervisor tem seu próprio resolvedor de
config (`SupervisorConfig.provider/modelo`), independente do atendimento e do
Oracle. (Corrigir o gap de orçamento do Oracle em si = D4(b), fora da V1.)

**Orçamento:** toda chamada paga passa por `verificarOrcamentoMensal(modelo)`
ANTES (mesma trava hard-stop da Luna). Eventos gravados em `SolEvento` com
`acao` `supervisor_chat` / `supervisor_diagnostico`.
- **Pegadinha a resolver:** `orcamentoIA.ts` **recusa modelo sem preço** (anti-
  bypass). Um modelo **local** (Ollama) não tem preço → seria recusado. Então
  registrar o modelo local em `custoIA.ts` com **preço 0** (local = grátis), pra
  a trava permitir e logar `custoEstimado = 0`. Modelo de nuvem usa o preço real
  já cadastrado (gemini flash-lite, etc.).

**Contexto da IA:** o `PainelSupervisor` (já calculado) entra como contexto
estruturado do turno. Para perguntas mais fundas, a IA tem **ferramentas de
leitura tipadas** (não SQL livre): `consultarMetricas(periodo,escopo)`,
`listarNegociosParados(etapa?,dias?)`, `listarAtendimentosVendedor(agenteId,...)`,
`detalharPerdas(periodo,origem?)`. Resultado numérico sempre vem da Camada 1.

**Chat com tool-use:** loop de tool-use (como a Luna já faz) com:
- saída estruturada (`response_format`/json_schema — infra já existe do fix do
  Gemini) para o envelope de decisão;
- **fail-closed**: sem envelope válido → resposta neutra, nunca ação;
- guard-rails de prompt: nunca inventa número (cita o indicador calculado);
  nunca fala com cliente; para QUALQUER escrita, **emite uma proposta**, não
  executa.

**Prompt de sistema (resumo do contrato):** persona = supervisor comercial do
doc; obrigações = usar só números fornecidos; linguagem de diagnóstico + plano de
ação acionável (gargalo, responsável, próximo passo); proibições = inventar
métrica, mandar mensagem a cliente, executar escrita direto.

## 6. Harness de escrita — human-in-the-loop (o ponto sensível)

**Princípio:** a IA **nunca** escreve direto. Ela **propõe** uma ação tipada; o
servidor só executa após o admin **Confirmar** na UI. **Molde já existente a
copiar:** `src/lib/aplicarSync.ts` (prévia não-escreve → aplicar recomputa no
servidor → `$transaction` idempotente → log) — mesmo formato, outro conjunto de
mutações (funil em vez de cadastro/NF).

**Contrato de ferramenta de escrita** (`src/lib/supervisor/acoes/tipos.ts`):
```
FerramentaEscrita = {
  nome: string,                 // ex. "mover_etapa"
  schema: ZodSchema,            // args validados
  preview(args): string,        // frase humana exata do que vai acontecer
  validar(args, admin): Resultado,  // mesma validação do caminho manual
  executar(args, admin): { ok, antes, depois },  // reusa a lógica existente
  reverter(registro): void      // desfaz usando o snapshot "antes"
}
```

**Fluxo:**
1. IA no chat decide uma ação → devolve `{ tipo:"proposta", ferramenta, args }`.
2. Servidor valida args (schema) + `validar(args, admin)` (permissão/consistência)
   e grava `SupervisorAcao` status `PROPOSTO` com `preview`. **Não executa.**
3. UI renderiza um **card**: texto do `preview` + [Confirmar] / [Descartar].
4. Admin confirma → `POST /api/admin/supervisor/acao/confirmar` (gate
   `obterAdmin()`), re-valida, chama `executar` (que reusa a MESMA função/endpoint
   do fluxo manual — zero caminho novo de mutação), grava `antes/depois`, status
   `EXECUTADO`, e registra em `HistoricoNegocio`/`Atividade` como já acontece.
5. **Reversível:** o snapshot `antes` permite `reverter` (botão desfazer) para as
   ações de registro único do Nível 1.
6. **Idempotência:** `SupervisorAcao.id` + token; confirmar duas vezes não
   re-executa.

**Ferramentas Nível 1 (V1)** — cada uma embrulha a lógica existente:
- `mover_etapa(negocioId, etapaId)` → endpoint/lib de mover do Kanban.
- `registrar_ganho(negocioId, valor?, tipoGanho?)` → fluxo de ganho existente.
- `registrar_perda(negocioId, motivoCode, obs?)` → fluxo de perda + `motivosPerda`.
- `criar_lembrete(negocioId|leadId, quando, texto)` → `Lembrete`.
- `criar_nota(negocioId|leadId, texto)` → nota existente.
- `reatribuir_vendedor(leadId|negocioId, agenteId)` → reatribuição (respeita
  regra de dono venda/pós-venda).
- `arquivar_negocio(negocioId, motivo)` → arquivamento existente.

Nenhuma dessas é destrutiva irreversível; nenhuma fala com cliente.

## 7. Camada 3 — UI

- Nova entrada **top-level** admin (peer do Painel), via `AdminNav` `SEM_SUBNAV`
  + `src/app/(app)/admin/supervisor/page.tsx`, gate automático por middleware +
  `obterAdmin()` na API.
- **Painel** (`src/components/supervisor/PainelSupervisor.tsx`): cartões de
  indicador com semáforo, bloco de funil por etapa (parados destacados),
  ganhos×perdas por motivo/origem, ranking por vendedor, seletor de período e
  finalidade (reusa `janelaDeParams`).
- **Chat** (`src/components/supervisor/ChatSupervisor.tsx`): thread + render de
  **card de ação proposta** com [Confirmar]/[Descartar]; estado otimista só após
  confirmação do servidor.
- Tokens visuais do CRM já existentes (tiffany, Inter, lucide) — sem nova marca.

## 8. Dados / schema (ADITIVO — sem DROP/TEMP)

- `SupervisorConfig` (singleton): `provider`, `modelo`, limiares/metas
  (JSON: prazo1aRespostaSeg, pesosCobertura, metasPorIndicador), `atualizadoEm`.
- `SupervisorAcao` (auditoria + undo): `id`, `adminId`, `ferramenta`, `argsJson`,
  `preview`, `status (PROPOSTO|EXECUTADO|DESCARTADO|REVERTIDO|FALHOU)`,
  `antesJson?`, `depoisJson?`, `negocioId?`, `leadId?`, `criadoEm`, `executadoEm?`.
- Migração **aditiva** (nova tabela + enum), validada contra o schema real por
  transação com ROLLBACK antes de considerar pronta (técnica já usada aqui).
- **SolEvento** reusado para custo da IA (acao `supervisor_*`). Sem coluna nova.

## 9. Segurança / LGPD

- **Acesso:** admin-only em 2 camadas (middleware por path `/admin/*`+`/api/admin/*`
  + `obterAdmin()` na rota). Admin já enxerga tudo — leitura ampla não cria
  exposição nova.
- **Dado fora da máquina:** com provider **local (Ollama)**, nada sai. Com
  provider **nuvem**, o que vai no prompt são majoritariamente **números
  agregados** (baixo PII) no painel/diagnóstico; o chat pode citar nomes de
  vendedor/cliente — por isso o default recomendado é **local** quando houver host
  alcançável, e o uso de nuvem fica sob o teto + decisão D1. Coaching (ler
  conversa, Fase 2) é o caso de maior PII — fica explicitamente para depois e,
  quando vier, de preferência no modelo local.
- **Escrita:** nunca silenciosa; sempre `obterAdmin` + confirmação + log +
  reversível. Caminho de mutação = o mesmo do admin manual (herda todas as travas
  já existentes).

## 10. Confiabilidade com modelo fraco (local)

- Números **determinísticos** (Camada 1) — o LLM não calcula.
- **Saída estruturada** (json_schema) + **fail-closed** (sem envelope → sem ação).
- **Confirmação humana** = uma tool-call errada do modelo **não** chega a
  executar sem o admin ver o `preview` exato e clicar.
- Teto de orçamento hard-stop antes de qualquer chamada paga.

## 11. Testes e gates

- **Contratos puros** (`scripts/contratos/`), sem rede/banco:
  - métricas novas (`pctDentroDoPrazo`, `conversaoPorEtapa`, `semProximoPasso`,
    `coberturaFunil`, `ganhosPerdasPorOrigem`) com fixtures;
  - `preview`/`validar` de cada ferramenta de escrita (frase exata + rejeição de
    args inválidos);
  - envelope da IA: proposta só com schema válido; fail-closed sem envelope;
  - orçamento: bloqueia modelo sem preço, libera local preço-0, hard-stop no teto.
- **Isolamento:** teste garantindo que **não existe** ferramenta de envio a
  cliente no registry do supervisor (grep de contrato).
- **Migração:** validada por transação ROLLBACK contra schema real.
- Gates do hook desta branch: `tsc --noEmit` + `next build` (sem `npm run lint`
  nesta branch). Tudo verde antes de qualquer commit.

## 12. Impacto — arquivo por arquivo

**Novos:**
- `src/lib/supervisor/indicadores.ts`, `painel.ts`, `tipos.ts` (indicadores novos
  da §4 que o Oracle ainda não expõe: `pctDentroDoPrazo`, `semProximoPasso`,
  `coberturaFunil`, `conversaoPorEtapa`, `ganhosPerdasPorOrigem`)
- `src/lib/supervisor/acoes/{tipos.ts,registro.ts, mover_etapa.ts, ...}` (molde:
  `aplicarSync.ts`)
- `src/lib/supervisor/ia.ts` (contexto + loop + guard-rails; reusa `llmProvider`+
  `orcamentoIA` e importa as ferramentas de leitura do Oracle — D4(a))
- `src/app/api/admin/supervisor/painel/route.ts`
- `src/app/api/admin/supervisor/chat/route.ts`
- `src/app/api/admin/supervisor/acao/confirmar/route.ts`
- `src/app/(app)/admin/supervisor/page.tsx`
- `src/components/supervisor/{PainelSupervisor,ChatSupervisor,CardAcao}.tsx`
- `scripts/contratos/c5-*..cN-*.ts`
- `prisma/migrations/<ts>_supervisor/…`

**Alterados (aditivo):**
- `src/lib/llmProviders/registro.ts` (+provider `ollama`)
- `src/lib/custoIA.ts` (+modelo local preço 0; +modelo nuvem se faltar)
- `src/components/admin/AdminNav.tsx` (+entrada top-level `SEM_SUBNAV`)
- `prisma/schema.prisma` (+`SupervisorConfig`, +`SupervisorAcao`, +enum status)

**Intocado:** Kanban, Inbox, `luna.ts`, **`oracle.ts` e o chat Oracle existente**
(D4(a)), `ConfigAgenteIA`, Evolution/Cloud/envio, qualquer caminho de mensagem a
cliente. (As ferramentas de leitura do Oracle são **importadas**, não alteradas.)

## 13. Decisões abertas (travam o início do código)

- **D1 — Onde roda o modelo (infra real):** o CRM roda na **Railway (nuvem)**;
  um Ollama em `localhost` da sua máquina **não** é alcançável pela app em
  produção. Opções: (a) **nuvem barata** (gemini flash-lite) sob o teto de $10 —
  funciona hoje, zero infra, mas dado vai ao Google; (b) **Ollama self-hosted**
  num host alcançável (`OLLAMA_BASE_URL`) — grátis e on-prem, exige subir esse
  host; (c) **híbrido** (local quando disponível, nuvem como fallback). O desenho
  é provider-agnóstico de propósito. *Recomendo começar por (a) pra entregar já,
  e migrar pra (b) quando você tiver o host do Ollama.* Qual você quer?
- **D2 — Metas iniciais do semáforo:** eu semeio defaults do doc (ex.: prazo de
  1ª resposta, cobertura 3-4×, pesos de temperatura 0.8/0.5/0.2) e você ajusta na
  tela depois? *Recomendo sim.*
- **D3 — Reatribuir vendedor no Nível 1:** mantém (é reversível e útil) ou tira
  da V1 por ser mudança de responsabilidade? *Recomendo manter, com log.*
- **D4 — Motor de IA: estender o Oracle ou motor próprio?** O Oracle já tem as 19
  ferramentas de leitura, mas fala direto com a Anthropic (sem teto/sem log). Três
  caminhos:
  - **(a) Supervisor reusa o ENGINE do Oracle como biblioteca de ferramentas de
    leitura, mas com loop próprio roteado por `llmProvider`+`orcamentoIA`**
    (teto + `SolEvento`), e adiciona as ferramentas de escrita admin-only. Oracle
    fica intocado (segue servindo o chat geral de todo papel). *Recomendo esta —
    entrega o supervisor sem desestabilizar o Oracle; a duplicação é só do loop,
    as ferramentas de leitura são compartilhadas.*
  - **(b) Migrar o Oracle inteiro pra `llmProvider`+`orcamentoIA`** e construir o
    supervisor em cima — mais limpo a longo prazo (um motor só, orçado), porém
    mexe num recurso em produção que hoje funciona (risco/custo maior, vira
    trabalho à parte).
  - **(c) Motor 100% novo** ignorando o Oracle — mais caro, reimplementa 19
    ferramentas. *Não recomendo.*
  Qual caminho?

## 14. Fora de escopo (reafirmando)

Coaching automático, relatórios agendados por cron, escrita em lote (Nível 2),
configuração do sistema (Nível 3) e qualquer envio a cliente. Tudo isso é Fase 2+
e entra em spec/plano próprios.
