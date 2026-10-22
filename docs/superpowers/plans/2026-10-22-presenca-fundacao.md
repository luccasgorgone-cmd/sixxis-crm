# Presença Online — Fundação (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Base do subsistema de presença online/offline do vendedor — estado, períodos persistidos, tempo-online puro, toggle no header e auto-offline por inatividade — sem ainda mexer em métrica/roteamento (fases seguintes).

**Architecture:** Estado NOVO `Agente.online` (separado de `ativo`-da-conta) + tabela `PresencaPeriodo` (início/fim por sessão online) para a métrica somar tempo. Função pura `segundosOnlineEntre`. Toggle no header + heartbeat + modal de inatividade (15min→1min→auto-offline). Socket autenticado (F7.0) para presença confiável.

**Tech Stack:** Next.js 16, Prisma 7 (PostgreSQL), Socket.io, React.

**Spec:** `docs/DESIGN_PRESENCA_ONLINE_ROTEAMENTO.md`

## Global Constraints

- Presença é estado NOVO, separado de `Agente.ativo` (conta). Roteamento futuro exige `ativo && online` (fase 4, fora deste plano).
- Migration **aditiva** (sem DROP/TEMP); provar contra schema de produção com transação ROLLBACK antes de pronto.
- Branch `wip`; deploy/migration = catraca (só com "pode subir" do Luccas).
- Exata/forward-looking: a métrica só fica precisa daqui pra frente (presença é ao vivo).

## Review Focus

- Período ainda ABERTO (fim=null, vendedor online agora): `segundosOnlineEntre` conta até `ate`, não quebra → teste Task 1.
- Períodos sobrepostos/ fora da janela: interseção correta, zero quando não cruza → teste Task 1.
- Toggle→offline fecha o período aberto (grava fim); toggle→online abre novo → teste Task 2 (lib de presença).
- Auto-offline por inatividade não deve duplicar fechamento se já offline (idempotente) → teste Task 2.

---

### Task 1: Função pura `segundosOnlineEntre` + contrato c10

**Files:**
- Create: `src/lib/presenca/tempoOnline.ts`
- Test: `scripts/contratos/c10-tempo-online.ts`

**Interfaces:**
- Produces: `type PeriodoOnline = { inicio: Date; fim: Date | null }`; `function segundosOnlineEntre(periodos: PeriodoOnline[], de: Date, ate: Date): number` — soma a interseção de cada período com `[de, ate]`; `fim=null` trata como `ate` (ainda online). Determinística, pura.

- [ ] **Step 1:** Escrever `scripts/contratos/c10-tempo-online.ts` (molde c9: tsx+node:assert) — casos: vazio→0; 1 período dentro→duração; período que cruza só parte da janela→interseção; período fora→0; `fim=null`→conta até `ate`; dois períodos somam.
- [ ] **Step 2:** `npx tsx scripts/contratos/c10-tempo-online.ts` → FALHA (módulo ausente).
- [ ] **Step 3:** Implementar `segundosOnlineEntre` em `src/lib/presenca/tempoOnline.ts`.
- [ ] **Step 4:** `npx tsx scripts/contratos/c10-tempo-online.ts` → todos ok.
- [ ] **Step 5:** Commit `feat(presenca): segundosOnlineEntre puro + contrato c10`.

### Task 2: Schema + lib de presença (abrir/fechar período, set online)

**Files:**
- Modify: `prisma/schema.prisma` (+ `Agente.online Boolean @default(false)`; nova model `PresencaPeriodo { id, agenteId, inicioEm, fimEm DateTime?, @@index([agenteId, inicioEm]) }`)
- Create: `prisma/migrations/<ts>_presenca/migration.sql` (aditiva)
- Create: `src/lib/presenca/presenca.ts`

**Interfaces:**
- Produces: `async function ficarOnline(agenteId)` (idempotente: se já online, no-op; senão `online=true` + abre PresencaPeriodo); `async function ficarOffline(agenteId)` (idempotente: fecha período aberto com `fimEm=now`, `online=false`); `async function estadoPresenca(agenteId): {online: boolean}`.

- [ ] **Step 1:** Editar schema; `prisma migrate dev --create-only` para gerar a migration; revisar SQL = só `ALTER TABLE ADD COLUMN` + `CREATE TABLE`/índice (sem DROP/TEMP).
- [ ] **Step 2:** Implementar `presenca.ts` (idempotência via checar `online`/período aberto).
- [ ] **Step 3:** Provar a migration válida contra o schema de produção com transação ROLLBACK (script descartável, não commitar).
- [ ] **Step 4: Gate** tsc 0 + build 0 + c10 ok.
- [ ] **Step 5:** Commit `feat(presenca): schema Agente.online + PresencaPeriodo + lib (migration aditiva)`.

### Task 3: API de presença própria + heartbeat

**Files:**
- Create: `src/app/api/me/presenca/route.ts` (GET estado; POST {online:boolean} → ficar On/Off; POST heartbeat para renovar atividade)

**Interfaces:**
- Consumes: `presenca.ts` (Task 2); `obterAgente` de `@/lib/autorizacao`.

- [ ] **Step 1:** GET → `estadoPresenca(agente.id)`; POST alterna online/offline do PRÓPRIO agente; endpoint de heartbeat marca últimaAtividade (em memória/served por socket; detalhe builder).
- [ ] **Step 2: Gate** tsc 0 + build 0 (rota registrada).
- [ ] **Step 3:** Commit `feat(presenca): rota /api/me/presenca (estado + toggle + heartbeat)`.

### Task 4: Toggle no header + modal de inatividade

**Files:**
- Create: `src/components/presenca/TogglePresenca.tsx`, `src/components/presenca/ModalInatividade.tsx`
- Modify: o header admin/app (ao lado dos ícones de dark mode / notificação / alerta)

**Interfaces:**
- Consumes: `/api/me/presenca`. Timer de inatividade: 15min sem atividade → modal com countdown de 1min → sem resposta → POST offline.

- [ ] **Step 1:** Toggle verde/cinza clicável no header (localizar o componente de header e os ícones existentes).
- [ ] **Step 2:** Modal global de inatividade (listener de atividade: mousemove/keydown/click; 15min → abre; 1min countdown → auto-offline).
- [ ] **Step 3: Gate** tsc 0 + build 0.
- [ ] **Step 4:** Commit `feat(presenca): toggle no header + modal de inatividade (15min/1min/auto-offline)`.

## Fora deste plano (fases seguintes, planos próprios)

- Socket autenticado estrito (F7.0) para presença à prova de falsificação.
- Métrica por tempo-online (`segundosOnlineEntre` aplicado em metricas/indicadores/painel, sistema todo).
- Roteamento só-pra-online (rodízio um-pra-cada; cliente com dono espera o dono).

## Gate

Build na `wip`. Migration/deploy = catraca (só com "pode subir").
