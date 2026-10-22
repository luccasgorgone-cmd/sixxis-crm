# Captação Ativa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova aba admin-only "Captação Ativa" no Supervisor que mede prospecção ativa por vendedor (clientes cadastrados manualmente) por período, com conversão e R$ por coorte.

**Architecture:** Lib pura de agregação + função de query (Prisma) → rota `GET /api/admin/supervisor/captacao` (gate `obterAdmin`) → aba React `PainelCaptacao` fiada no `SupervisorConsole`. Sem mudança de schema (reusa `Lead.origem="manual"`, `Lead.criadoEm`, `donoId`/`donoPosVendaId`, `Atividade(CRIACAO)`, `HistoricoNegocio`). Testes no idiom `scripts/contratos/*` (tsx + node:assert, puros).

**Tech Stack:** Next.js 16 (App Router), Prisma 7 (PostgreSQL), React + recharts, tokens `var(--color-*)`.

**Spec:** `docs/DESIGN_CAPTACAO_ATIVA.md`

## Global Constraints

- Admin-only: toda rota sob `/api/admin/*` usa `obterAdmin()` (401/403 se não).
- Captação = `Lead.origem === "manual"` com `criadoEm` na janela. `origem="manual"` é gravado só por `POST /api/leads` (verificado). Revínculo (`Atividade.ATRIBUICAO`) NÃO conta.
- "Cadastrado por" = `Atividade(tipo=CRIACAO)` com `agenteId` **não-nulo** (ingestões anúncio/google-ads também criam CRIACAO, mas sem `agenteId`).
- Dono por finalidade: `donoId` (VENDA) / `donoPosVendaId` (POS_VENDA); a aba honra o filtro Venda/Pós-venda/Tudo do console.
- Conversão/R$ por **coorte**: dos captados na janela, seguir os negócios **pra frente sem filtro de data de fechamento**; GANHO = conversão; R$ = `valorEfetivo = valorAjustado ?? valor` (atenção ao `valorAjustado=0` pendurado).
- Dia do agrupamento em `America/Sao_Paulo`, consistente com `resolverPeriodo`.
- Deploy para `main` (Railway) = catraca; este plano é só branch `wip/*`.

## Review Focus

- **Janela sem captações** (período em que ninguém cadastrou manual): KPIs = 0, ranking/série vazios, sem divisão por zero na taxa de conversão → pinado no teste de `agregarCaptacao` (Task 1).
- **Captado com `donoId` e `donoPosVendaId` nulos** (lead manual sem dono por algum motivo): não quebrar o agrupamento; cair num bucket "(sem vendedor)" → teste em Task 1.
- **Lead manual com negócio sem HistoricoNegocio de GANHO** (captado mas nunca ganho): conversão conta 0, R$ 0, não null → teste em Task 1.
- **Período anterior vazio** (nada antes da janela): delta ▲/▼ não divide por zero (mostra "—" ou +100% definido) → teste em Task 1.
- **Lead manual que depois recebeu CTWA/Google** (dois `Atividade.CRIACAO`, só um com `agenteId`): "cadastrado por" pega o de `agenteId` não-nulo → teste em Task 2 (query) com dado montado.

---

### Task 1: Lib pura de agregação + tipos + contrato c9

**Files:**
- Create: `src/lib/supervisor/captacao.ts`
- Test: `scripts/contratos/c9-captacao.ts`

**Interfaces:**
- Produces:
  - `type LinhaCaptacao = { leadId: string; nome: string | null; telefone: string; donoId: string | null; donoNome: string | null; cadastradoPorId: string | null; cadastradoPorNome: string | null; criadoEm: Date; etapaAtual: string | null; status: "ABERTO" | "GANHO" | "PERDIDO" | null; valorGanho: number | null }`
  - `type RankingVendedorCaptacao = { agenteId: string | null; nome: string | null; captados: number; convertidos: number; conversao: number; valorGerado: number }`
  - `type PontoSerie = { data: string; captados: number }` (data = `YYYY-MM-DD` em SP)
  - `type ResultadoCaptacao = { total: number; vendedoresQueCaptaram: number; convertidos: number; conversao: number; valorGerado: number; delta: { total: number | null; conversao: number | null; valorGerado: number | null }; ranking: RankingVendedorCaptacao[]; serie: PontoSerie[]; linhas: LinhaCaptacao[] }`
  - `function agregarCaptacao(linhas: LinhaCaptacao[], totalAnterior: { total: number; conversao: number; valorGerado: number }, fuso?: string): ResultadoCaptacao`

- [ ] **Step 1: Escrever os casos de contrato (falhando)** em `scripts/contratos/c9-captacao.ts`, no molde de `c8-gclid.ts` (tsx + node:assert, `caso(nome, fn)`, contador ok/falhou, exit 1 se falhou). Casos, com valores explícitos:
  - vazio → `total=0`, `conversao=0`, `valorGerado=0`, `ranking=[]`, `serie=[]`, sem throw.
  - 3 captados de 2 vendedores, 1 convertido (GANHO R$1000) → `total=3`, `vendedoresQueCaptaram=2`, `convertidos=1`, `conversao≈0.333`, `valorGerado=1000`.
  - captado com `donoId=null,donoPosVendaId=null` → entra em ranking bucket `agenteId=null` nome "(sem vendedor)".
  - captado sem GANHO → não soma em `convertidos`/`valorGerado`.
  - `totalAnterior` zerado → `delta.conversao=null` (sem divisão por zero); `totalAnterior` não-zero → delta numérico correto.
  - série agrupa por dia SP: dois captados no mesmo dia SP somam no mesmo `PontoSerie`.
- [ ] **Step 2: Rodar e ver falhar** — `npx tsx scripts/contratos/c9-captacao.ts` → FALHA ("agregarCaptacao is not a function").
- [ ] **Step 3: Implementar `agregarCaptacao` + tipos** em `src/lib/supervisor/captacao.ts`. Agrupamento de ranking por dono (coalesce donoId/donoPosVenda já resolvido na linha), série por dia SP (via `Intl.DateTimeFormat` com `timeZone`), deltas com guarda de zero (retorna `null` quando o anterior é 0).
- [ ] **Step 4: Rodar e ver passar** — `npx tsx scripts/contratos/c9-captacao.ts` → todos ok.
- [ ] **Step 5: Commit** — `git add src/lib/supervisor/captacao.ts scripts/contratos/c9-captacao.ts && git commit -m "feat(captacao): agregador puro + contrato c9"`

### Task 2: Query `coletarCaptacao` (Prisma)

**Files:**
- Modify: `src/lib/supervisor/captacao.ts`

**Interfaces:**
- Consumes: `agregarCaptacao`, tipos da Task 1; `resolverPeriodo` de `src/lib/metricas.ts`.
- Produces: `async function coletarCaptacao(args: { janela: { inicio: Date; fim: Date }; finalidade: Finalidade | null; agenteId?: string | null }): Promise<ResultadoCaptacao>`

- [ ] **Step 1:** Implementar `coletarCaptacao`: busca `Lead` `where origem="manual"`, `criadoEm` em `[inicio, fim)`, dono por finalidade (`donoId`/`donoPosVendaId` conforme `finalidade`; ambos quando "Tudo"), opcional `agenteId` (drilldown). Inclui o `Atividade(CRIACAO)` com `agenteId` não-nulo (para "cadastrado por") e os `Negocio` do lead com `HistoricoNegocio` de GANHO (coorte, sem filtro de data de fechamento) para derivar `status`/`etapaAtual`/`valorGanho` (valorEfetivo). Monta `LinhaCaptacao[]`, calcula a janela anterior de mesma duração (só os 3 números do `totalAnterior`, consulta enxuta), e chama `agregarCaptacao`.
- [ ] **Step 2:** Verificação manual contra o schema real **sem escrever** (transação com ROLLBACK, DB público, script descartável) — confirma que o `where`/joins casam com o schema e que "cadastrado por" pega o CRIACAO certo quando há dois. Registrar o resultado; apagar o script.
- [ ] **Step 3: Gate** — `npx tsc --noEmit` → 0.
- [ ] **Step 4: Commit** — `git add src/lib/supervisor/captacao.ts && git commit -m "feat(captacao): query coletarCaptacao (coorte, dono por finalidade)"`

### Task 3: Rota admin `GET /api/admin/supervisor/captacao`

**Files:**
- Create: `src/app/api/admin/supervisor/captacao/route.ts`

**Interfaces:**
- Consumes: `coletarCaptacao` (Task 2); `obterAdmin` de `@/lib/autorizacao`; `resolverPeriodo` de `@/lib/metricas`.
- Produces: resposta JSON `ResultadoCaptacao` (datas serializadas ISO).

- [ ] **Step 1:** Implementar `GET`: `obterAdmin()` → 401 se ausente; ler query `periodo`/`inicio`/`fim`, `finalidade`, `agenteId` no mesmo padrão das rotas `/api/admin/supervisor/painel`; chamar `coletarCaptacao`; `NextResponse.json`.
- [ ] **Step 2: Gate** — `npx tsc --noEmit` → 0; `npm run build` (ou `next build`) → 0 (rota registrada).
- [ ] **Step 3: Commit** — `git add src/app/api/admin/supervisor/captacao/route.ts && git commit -m "feat(captacao): rota admin GET /captacao"`

### Task 4: Aba `PainelCaptacao` + fiar no `SupervisorConsole`

**Files:**
- Create: `src/components/supervisor/PainelCaptacao.tsx`
- Modify: `src/components/supervisor/SupervisorConsole.tsx` (tipo `Aba`, `ABAS`, render)

**Interfaces:**
- Consumes: a rota da Task 3; o filtro de período/finalidade do console (mesmo padrão de `PainelRelatorios`).

- [ ] **Step 1:** `PainelCaptacao.tsx`: busca a rota (período/finalidade/agenteId do console), renderiza KPIs (total, conversão, R$, com ▲/▼), ranking com barra proporcional + clique = drilldown (set `agenteId`), gráfico de tendência (recharts, cores `var(--color-*)`), e a lista detalhada (nome, telefone, vendedor, **cadastrado por**, data, etapa, valor) com busca + paginação. Deep-link "Abrir conversa" (`/inbox?lead=`) por linha.
- [ ] **Step 2:** Em `SupervisorConsole.tsx`: adicionar `"captacao"` ao tipo `Aba`, uma entrada em `ABAS` (rótulo "Captação Ativa", ícone lucide, ex. `UserPlus`), incluir no `mostraFiltros` (lê período/finalidade), e renderizar `<PainelCaptacao .../>`.
- [ ] **Step 3: Gate** — `npx tsc --noEmit` → 0; `next build` → 0; `npx tsx scripts/contratos/c9-captacao.ts` → ok.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(captacao): aba PainelCaptacao no Supervisor"`

---

## Notas de execução

- Working tree deve estar limpo antes (branch `wip/atendimento-omnichannel-provider-abstract`).
- Nenhuma migration nesta feature. Nenhum deploy — fica na `wip` até "pode subir".
- Verificação visual ao vivo da aba é admin-gated (não autentico sozinho na conta do Luccas); reportar isso honestamente — a prova objetiva é tsc+build+c9 verdes e a verificação read-only da query contra produção.
