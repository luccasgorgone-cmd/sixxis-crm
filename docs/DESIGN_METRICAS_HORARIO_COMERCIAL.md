# Desenho — Métricas de atendimento em horário comercial

> ⚠️ **SUPERSEDIDO em 2026-10-22** por `DESIGN_PRESENCA_ONLINE_ROTEAMENTO.md`.
> O Luccas optou por medir atendimento pela **presença real (online/offline)** do
> vendedor, não por um horário comercial fixo. Este documento fica como registro
> histórico do raciocínio (horário fixo, almoço, sábado por atividade); a regra que
> vale agora é "conta só o tempo ONLINE do vendedor". Não implementar este.

Status: SUPERSEDIDO (ver acima).
Data: 2026-10-22. Branch de trabalho: `wip/atendimento-omnichannel-provider-abstract`.

## Intenção e porquê

Hoje as métricas de atendimento do vendedor (principalmente **tempo até a 1ª
resposta**) contam o tempo cru, incluindo noite, fim de semana e almoço — tempo
em que a empresa está **fechada**. Isso pune injustamente o vendedor: um cliente
que escreve 23h e é respondido 8h20 aparece como ~9h de demora. O Luccas quer a
métrica **"mais correta"**: o relógio só corre quando o comercial está aberto.

## Regra (reformulada e aprovada pelo Luccas)

O tempo de resposta passa a contar **apenas o tempo com o comercial ABERTO** entre
o contato do cliente e a 1ª resposta humana. Noite, fim de semana **e almoço** são
pulados de forma uniforme — tanto no início quanto no meio da medição.

Exemplos (comercial Seg–Sex 08:00–12:00 e 13:30–18:00; Sáb 08:00–12:00; Dom
fechado):
- Cliente 14:30, responde 14:52 → **22 min** (tudo dentro).
- Cliente 23:10, responde 08:20 do dia útil seguinte → **20 min** (relógio começa
  08:00).
- Cliente 11:50, responde 13:40 → **20 min** = 10 min (11:50→12:00) + 10 min
  (13:30→13:40); o almoço (1h30) não conta.
- Cliente sábado 12:30 (já fechado) → relógio começa na próxima abertura.

## Fonte do horário (já existe — reusar, não duplicar)

- `ConfiguracaoCRM.horarios` (JSON por dia, **múltiplas faixas**) + `fuso`
  (`America/Sao_Paulo`). Shape em `src/lib/horario.ts`:
  `DiaHorario = { dia: 0..6, aberto: boolean, faixas: {inicio:"HH:MM",fim:"HH:MM"}[] }`.
- **Editável já** pelo admin em `GeralAdmin.tsx` / `EditorHorarios.tsx` (salva via
  `/api/admin/config`). **Nenhuma UI nova de horário.** O Luccas só configura:
  Seg–Sex `[08:00–12:00, 13:30–18:00]`, Sáb `[08:00–12:00]`, Dom fechado.
- **Fonte única da verdade** do horário comercial — a métrica lê a MESMA config que
  a Luna já usa; não criar horário paralelo.

## Peça central (pura, testável)

`segundosAbertoEntre(inicio: Date, fim: Date, horarios, fuso, sabadosAbertos?: Set<string>): number`
— soma os segundos de interseção de `[inicio, fim)` com as faixas abertas,
varrendo dia a dia no fuso configurado, tratando multi-faixa (almoço) e spans de
vários dias. Determinística e pura (sem banco), coberta por teste de contrato
dourado. Reusa `normalizarHorarios` do `horario.ts`.

- **Argumento de sábado (correção pós-revisão):** a regra "sábado só conta pra
  quem trabalhou" é **por vendedor**, então a pureza se mantém passando
  `sabadosAbertos` = conjunto de datas de sábado (YYYY-MM-DD no fuso) em que o
  dono daquele lead trabalhou. Quem resolve esse conjunto (presença/inferência)
  fica FORA da função pura, na camada de query; a função só decide, para cada
  sábado que a janela cruza, se aquela faixa conta. Dias úteis valem para todos
  (sem `sabadosAbertos`).
- **Fallback sem config (correção pós-revisão, decisão minha):** se `horarios`
  for null/vazio, `segundosAbertoEntre` retorna o **delta cru** `fim − inicio`
  (igual a `estaAbertoAgora`, que trata "sem config" como sempre aberto). Assim a
  métrica **nunca regride** no período em que o horário ainda não foi configurado
  — fica igual ao de hoje até o Luccas preencher as faixas, aí passa a descontar.

## Onde aplica

- Métricas de tempo de resposta: substituir o delta cru `(resposta − contato)`
  por `segundosAbertoEntre(...)` em tempo até 1ª resposta, % dentro do prazo e o
  histograma `distribuir1aResposta`. **CORREÇÃO pós-revisão:** o número "headline"
  de 1ª resposta (`metricas.tempoPrimeiraRespostaSeg`) é calculado em
  **`src/lib/metricas.ts`** com um `AVG(EXTRACT(EPOCH ...))` em SQL — arquivo que o
  doc não citava. Para o número não contradizer o "% no prazo" ao lado, essa
  agregação precisa virar busca-linhas + cálculo em JS com `segundosAbertoEntre`.
  Isso toca `metricas.ts`, `indicadores.ts` e `painel.ts` (ver escopo abaixo).
- Alertas de **"parado há X"**: ver decisão pendente nº 2 — exibir o "há X" em
  tempo comercial é seguro; **mudar o disparo do alerta ao vivo** (SLA em
  `slaAlertas`/`estaParado`, hoje wall-clock) muda quando o time inteiro é
  notificado e **não** será feito sem decisão explícita.

## Decisões pendentes (do Luccas) — isoladas após a revisão

1. **Escopo (blast radius):** a regra de tempo comercial vale **só no Supervisor**
   (painel do gestor) ou **no sistema todo** (inclui o dashboard do colaborador e o
   `GeralAdmin`, que leem o mesmo `calcularMetricas`)? Recomendo **sistema todo** —
   senão convivem dois "tempo de 1ª resposta" diferentes, o que é bug por si só.
2. **"Parado há X" / SLA ao vivo:** aplicar tempo comercial só no **número
   exibido** do Supervisor (recomendado), mantendo o **disparo do alerta ao vivo**
   em wall-clock como hoje; OU reinterpretar os limites de SLA em tempo comercial
   também (aí "3 dias parado" vira ~3 dias ÚTEIS, e os alertas do time todo passam
   a disparar mais tarde). Recomendo o primeiro, pra não atrasar paginação do time
   sem querer.

## Sábado por vendedor (decidido: opção B — "o mais preciso possível")

Nem todo vendedor trabalha todo sábado; no sábado o horário 08:00–12:00 só conta
**para quem realmente trabalhou naquele sábado**. Quem folgou não é penalizado — o
sábado fica "fechado" para ele e o relógio do cliente só retoma na próxima abertura.

Problema: **não há histórico de presença** hoje (`Agente.ultimoLogin` guarda só o
último login). Solução em duas camadas (precedência nesta ordem):

1. **Presença registrada (daqui pra frente, exata):** nova tabela aditiva
   `PresencaAgente { id, agenteId, dia @db.Date, criadoEm, @@unique([agenteId,dia]) }`
   (ou equivalente), **upsert idempotente** quando o vendedor dá sinal de trabalho
   no dia (login e/ou qualquer ação/mensagem de saída). Para sábados cobertos por
   presença, ela é a verdade.
2. **Inferência por atividade (retroativo, para o passado sem presença):** o
   vendedor V "trabalhou no sábado D" se tiver **qualquer atividade real** naquele
   sábado. Sinais **confiáveis** (têm `agenteId` limpo): `Atividade.agenteId == V`
   e `HistoricoNegocio.agenteId == V`. **CORREÇÃO pós-revisão:** o sinal de
   "mensagem de saída" foi **descartado** — `Mensagem` não tem `agenteId` (só dá
   pra ligar via `Conversa.agenteId`, que é mutável) e OUT inclui auto-resposta da
   IA (`viaIA`) e disparo de campanha; usá-lo marcaria "trabalhou" por um robô ou
   blast agendado. Fica só atividade/histórico com `agenteId`. Usado quando não há
   registro de presença para (V, D).

Na `segundosAbertoEntre`, quando a faixa cai num **sábado** e o cálculo é de um lead
cujo dono é V: a faixa de sábado só conta se V trabalhou aquele sábado (presença,
senão inferência). Fora de sábado a regra global vale para todos (não há "nem todos
trabalham" em dia útil — isso é não-meta).

**Quem é "V" (dono), correção pós-revisão, decisão minha:** o dono por finalidade
— `donoId` para VENDA, `donoPosVendaId` para POS_VENDA (coalesce pela finalidade do
negócio da métrica). Como **não existe histórico de titularidade**, uso o **dono
atual** do lead para resolver os sábados do passado (limitação documentada: se o
lead trocou de dono depois, a presença consultada é a do dono de hoje). A camada de
query resolve, por lead, o conjunto `sabadosAbertos` do dono e passa à função pura.

## Almoço variável (decidido com o Luccas)

Vendedores às vezes **trocam/encurtam o almoço**, então o almoço fixo
(12:00–13:30) não vale pra todos sempre. Regra: o almoço é "fechado" **por
padrão**, mas **atividade real do vendedor na janela do almoço manda** — se ele
estava trabalhando, aquele tempo conta normal.

- **Mesma lógica do sábado (atividade sobrepõe o horário fixo):** para o vendedor
  V no dia D, se V teve atividade dentro da janela do almoço (uma resposta/ação com
  `agenteId`/`HistoricoNegocio` — e, na métrica de 1ª resposta, **a própria
  resposta** que cai dentro do almoço), aquele almoço vira **aberto** para V em D e
  **não é descontado**.
- **Exemplo:** cliente 12:20, vendedor responde 12:35 → **15 min** (normal), não
  "tempo fechado". O almoço só é descontado de quem de fato saiu: **nenhuma**
  atividade na janela e a resposta veio só depois das 13:30.
- **Efeito no cálculo:** na `segundosAbertoEntre`, o conjunto de "sobrepõe
  fechado→aberto" cobre tanto sábados-trabalhados quanto almoços-trabalhados
  (por V, por dia). A camada de query resolve esse conjunto; a função pura só
  aplica. Para a métrica de 1ª resposta, uma resposta dentro do almoço conta como
  essa evidência (sem query extra). Nos alertas de "parado" (sem resposta ainda), o
  almoço segue fechado — não há evidência de trabalho.

## Metas / não-metas / anti-metas

- **Meta:** tempo de resposta e "parado há X" em tempo comercial real; sábado
  sensível a quem trabalhou; preciso e auditável.
- **Não-meta:** aplicar disponibilidade por-vendedor em dias úteis (só sábado tem a
  regra "nem todos trabalham"); feriados (fica para v1.1 se o Luccas quiser).
- **Anti-meta:** punir vendedor por tempo de empresa fechada; criar uma 2ª config
  de horário divergente da que a Luna usa.

## Constraints

- Métrica é **histórica/retroativa** → o cálculo precisa funcionar sobre datas
  passadas; por isso a inferência por atividade existe.
- Fuso `America/Sao_Paulo` (sem DST desde 2019; ainda assim derivar do `fuso` da
  config, não hardcode).
- Funções puras e determinísticas para teste.

## Deixado para o builder

- Pontos exatos de escrita da presença (rota de login + conexão de socket
  `io.on("connection")` que já existe das salas `agente:<id>` + opcionalmente no
  caminho de atividade). Upsert idempotente por (agente, dia).
- Migration **aditiva** (sem DROP/TEMP) para `PresencaAgente`; provar válida contra
  o schema de produção via transação com ROLLBACK antes de considerar pronta.
- Como exibir na UI: substituição transparente dos números + tooltip "tempo em
  horário comercial" para deixar claro que é tempo útil, não cru.
- Testes de contrato: `segundosAbertoEntre` (noite, almoço, fim de semana, span
  multi-dia, sábado-trabalhado vs sábado-folga) + a precedência presença/inferência.

## Gate

Nada é construído até o Luccas aprovar. A migration e o deploy para `main`
(Railway) são catraca cheia e exigem OK direto dele no momento de subir.
