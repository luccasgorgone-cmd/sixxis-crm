# Explicativo de Métricas — como cada número é calculado

> Para o gestor entender **exatamente** o que cada métrica considera. Fiel ao
> código (`src/lib/metricas.ts`, `src/lib/supervisor/indicadores.ts`,
> `src/lib/supervisor/captacao.ts`, `src/lib/presenca/*`). Data: 2026-10-22.

## Princípios que valem para tudo

- **Período:** quase tudo é recortado por uma janela `[início, fim)` (Hoje / 7d /
  15d / 30d, ou datas custom). O fim é exclusivo (não conta duas vezes na
  fronteira). Fuso **America/São_Paulo**.
- **"Houve ganho no período" (regra de ouro do faturamento):** venda conta pelo
  **evento de ganho dentro do período**, não pelo status atual do card. Um negócio
  ganho no período que depois reabriu ainda conta como venda daquele período.
- **Valor efetivo (a armadilha nº1):** o valor de uma venda =
  `COALESCE(valorAjustado, valor)` — ou seja, **se `valorAjustado` estiver
  preenchido, ele MANDA** sobre o `valor`. Um `valorAjustado = 0` pendurado zera a
  venda em silêncio. `valor` = total do pedido (produtos + frete). `valorProdutos`
  = só itens.
- **Escopo:** toda métrica aceita recorte por **finalidade** (Venda / Pós-venda /
  Tudo) e por **vendedor** (drilldown).

---

## Métricas de venda

### Conversão
- **O que mede:** taxa de fechamento dos negócios que **terminaram** no período.
- **Cálculo:** `ganhos / (ganhos + perdidos)` — só negócios **finalizados** no
  período (ganho ou perdido). Abertos **não** entram no denominador (senão todo
  negócio novo derrubaria a taxa).
- **Farol:** ≥40% verde · ≥25% amarelo · abaixo vermelho.

### Valor vendido
- **Cálculo:** `Σ COALESCE(valorAjustado, valor)` dos negócios **ganhos no
  período**. Segue a regra de ouro + valor efetivo acima.

### Ticket médio
- **Cálculo:** `valor vendido / nº de ganhos`. Só faz sentido com ganhos > 0.

---

## Métricas de atendimento (tempo de resposta)

### Tempo até a 1ª resposta
- **O que mede:** quão rápido o vendedor responde a primeira mensagem do cliente.
- **Cálculo (hoje):** por conversa, `primeiro OUT − primeiro IN`; a métrica é a
  **média** desses tempos no período (só conversas onde houve resposta, i.e.
  `OUT` depois de `IN`).
- **Farol:** ≤5min verde · ≤30min amarelo · acima vermelho. *(O achado histórico:
  responder em <5min converte 2–5x mais.)*
- **MUDANÇA (presença):** o relógio passa a contar **apenas o tempo em que o
  vendedor esteve ONLINE** entre o contato e a resposta — ver "Presença" abaixo.
  Noite, fim de semana, folga e almoço **não** pesam contra o vendedor.

### % dentro do prazo de 1ª resposta
- **Cálculo:** % das conversas cujo tempo de 1ª resposta ficou **≤ prazo**
  configurado (padrão **1h**, ajustável). Com a presença, o "tempo" é tempo-online.
- **Farol:** ≥80% verde · ≥50% amarelo.

### Distribuição da 1ª resposta (histograma)
- **O que mostra:** quantas respostas caíram em `<5min`, `5–15min`, `15–60min`,
  `1–4h`, `4–24h`, `>24h`. Dá a cara real da operação (não só a média, que esconde
  extremos).

---

## Métricas de funil / gestão

### Cobertura de funil
- **O que mede:** se o pipeline em aberto é suficiente para a meta do período.
- **Cálculo:** `Σ(valor efetivo em aberto × peso da temperatura) / meta restante`.
  Pesos padrão: **QUENTE 0,8 · MORNO 0,5 · FRIO 0,2** (um lead frio "vale menos"
  como promessa de receita). Resultado é um **múltiplo** (ex.: 3x = pipeline
  ponderado cobre 3x o que falta pra meta).
- **Farol:** ≥3x verde · ≥2x amarelo.

### Sem próximo passo
- **O que mede:** % dos negócios **abertos** sem um próximo passo (lembrete/tarefa)
  marcado — risco de esquecimento.
- **Farol (menor é melhor):** ≤20% verde · ≤40% amarelo.

### Parados
- **O que mede:** negócios abertos **sem nova interação** há mais de X dias (padrão
  **7**). Mede abandono no meio do funil.
- **MUDANÇA (presença):** o "há X" do número **exibido** passa a ser contado em
  tempo-online; mas o **alerta ao vivo** que notifica o vendedor continua em tempo
  real (wall-clock), pra não atrasar a cobrança do time.

---

## Captação Ativa (aba nova, admin)

- **O que mede:** prospecção **ativa** — clientes que o vendedor **cadastrou na
  mão**, não os que entraram sozinhos.
- **Quem conta:** `Lead.origem = "manual"` (gravado só pelo cadastro manual) com
  `criadoEm` no período. Revínculo de telefone já existente **não** conta (é outra
  coisa). Seeds/imports não usam "manual", então não inflam.
- **Crédito:** ao **vendedor dono** (venda = `donoId`, pós-venda =
  `donoPosVendaId`), com a coluna **"cadastrado por"** sempre visível (quando um
  admin cadastra e atribui, isso aparece — não se confunde com esforço do vendedor).
- **Conversão / R$ por COORTE:** dos captados no período, seguimos os negócios
  deles **pra frente** (qualquer ganho depois conta), **sem** exigir que a venda
  feche dentro do mês. É isto que responde "a prospecção deu resultado?".
- **Comparação:** variação ▲/▼ contra o período anterior de mesma duração.

---

## Presença (nova base das métricas de atendimento)

- **Online/offline por vendedor:** estado **novo**, separado do `ativo` da conta.
  O vendedor alterna no **toggle do header**; fica offline manualmente **ou** por
  **inatividade** (15 min sem atividade → aviso de 1 min → offline automático).
- **Como entra na métrica:** gravamos **períodos de presença** (quando ficou
  online/offline). O tempo de resposta e o "parado há X" passam a somar **só os
  segundos com o vendedor online** (`segundosOnlineEntre`). Assim:
  - Cliente escreve 23h e é respondido 8h20 → conta **o tempo online**, não ~9h.
  - Almoço, folga e sábado de quem não trabalhou **não** pesam — porque a pessoa
    estava offline.
- **Importante — vale daqui pra frente:** presença é ao vivo; o passado (sem dado
  de presença) permanece como era (tempo cru) — a métrica **nunca piora**
  retroativamente, só fica mais justa do deploy em diante.
- **Entrega de leads (roteamento):** passa a entregar **só para quem está online**,
  em rodízio um-pra-cada; cliente que **já tem dono** espera o dono voltar (não é
  reentregue).

---

## Faróis — resumo

| Métrica | Verde | Amarelo |
|---|---|---|
| % 1ª resposta no prazo | ≥80% | ≥50% |
| Conversão | ≥40% | ≥25% |
| Cobertura de funil | ≥3x | ≥2x |
| Sem próximo passo (menor melhor) | ≤20% | ≤40% |
| Tempo médio 1ª resposta (menor melhor) | ≤5min | ≤30min |

Todos os limiares/metas são **ajustáveis** por você na aba Configurações do
Supervisor (os valores acima são os padrões semeados).
