# Plano — Filtro por etapa + nova ordenação do Inbox

> Status: PLANEJAMENTO (Artigo 14 — tratado como Architectural pela mudança de
> ordenação + possível migração). Nada implementado. **Não mexe no Kanban.**
> Pedido do Luccas (01/10/2026): (1) filtro por etapa no Inbox; (2) ordenação em
> que conversa com cliente aguardando resposta sobe, e conversa que o atendente
> já respondeu afunda.

## 1. Como está hoje (fatos verificados no código)

### Ordenação atual
- **Servidor** (`src/lib/ordenacao.ts:10-14`, usado em `src/app/api/conversas/route.ts:54`):
  `fixadaEm desc (nulls last)` → `ultimaMensagemEm desc` → `criadoEm desc`, `take: 200`.
- **Cliente** (`src/components/inbox/Inbox.tsx:453-457`, memo `filtradas`):
  reafirma a mesma regra (fixados → `ultimaMensagemEm` desc) via `compararPin`
  (`src/lib/ordenacao.ts:20-30`).
- `ultimaMensagemEm` é **um único timestamp, sem direção** (`schema.prisma:393`):
  tanto mensagem do cliente (IN) quanto resposta do atendente (OUT) avançam o
  mesmo campo. Por isso hoje responder um cliente **sobe** a conversa — o oposto
  do que você quer.

### Reordenação em tempo real (socket)
- `onNova` (`Inbox.tsx:230-281`, registrado `:347`): **qualquer** `mensagem:nova`
  move a conversa pro topo (índice 0), IN ou OUT igual. A direção (`evt.direcao`)
  só é usada hoje pro contador de não lidas (`:267-271`), **não** pra ordenar.
- `bumpLista` (`:364-378`) + `aoEnviada`/otimista (`:382-411`): envio OUT também
  joga pro topo.

### Etapa (funil) — como o dado existe
- Conversa **não** aponta pra etapa direto. Cadeia:
  `Conversa → Lead → Negocio → Etapa`.
- `Negocio.etapaId/etapa` (`schema.prisma:589-590`); `Etapa`
  (`schema.prisma:520-530`: `id, nome, ordem, cor, tipo, finalidade, ativo`).
- A rota do Inbox **já resolve** a conversa pro negócio certo
  (`negocioDaConversa`, `route.ts:84-100`: mesmo lead + mesma finalidade,
  preferindo `status ABERTO`, senão o mais novo) e devolve `negocioId`
  (`:127`) — mas o `select` do negócio **não traz `etapaId`/`etapa`**
  (`route.ts:56-70`). Ou seja: a etapa está a um join de distância, só não é
  puxada nem exposta hoje.
- `Finalidade`: `VENDA` | `POS_VENDA`. Etapas são **por finalidade** (cada funil
  tem seu conjunto).

### Filtros que já existem no Inbox
- Busca (nome/telefone + conteúdo no backend `?texto=`), segmentado
  Minhas/Não lidas/Todas, período de entrada, e finalidade (só admin).
- **Não existe** filtro por etapa. **Não existe** "último inbound" separado.

## 2. O que muda (escopo) — e o que NÃO muda

**Muda (só Inbox):**
1. A rota `conversas` passa a resolver e devolver a **etapa atual** de cada
   conversa (nome/cor/ordem/id) a partir do negócio já resolvido.
2. A rota devolve a **direção da última mensagem** (IN/OUT) — 1 campo no
   `select` que já busca a última mensagem (`route.ts:72-76`).
3. Novo **filtro por etapa** na coluna da lista.
4. Nova **ordenação** (ver §3).

**NÃO muda (barreira explícita — sem misturar com Kanban):**
- Nada escreve `Negocio.etapaId`, nada move card, nada reordena o funil.
- A etapa é **lida** só pra exibir/filtrar no Inbox.
- Componentes do Kanban, `entrouEtapaEm`, arquivamento por prazo: intocados.
- Regra de 17/08 (mensagem OUT nunca cria/reabre negócio nem roteia): intocada.

## 3. Nova ordenação — modelo proposto

Chave de ordenação (prioridade desc):
1. `fixadaEm` (fixados no topo) — **inalterado**.
2. **Camada de espera**: `0 = aguardando nós` (última msg = IN, cliente falou por
   último) acima de `1 = aguardando cliente` (última msg = OUT, já respondemos).
3. `ultimaMensagemEm desc` dentro da camada.

Comportamento resultante:
- Cliente manda msg → última = IN → camada 0 → **sobe** (só abaixo dos fixados). ✓
- Atendente responde → última = OUT → camada 1 → **afunda** abaixo de todos os
  que ainda esperam resposta. ✓
- Atendente insiste e cliente não responde → segue camada 1, afundando conforme
  outros clientes mandam msg. ✓

Por que camada (e não só "ordenar por último inbound"): a camada faz o atendente
ver a conversa **descer na hora** ao responder (bate literal com o seu pedido) e
mantém no topo exatamente quem está esperando resposta nossa — que é o valor
operacional (fila de "precisa responder"). É mais preciso que "não lidas", porque
abrir sem responder mantém o cliente no topo.

Tempo real: o socket já carrega `evt.direcao`; `onNova`/`bumpLista` passam a
gravar a direção da última msg no item, então a camada atualiza ao vivo sem
reload.

### Decisões travadas (Luccas, 01/10/2026) — todas nas recomendações
1. Dentro de "aguardando nós": **mais antigo no topo** (fila justa).
2. Conversa sem negócio aberto → **"Sem etapa"**, filtrável.
3. Profundidade **(A) leve, sem migração** (camada derivada da direção da última
   mensagem que a rota já busca; vale dentro das 200 mais recentes).
4. **Badge de etapa** na linha + filtro.

> Nuance registrada: "cliente manda msg → sobe" vale no cruzamento de camada (o
> caso comum: já respondemos e estamos aguardando o cliente; ele escreve e a
> conversa pula pra cima de todas as que esperam resposta). DENTRO da camada
> "aguardando nós", a ordem é por tempo de espera (mais antigo primeiro), então
> uma 2ª mensagem de um cliente que já estava nessa camada não pula pro topo
> absoluto — fica pela antiguidade. Foi a escolha 1 (fila justa).

## Implementado (01/10/2026) — gates verdes

- `src/lib/ordenacao.ts`: `compararConversasInbox` (pin → camada IN/OUT → tempo).
- `src/components/inbox/tipos.ts`: `EtapaResumo`, `EtapaOpcao`, `FiltroEtapa`;
  `ConversaItem.etapa` e `ultimaDirecao`.
- `src/app/api/conversas/route.ts`: `+direcao` na última msg; `+etapa` no
  negócio; `etapaDaConversa` (só negócio ABERTO) → emite `etapa` e `ultimaDirecao`.
- `src/components/inbox/Inbox.tsx`: fetch de `/api/etapas`, estado+reset do filtro,
  `ultimaDirecao` no socket (`onNova` usa `evt.direcao`; `bumpLista` = OUT), sort
  pela nova regra, props do filtro.
- `src/components/inbox/ListaConversas.tsx`: seletor de etapa, badge de etapa na
  linha, estado vazio considerando o filtro.
- `scripts/contratos/c4-ordem-inbox.ts`: contrato puro (8 casos).
- Gates: **tsc 0, C1 20/20, C2 10/10, C3 13/13, C4 8/8, next build 0.**

## 4. Onde bate (impacto, arquivo por arquivo)

- `src/app/api/conversas/route.ts`: +`direcao` no select da última msg
  (`:72-76`); +`etapaId`/`etapa{nome,cor,ordem}` no resolve do negócio
  (`:56-70`/`:84-100`); emitir `etapa` e `ultimaDirecao` no map de resposta
  (`:122-158`); (opcional) aceitar `?etapaId=` no `where`.
- `src/lib/ordenacao.ts`: novo comparador com a camada; decidir se o
  `orderBy` do servidor também reflete (ver §5, item depth).
- `src/components/inbox/tipos.ts`: `ConversaItem` ganha `etapa?` e
  `ultimaDirecao` (ou `aguardandoResposta`).
- `src/components/inbox/Inbox.tsx`: `ordenar` (`:453-457`) usa a camada;
  `onNova` (`:258-280`) e `bumpLista` (`:364-411`) gravam `ultimaDirecao` do
  `evt.direcao`; novo estado/param do filtro de etapa + `passaFiltro`
  (`:444-450`).
- `src/components/inbox/ListaConversas.tsx`: controle de filtro de etapa
  (e, se você quiser, badge de etapa na linha); fonte das opções = endpoint de
  etapas já usado pelo Kanban (confirmar na implementação, provável
  `/api/etapas`), filtrando por finalidade.

Sem toque em: Kanban, schema de Negocio/Etapa (a menos que a decisão de depth
peça o campo persistido — ver §5), Evolution/Cloud/envio.

## 5. Decisões que preciso de você (travam o início do código)

1. **Dentro da camada "aguardando nós"**: ordenar por msg do cliente **mais
   recente no topo** (bate com "cliente sobe") ou **mais antigo no topo**
   (SLA: quem espera há mais tempo aparece primeiro, não deixa ninguém pra trás)?
   — *Recomendo mais antigo no topo dentro dessa camada (fila justa), mas é sua
   operação.*
2. **Conversa sem negócio aberto** (negócio fechado GANHO/PERDIDO, ou sem
   negócio): mostrar como **"Sem etapa"** e filtrável por isso? — *Recomendo sim.*
3. **Profundidade**:
   - **(A) Leve, sem migração**: camada derivada da direção da última msg que a
     rota já busca; funciona dentro das 200 conversas mais recentes (cap atual).
   - **(B) Robusto, com migração aditiva**: campo indexado em `Conversa` (ex.
     `ultimaDirecao` ou `aguardandoRespostaDesde`) pra ordenar no servidor e
     garantir ordem correta mesmo além de 200 (relevante no Venda-3, 650 ativas).
   — *Recomendo começar no (A) e subir pro (B) só se o cap de 200 incomodar.*
4. **Badge de etapa na linha** da conversa (além do filtro) — mostrar ou só
   filtrar? — *Recomendo mostrar um badge discreto; não conflita com o Kanban.*
