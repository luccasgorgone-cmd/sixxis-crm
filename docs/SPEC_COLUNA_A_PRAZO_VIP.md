# SPEC — Coluna "A Prazo" + coluna VIP (áreas de parking no Kanban)

Pedido do Luccas (30/10/2026). Classificação: **Architectural** (novas etapas,
campo de prazo, job de auto-retorno, agenda+notificações, exclusão de métricas,
VIP deixa de ser só etiqueta e vira coluna). Planejar + confirmar antes de codar.

## Objetivo

Duas novas "áreas de estacionamento" no funil de VENDA, entre **Aguardando
pagamento** e **Vendido**:

1. **A Prazo** (etiqueta/coluna AZUL) — cliente pediu para ser contatado em X
   dias. O card fica parado aqui até o prazo; não cobra métrica nem SLA; o dono
   é lembrado (agenda + notificação) e, se não agir, o card volta sozinho para
   "Em atendimento" quando o prazo passa.
2. **VIP** (coluna própria, roxa) — todos os clientes VIP ficam agrupados numa
   coluna; seguem as regras de coringa já implementadas (fora do SLA e das
   métricas).

Ordem proposta do funil de Venda:
`Novo → Em atendimento → Negociando → FU1 → FU2 → FU3 → Aguardando pagamento →
**A Prazo** → **VIP** → Vendido → Perdido`.

## Fluxo "A Prazo"

**Marcar (ação no card):**
- O dono clica "A Prazo" e **escolhe o prazo em dias** (ex.: 7). O card:
  - move para a etapa **A Prazo**;
  - ganha a etiqueta **A Prazo** (azul) → borda azul no card;
  - grava `Negocio.prazoContatoAte = agora + N dias`;
  - cria um **Lembrete** na agenda do dono em `prazoContatoAte`, com
    `lembrarAntesMin = 1440` (24h). Isso já dá, de graça, a **notificação 24h
    antes** (6º dia num prazo de 7) e **no dia** (quando o Lembrete vence).
- Enquanto está em A Prazo: **fora do SLA** (sem amarelo/vermelho) e **fora das
  métricas** (não conta em abertos/conversão/cobertura/etc.).

**Sair antes do prazo:**
- Se o dono move o card para **Em atendimento** antes do prazo → remove a etiqueta
  A Prazo, limpa `prazoContatoAte`, cancela/conclui o Lembrete. Card volta ao ciclo.
- (A confirmar) Se o **cliente responde** (mensagem de entrada qualificada) → mesmo
  comportamento: volta para Em atendimento, tira a etiqueta.

**Auto-retorno (job, a cada 15 min, junto do reguaFollowup):**
- `prazoContatoAte` passou e o card ainda está em A Prazo → move para **Em
  atendimento**, remove a etiqueta A Prazo, limpa `prazoContatoAte`, notifica o
  dono ("prazo do cliente venceu, retome o atendimento"). Recomeça o ciclo.

## Coluna VIP

- Marcar um cliente como **VIP** (etiqueta VIP, já existe, roxa) **move o card
  para a etapa VIP** e ele fica lá, agrupado com os outros VIP.
- VIP segue as regras já implementadas: **fora do SLA** (sem amarelo/vermelho) e
  **fora das métricas**; borda roxa no card.
- Sai da coluna VIP quando o dono move manualmente (ex.: para Vendido ao fechar,
  ou de volta ao pipeline) e/ou tira a etiqueta VIP.

## Exclusão de métricas

- `metricas.ts` seleciona por status/etapa. Excluir das métricas os negócios cujas
  etapas são **A Prazo** e **VIP** (e manter a exclusão de SLA já existente do VIP).
- Mecanismo: `NOT etapaId IN (aPrazoId, vipId)` nas where-clauses de abertos/
  pipeline. (A Prazo e VIP são ABERTOS, senão contariam como pipeline.)

## Cores do card (borda só, já ajustado)

- A Prazo → **borda azul**; VIP → **borda roxa**; vermelho/amarelo do SLA só nas
  etapas normais. Prioridade: VIP > A Prazo > vermelho > amarelo > normal.

## Schema (ADITIVO, zero DROP)

- `Negocio.prazoContatoAte DateTime?` — prazo de recontato do A Prazo.
- Novas etapas "A Prazo" e "VIP" (VENDA, ABERTAS, cores azul/roxo) via seed
  idempotente + reordenação de `ORDEM_ALVO_VENDA`.
- Etiqueta "A Prazo" (azul) via seed (VIP já existe).

## Pontos a confirmar com o Luccas (bloqueiam)

1. **Ordem/nome das colunas.** "vencido/vencidos" = a coluna **Vendido**? Ordem
   fica `... Aguardando pagamento → A Prazo → VIP → Vendido → Perdido`?
2. **VIP vira ETAPA (card movido para a coluna VIP)?** Hoje VIP é só etiqueta
   (fora do SLA + borda roxa, sem mover). Confirmar que marcar VIP **move** o card
   para a coluna VIP (e sai só quando o dono move/desmarca).
3. **Prazo em dias CORRIDOS** (cliente pediu "7 dias" no mundo real), não dias
   úteis? (diferente do SLA, que é tempo útil).

## Defaults assumidos (ajusto se você discordar)

- A Prazo = nova etapa + etiqueta azul + campo de prazo + ação com seletor de dias.
- A Prazo e VIP = colunas só no funil de **Venda** (Pós-venda mantém VIP como
  etiqueta roxa fora do SLA, sem coluna).
- Mensagem de entrada do cliente também tira o card de A Prazo (volta a Em atend.).
- Fora das métricas = todas as métricas de performance + SLA.

## Gates/teste
- tsc + contratos (novo contrato para o cálculo do auto-retorno por prazo, puro).
- Migration aditiva; deploy confirmado via GitHub deployment status.
