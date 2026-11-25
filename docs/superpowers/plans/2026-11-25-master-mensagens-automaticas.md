# Master de Mensagens Automáticas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o interruptor mestre bloquear de forma fail-closed todas as mensagens automáticas sem afetar envios humanos.

**Architecture:** Criar um único executor em `src/lib/mensagemAutomatica.ts` que consulta `ConfiguracaoCRM.mensagensAutomaticasAtivas` e só então executa o callback de I/O. Todos os quatro produtores automáticos passam por esse executor no limite do envio; Sol também consulta o mestre antes de gerar resposta.

**Tech Stack:** TypeScript, Prisma 7, BullMQ, contratos determinísticos via `tsx`.

**Spec:** `docs/incidents/2026-11-25-stop-automatic-messages.md`

## Global Constraints

- O mestre só permite automação quando o valor persistido é exatamente `true`.
- Ausência de config e erro de leitura falham fechado.
- Nenhum schema/migração e nenhuma alteração nas rotas de envio humano.
- Nenhum teste chama banco, Redis, Evolution, SMS ou e-mail reais.

## Review Focus

- Mestre desligado ou ausente não pode executar callback externo.
- Erro de banco não pode degradar para envio.
- Uma troca para OFF durante campanha/recaptura deve ser observada antes do próximo I/O.
- Campanha bloqueada não pode terminar como `CONCLUIDA`; recaptura bloqueada não pode ficar `ARMADA`.
- Sol não deve gastar IA nem emitir bolha quando o mestre está OFF.

---

### Task 1: Executor fail-closed do mestre

**Files:**
- Create: `src/lib/mensagemAutomatica.ts`
- Create: `scripts/contratos/c29-mestre-mensagens-automaticas.ts`

**Interfaces:**
- Consumes: `prisma.configuracaoCRM.findFirst` e callback assíncrono de I/O.
- Produces: `criarExecutorMensagemAutomatica`, `executarMensagemAutomatica`, `mestreMensagensAutomaticasAtivo` e `ResultadoExecucaoAutomatica<T>`.

- [ ] **Step 1: Escrever o contrato falhando**

Cobrir quatro comportamentos: `false` bloqueia; ausência bloqueia; exceção na leitura bloqueia; `true` executa uma vez e devolve o valor literal.

- [ ] **Step 2: Rodar o contrato e confirmar RED**

Run: `npx tsx scripts/contratos/c29-mestre-mensagens-automaticas.ts`
Expected: FAIL porque `src/lib/mensagemAutomatica.ts` ainda não existe.

- [ ] **Step 3: Implementar o executor mínimo**

Assinaturas:
- `criarExecutorMensagemAutomatica(lerMestre: () => Promise<unknown>)`
- `executarMensagemAutomatica<T>(acao: () => Promise<T>): Promise<ResultadoExecucaoAutomatica<T>>`
- `mestreMensagensAutomaticasAtivo(): Promise<boolean>`

- [ ] **Step 4: Rodar o contrato e confirmar GREEN**

Run: `npx tsx scripts/contratos/c29-mestre-mensagens-automaticas.ts`
Expected: `c29-mestre-mensagens-automaticas: OK`.

### Task 2: Ligar todos os produtores automáticos ao mestre

**Files:**
- Modify: `src/lib/queue.ts`
- Modify: `src/lib/recaptacao.ts`
- Modify: `scripts/contratos/c29-mestre-mensagens-automaticas.ts`

**Interfaces:**
- Consumes: executor da Task 1.
- Produces: campanhas canceladas e recapturas pausadas quando o mestre bloquear; Sol e aviso fora do horário sem I/O.

- [ ] **Step 1: Acrescentar casos comportamentais ao contrato**

Definir a API desejada `criarEnvioPeloCanalAutomatico(executor, enviarPeloCanal)` e provar com um adaptador falso de Evolution que OFF não o chama, enquanto ON preserva exatamente o resultado retornado. O callback genérico já coberto na Task 1 representa os branches SMS/e-mail da campanha.

- [ ] **Step 2: Rodar e confirmar RED para a integração ainda ausente**

Run: `npx tsx scripts/contratos/c29-mestre-mensagens-automaticas.ts`
Expected: FAIL porque `criarEnvioPeloCanalAutomatico` ainda não existe.

- [ ] **Step 3: Substituir os quatro limites de I/O pelo executor**

- `processarCampanha`: envolver o branch WhatsApp/SMS/e-mail; OFF muda `ENVIANDO → CANCELADA` e interrompe o loop.
- `responderForaHorarioSePreciso`: envolver `enviarPeloCanal` no limite externo.
- `responderComLunaSePreciso`: testar mestre antes da IA e envolver cada bolha no limite externo.
- `processarRecaptacao`: envolver o envio após o jitter; OFF pausa a campanha e interrompe o lote.

Adicionar `criarEnvioPeloCanalAutomatico`/`enviarPeloCanalAutomatico` ao módulo central; `queue.ts` e `recaptacao.ts` deixam de importar diretamente o adaptador bruto.

- [ ] **Step 4: Verificar contrato, tipos, build e todos os contratos dourados**

Run: `nice -n 19 bash .githooks/pre-commit`
Expected: tsc, build e todos os contratos verdes.

- [ ] **Step 5: Commit**

Run: `git add docs src/lib scripts/contratos && git commit -m "fix: bloqueia toda mensagem automatica pelo mestre"`
