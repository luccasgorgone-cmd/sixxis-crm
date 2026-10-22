# Métrica por Presença — tempo de 1ª resposta = tempo ONLINE do dono (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Redefinir o **tempo médio de 1ª resposta** (`tempoPrimeiraRespostaSeg`) para contar só o tempo em que o **vendedor dono da conversa esteve ONLINE** entre o 1º contato do cliente (1º IN) e a 1ª resposta (1º OUT) — períodos offline não contam. Com **fallback para o delta cru (wall-clock) quando não há dado de presença** cobrindo a janela, pra métrica nunca regredir no passado.

**Architecture:** O `AVG(EXTRACT(EPOCH FROM (fo-fi)))` cru em `src/lib/metricas.ts` (linhas ~231-243) vira: (1) busca-de-linhas por conversa (`id, agenteId, fi, fo`) com os MESMOS filtros de janela/escopo (`condConversa`); (2) busca dos `PresencaPeriodo` dos donos envolvidos que cruzam `[min(fi), max(fo)]`; (3) cálculo em JS por uma função PURA nova reusando `segundosOnlineEntre` (já testado, c10). Os consumidores (`painel.ts`, `dashboard`, `metas.ts`, `colaboradores`) só leem o campo `tempoPrimeiraRespostaSeg` — **shape inalterado, só o número muda**.

**Tech Stack:** Next.js 16, Prisma 7 (PostgreSQL), TypeScript. Zero schema novo (a tabela `PresencaPeriodo` já existe em prod desde `e838a29`).

**Spec:** `docs/DESIGN_PRESENCA_ONLINE_ROTEAMENTO.md` (seção "Métrica por presença").

## Global Constraints

- **Zero migration** (nada de schema — só leitura de `PresencaPeriodo`/`Conversa`/`Mensagem`).
- **Exata daqui pra frente**; passado sem presença = fallback delta cru (nunca regride).
- **Alerta "parado" fica wall-clock** (tempo real) — NÃO usa esta métrica; só o número EXIBIDO de 1ª resposta usa tempo-online. Verificar que o alerta não lê `tempoPrimeiraRespostaSeg`.
- Branch `wip`; deploy/migration = catraca (só com "pode subir" do Luccas).

## Regra de fallback (sem placeholder)

Por conversa, dono = `Conversa.agenteId`:
- **Se o dono tem ≥1 `PresencaPeriodo` que cruza `[fi, fo)`** → usa `segundosOnlineEntre(periodosDoDono, fi, fo)` (interseção online; pode dar 0 se estava offline naquele exato intervalo — é o comportamento desejado, "offline não conta").
- **Se o dono NÃO tem nenhum período cruzando `[fi, fo)`** (passado não rastreado, ou dono null) → fallback = `(fo - fi)` em segundos (wall-clock, igual a hoje).

Média = soma dos segundos resolvidos / nº de conversas com `fi`/`fo` válidos (`fo > fi`), igual ao denominador de hoje.

## Review Focus

- Conversa com dono null → fallback wall-clock (não quebra) → teste.
- Dono online o tempo todo em `[fi,fo]` → online == wall-clock → teste.
- Dono offline o intervalo todo (mas com presença rastreada no range) → 0, NÃO fallback → teste.
- Dono parcialmente online → só a interseção → teste.
- Janela toda no passado sem presença → fallback wall-clock, média == comportamento atual → teste.
- Denominador idêntico ao de hoje (conversas com fi/fo válidos), não muda contagem.

---

### Task 1: Função pura `mediaPrimeiraRespostaOnline` + contrato c11 (TDD)

**Files:**
- Create: `src/lib/presenca/primeiraResposta.ts`
- Test: `scripts/contratos/c11-primeira-resposta-online.ts`

**Interfaces:**
- Produces: `type ConversaResp = { agenteId: string | null; fi: Date; fo: Date }`; `function mediaPrimeiraRespostaOnline(conversas: ConversaResp[], periodosPorAgente: Map<string, PeriodoOnline[]>): number` — para cada conversa aplica a regra de fallback acima (reusa `segundosOnlineEntre`); retorna média arredondada em segundos (0 se vazio). PURA, determinística.

- [ ] **Step 1:** Escrever `c11` (molde c10: tsx + node:assert) cobrindo os 6 casos do Review Focus.
- [ ] **Step 2:** `npx tsx scripts/contratos/c11-primeira-resposta-online.ts` → FALHA (módulo ausente).
- [ ] **Step 3:** Implementar `mediaPrimeiraRespostaOnline` reusando `segundosOnlineEntre`.
- [ ] **Step 4:** `npx tsx scripts/contratos/c11-primeira-resposta-online.ts` → todos ok.
- [ ] **Step 5:** Commit `feat(metrica): mediaPrimeiraRespostaOnline pura + contrato c11`.

### Task 2: Ligar em `metricas.ts` (substituir o AVG cru)

**Files:**
- Modify: `src/lib/metricas.ts` (bloco linhas ~231-243 + montagem de `tempoPrimeiraRespostaSeg` ~277)

**Interfaces:**
- Consumes: `mediaPrimeiraRespostaOnline` (Task 1); `prisma`.

- [ ] **Step 1:** Trocar o `$queryRaw` do AVG por um `$queryRaw` que devolve por conversa `{ agenteId, fi, fo }` (reaproveitar o subselect `MIN(...) FILTER (...)` já existente + `c."agenteId"`), mesmos filtros `condConversa(e)` e janela.
- [ ] **Step 2:** Buscar `PresencaPeriodo` dos `agenteId` distintos (não-null) que cruzam `[min(fi), max(fo)]`; montar `Map<agenteId, PeriodoOnline[]>`. Se não houver conversa nenhuma, pular a query (Map vazio).
- [ ] **Step 3:** `tempoPrimeiraRespostaSeg = mediaPrimeiraRespostaOnline(linhas, mapa)`.
- [ ] **Step 4: Gate** tsc 0 + build 0 + c10 ok + c11 ok.
- [ ] **Step 5:** Commit `feat(metrica): 1a resposta = tempo online do dono (fallback wall-clock)`.

### Task 3: Verificar invariantes dos consumidores + alerta "parado"

- [ ] **Step 1:** Confirmar por grep que `painel.ts`/`dashboard`/`metas.ts`/`colaboradores` só leem `tempoPrimeiraRespostaSeg` (campo inalterado) — nenhuma mudança de shape.
- [ ] **Step 2:** Confirmar que o alerta/varredura "parado" calcula por wall-clock próprio e NÃO lê `tempoPrimeiraRespostaSeg` (senão passaria a atrasar por tempo-online — anti-meta). Se ler, isolar.
- [ ] **Step 3:** Prova de equivalência do fallback contra prod (read-only, script descartável, SEM escrita): rodar `calcularMetricas` numa janela antiga (toda antes de `e838a29`) e conferir que o número bate com o AVG cru (fallback total).
- [ ] **Step 4: Gate** tsc 0 + build 0 + c10 + c11.

## Fora deste plano (fases seguintes)

- Socket autenticado estrito (F7.0) — presença à prova de falsificação.
- Roteamento só-pra-online (`roteamento.ts`, maior risco).
- UX: tooltip "tempo online" na UI (detalhe de apresentação).

## Gate

Build na `wip`. Deploy/migration = catraca (só com "pode subir"). Esta fase é ZERO migration — deploy quando o Luccas autorizar.
