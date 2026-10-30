# Manual de Atendimento SIXXIS

> Guia operacional do atendimento comercial no CRM. Didático, direto, feito para quem está na operação (vendedor, pós-venda) e para quem gere (supervisor). Dividido em **VENDA** e **PÓS-VENDA**. Todos os prazos, métricas e regras aqui batem com o que está implementado no CRM (funis, motor de SLA, régua de follow-up, métricas do Supervisor). Números de alvo marcados com _(ajustável)_ podem ser mudados por você na aba Configurações do Supervisor.

Como usar: cada bloco responde uma pergunta prática — "o que é um atendimento perfeito aqui", "o que eu faço em cada etapa", "em quanto tempo", "o que me cobram". Leia a sua parte (Venda ou Pós-venda) de cima a baixo uma vez; depois use como consulta.

---

# PARTE 1 — VENDA

Objetivo da operação de Venda: transformar o contato que chega (WhatsApp, site, campanha) em **venda fechada**, no menor tempo e com o maior aproveitamento possível — sem deixar ninguém sem resposta e sem perder lead por esquecimento.

## 1.1 O atendimento perfeito em 6 princípios

1. **Velocidade ganha.** Responder em menos de 5 minutos converte de 2 a 5× mais do que responder em horas. O primeiro "oi" bem rápido já é meia venda.
2. **Ninguém sem dono.** Todo cliente tem um vendedor responsável (o "dono"). Se ele é seu, a responsabilidade é sua até fechar, perder ou passar.
3. **Todo negócio aberto tem um próximo passo.** Nunca deixe um card parado sem um lembrete/tarefa do que fazer em seguida. "Sem próximo passo" = risco de esquecer = venda perdida.
4. **Mover o card é obrigatório, não opcional.** O funil tem que refletir a vida real do cliente. Card na etapa errada mente para o time inteiro e estraga as métricas.
5. **Fechar é fechar — com motivo.** Ganhou: registra o valor certo. Perdeu: escolhe o motivo da lista. Nada de deixar card pendurado "por via das dúvidas".
6. **A bola nunca para com a gente.** Enquanto a resposta depende de você, o relógio corre contra você. Devolva a bola rápido e deixe-a com o cliente.

## 1.2 O sistema operacional do dia (rotina)

O CRM trabalha em **horário comercial, dias úteis e fora de feriados** — é assim que ele conta prazo e cobra SLA. A sua rotina acompanha isso:

**Início do dia (revisão da manhã):**
- Entre **online** no CRM (toggle no topo). Lead novo só é entregue para quem está online — se você está offline, não recebe nada.
- Zere a **fila da noite**: toda mensagem que chegou fora do expediente deve ser respondida **até as 9h**. Cliente que escreveu às 23h tem que ter resposta na primeira hora da manhã.
- Olhe seus **leads vencidos / parados** (negócio aberto sem interação há mais de 7 dias _(ajustável)_) e seus **alertas de SLA**. Resolva os **vermelhos** (em atraso) primeiro e fique de olho nos **amarelos** (prazo vencendo).

**Durante o dia:**
- Responda rápido (meta: 1ª resposta ≤ 5 min; limite ≤ 1h útil).
- A cada atendimento, **mova o card** para a etapa real e **deixe o próximo passo marcado** (lembrete/tarefa com data).
- Follow-ups do dia: o CRM te lembra; dispare os FUx **até as 14h**.

**Fim do dia:**
- Nenhum card seu deve terminar o dia **sem próximo passo**.
- Fique **offline** quando parar de trabalhar (ou o sistema te coloca offline após 15 min sem atividade, com 1 min de aviso). Ficar offline é certo — o tempo offline **não** pesa contra você nas métricas.

## 1.3 O funil de Venda, etapa por etapa

O funil tem 9 etapas. As **abertas** (Novo até Aguardando pagamento) são negócios vivos; **Vendido** é ganho; **Perdido** é fim de linha.

| # | Etapa | O que significa | O que você faz | Prazo-alvo _(ajustável)_ |
|---|---|---|---|---|
| 1 | **Novo** | Lead acabou de chegar, ainda sem atendimento | Dar o 1º contato / boas-vindas, entender a necessidade | 1ª resposta ≤ **1h útil** (ideal ≤ 15 min) |
| 2 | **Em atendimento** | Conversa rolando, levantando necessidade/produto | Qualificar, apresentar produto, mandar o que foi pedido | **1 dia útil** sem avançar → alerta |
| 3 | **Negociando** | Cliente recebeu proposta/preço, decidindo | Trabalhar objeção, preço, frete, condição | **5 dias úteis** (B2C) / **10 dias** (B2B) |
| 4 | **FollowUp - 1** | 1ª cobrança após silêncio | Retomar com valor (não só "e aí?") | **2 dias úteis** → FU2 |
| 5 | **FollowUp - 2** | 2ª cobrança | Nova abordagem / oferta | **3 dias úteis** → FU3 |
| 6 | **FollowUp - 3** | Última tentativa | Último toque antes de desistir | **1 dia útil** → Perdido "Sem resposta" |
| 7 | **Aguardando pagamento** | Fechou, falta o pagamento cair | Acompanhar o pagamento, confirmar | Conta como **negócio ativo** |
| 8 | **A Prazo** | Cliente pediu para ser contatado em X dias | Agendar o recontato (seletor de dias no painel); volta sozinho no prazo | **Fora** do SLA e das métricas |
| 9 | **VIP** | Cliente VIP (coringa), agrupado em coluna própria | Atender com prioridade; marcar/desmarcar a etiqueta VIP move pra cá / de volta | **Fora** do SLA e das métricas |
| 10 | **Vendido** | GANHO — venda concretizada | Registrar o **valor correto** e encerrar | — |
| 11 | **Perdido** | PERDIDO — não vendeu | Escolher o **motivo** da lista | — |

**Regras de movimento:**
- Card sobe conforme o cliente avança. Não pule etapa "pra adiantar": a etapa é a verdade do momento.
- Só o **dono** mexe no card dele (quando está ativo/online). Isso evita dois vendedores na mesma venda.
- **Entrou interação qualificada** (cliente pediu preço, frete, link, forma de pagamento) num card que estava em follow-up? Ele volta para **Em atendimento / Negociando** — porque o cliente esquentou de novo. Limite: **1 retorno** desses automáticos; um 2º precisa de aprovação do gestor (evita "zumbi" rodando pra sempre no funil).

## 1.4 Tempo, SLA e as cores do card

- O prazo de cada etapa é contado em **tempo útil** (horário comercial, dias úteis, sem feriado). Sábado, domingo, madrugada e feriado **não** correm contra você.
- **1ª resposta** é medida pelo **tempo em que o dono esteve ONLINE** entre o contato e a resposta — não pelo relógio de parede. Cliente escreveu 23h, você respondeu 8h20: conta o seu tempo online (minutos), não as 9 horas da noite.
- Os prazos de cada etapa já vêm configurados (os **Prazo-alvo** da tabela 1.3) e o gestor ajusta na aba do Supervisor.
- **B2B tem o dobro do prazo em Negociando** (10 dias úteis vs 5 do B2C), porque compra de revenda/empresa demora mais. Marque o lead como **B2B** quando for revenda, loja, assistência, academia ou pedido grande (>5 unidades).

**O semáforo do card** — a borda do card muda de cor conforme o prazo da etapa:

- 🟡 **Amarelo — prazo vencendo:** faltam **12h úteis ou menos** para o prazo da etapa vencer. É um aviso: priorize antes de virar atraso.
- 🔴 **Vermelho — em atraso:** o prazo da etapa **venceu**. É o seu vermelho prioritário.
- 🔵 **Azul — A Prazo (recontato agendado):** cliente pediu para ser contatado em X dias. O card fica na coluna **A Prazo**, fora do SLA e das métricas, até o prazo — e volta sozinho para Em atendimento quando vence.
- 🟣 **Roxo — cliente VIP:** marcar a etiqueta **VIP** move o card para a coluna **VIP** (agrupa todos os VIP); fica **fora** do SLA e das métricas (coringa). A borda roxa destaca que é VIP.
- ⚪ **Sem cor — dentro do prazo.** A cor **some/volta ao normal** assim que você move o card de etapa (ou ganha/perde).

**O sino de SLA e as notificações:**

- Você é **notificado (sino + som)** quando um card seu entra no **vermelho** (atraso). O **amarelo é só aviso visual** na borda — sem notificação, para não virar ruído.
- O **sino de SLA** no topo mostra quantos cards estão **em atraso** e abre a **lista** (cliente, funil, etapa, há quanto tempo parado); clique num item para abrir a conversa e resolver.
- Resolveu ou avançou? **Mova o card** de etapa: o alerta fecha e a cor volta ao normal na hora.

## 1.5 Follow-up — a régua automática

O CRM tem uma **régua de follow-up** que não deixa lead esfriar por esquecimento:

- Passou o prazo da etapa de follow-up sem o cliente responder, o sistema **move o card para o próximo FU e cria uma tarefa para você** ("enviar FU2 até 14h"). Cadência: **FU1 no 2º-3º dia**, **FU2 no 4º-6º**, **FU3 no 7º**.
- **O sistema NÃO manda mensagem para o cliente sozinho.** Ele só te organiza: move a etapa e cria a tarefa. **Quem fala com o cliente é você** — mensagem a cliente é decisão humana (regra de segurança da operação).
- Chegou ao fim da régua sem resposta → o card vira **Perdido "Sem resposta"** automaticamente. Isso é saudável: tira o morto da sua carteira e alimenta a reaquisição.
- Um follow-up bom retoma com **valor** (novidade, condição, dúvida pendente), não um "e aí, fechou?".

## 1.5b Áreas de parking — A Prazo e VIP

Entre **Aguardando pagamento** e **Vendido** há duas colunas de "parking": cards que ficam de lado, **fora do SLA e das métricas**, sem penalizar você.

**A Prazo (azul) — recontato agendado:**

- Cliente pediu para ser contatado depois ("me chama daqui 7 dias")? No painel do negócio, em **A Prazo (recontato)**, escolha os **dias** e clique **Colocar A Prazo**.
- O card ganha **borda azul**, vai para a coluna A Prazo e **entra na sua agenda**: um lembrete no dia do prazo, com **aviso 24h antes** (e no próprio dia) para você lembrar de mandar a mensagem ao cliente.
- Enquanto está lá, **não conta nas métricas nem gera alerta de SLA** (o cliente pediu para esperar).
- **Volta sozinho para Em atendimento** quando o prazo vence (pediu 7 dias → no 8º dia volta), removendo a etiqueta azul — o ciclo recomeça. Se **você** mover antes, ou o **cliente responder** antes, ele sai de A Prazo na hora.
- O sistema **não manda mensagem ao cliente** — só te organiza e avisa. Quem fala com o cliente é você.

**VIP (roxo) — cliente coringa:**

- Marque o cliente com a etiqueta **VIP**: o card vai para a **coluna VIP**, onde todos os VIP ficam agrupados, com **borda roxa**.
- VIP é **coringa**: fica **fora do SLA e das métricas** (nunca amarelo/vermelho, não penaliza). Remover a etiqueta VIP devolve o card para Em atendimento.

## 1.6 Regras de ouro (as que mais dão problema quando ignoradas)

- **Valor da venda — a armadilha nº 1.** O valor que conta é `valorAjustado` **se estiver preenchido**; senão, `valor`. Ou seja: um **`valorAjustado = 0` esquecido zera a venda em silêncio**. Ao registrar o ganho, confira o valor efetivo. `valor` = pedido todo (produtos + frete); `valorProdutos` = só os itens.
- **Mensagem que você manda (saída) não cria nem reabre negócio.** Só a mensagem que o **cliente** manda (entrada) movimenta o funil. Campanha de reativação saindo não "ressuscita" card sozinha.
- **Cliente já perdido não reabre** só porque mandou mensagem — enquanto o prazo de perdido não vence e o card não é arquivado. O selo de "já foi perdido" fica para sempre no histórico.
- **O dono é a fonte da verdade do roteamento.** Transferência de vendedor move os leads, negócios **abertos** e conversas — mas **preserva o vendedor histórico nos negócios já fechados** (não se reescreve dado financeiro).
- **Faturamento conta por "houve ganho no período", não pelo status atual do card.** Uma venda ganha hoje que reabrir amanhã ainda conta como venda de hoje.

## 1.7 Encerramento — ganhou ou perdeu, sempre com motivo

Perder bem é tão importante quanto ganhar: o motivo certo alimenta a reaquisição e as métricas. A lista é **fechada** (não existe "Outro" — se falta um motivo, avise o gestor para incluir).

**PERDIDO** (não vendeu, mas era cliente de verdade):
- **Sem resposta (fim da régua)** · entra na reaquisição
- **Preço acima do esperado** · entra na reaquisição
- **Frete caro ou prazo longo** · entra na reaquisição
- **Comprou de concorrente** · entra na reaquisição
- **Comprou no marketplace/site da SIXXIS** · _não_ reaquisição (já é nosso cliente)
- **Adiou a compra / sem orçamento agora** · entra na reaquisição
- **Produto não atende** (tamanho, área, voltagem, modelo) · entra na reaquisição
- **Pediu para não ser contatado** · _não_ reaquisição (respeitar sempre)

**DESQUALIFICADO** (nem era oportunidade — **não conta contra a sua conversão** e não entra em follow-up/reaquisição):
- Número errado / contato inválido · Spam · Fornecedor / não é cliente · Busca emprego · Fora da área de atendimento · Produto que a SIXXIS não vende

Regra prática: se não dava para vender porque **não era cliente**, é **Desqualificado** (não te penaliza). Se era cliente e não rolou, é **Perdido** (com o motivo certo).

## 1.8 Métricas e metas — o que te cobram e como ler

Tudo é recortado por período (Hoje / 7d / 15d / 30d / custom), por **finalidade** (Venda) e por **vendedor**.

| Métrica | O que mede | Verde | Amarelo |
|---|---|---|---|
| **1ª resposta no prazo** | % de conversas respondidas dentro do prazo (padrão ≤1h) | ≥ 80% | ≥ 50% |
| **Tempo médio da 1ª resposta** | média do tempo-online até responder (olhe também a **mediana**, que não é enganada por extremos) | ≤ 5 min | ≤ 30 min |
| **Conversão** | ganhos ÷ (ganhos + perdidos) finalizados no período (abertos não entram; desqualificado não penaliza) | ≥ 40% | ≥ 25% |
| **Cobertura de funil** | pipeline aberto ponderado ÷ meta que falta (QUENTE 0,8 · MORNO 0,5 · FRIO 0,2) | ≥ 3× | ≥ 2× |
| **Sem próximo passo** (menor é melhor) | % de abertos sem lembrete/tarefa marcado | ≤ 20% | ≤ 40% |

Outras que o painel acompanha: **valor vendido** (Σ do valor efetivo dos ganhos), **ticket médio** (valor vendido ÷ nº de ganhos), **ciclo médio Novo→Ganho** (em dias úteis), **parados** (abertos sem interação há >7 dias), **distribuição da 1ª resposta** (histograma <5min / 5–15 / 15–60 / 1–4h / 4–24h / >24h) e **Pareto de motivos de perda**.

**Metas** podem ser definidas por **colaborador** ou **equipe**, no período **diário/semanal/mensal/custom**, sobre: valor vendido, quantidade de ganhos, conversão, clientes atendidos, tempo de resposta, tempo de resolução.

**Como melhorar cada farol, na prática:**
- 1ª resposta vermelha → fique online no começo do dia, ataque a fila da noite antes das 9h.
- Conversão baixa → trabalhe o follow-up e **classifique perda certo** (desqualificado não derruba conversão).
- Cobertura baixa → falta pipeline: prospecte / peça mais lead.
- "Sem próximo passo" alto → disciplina de sempre deixar um lembrete ao sair do card.

## 1.9 Reaquisição — a segunda chance do perdido

Todo mês o CRM junta os **perdidos elegíveis** (os motivos marcados "entra na reaquisição") e organiza uma campanha de reativação em janela: **6º dia útil (R1) → 8º (R2) → 10º (fim)**. O cliente que volta vira **Reativado**; o que não responde até o fim vira **Perdido definitivo**.
**Importante:** o **envio ao cliente é sempre armado por um gestor** (admin) — a campanha não dispara mensagem sozinha. É a mesma trava do item 1.5: falar com cliente é decisão humana.

## 1.10 O que NÃO fazer (erros clássicos)

- Deixar cliente na etapa "Novo" por horas. (SLA estoura, cliente esfria.)
- Mover para "Vendido" um cliente que já comprou e só voltou tirar dúvida → use o fluxo de **Pós-venda / Encerrar**; não crie uma venda falsa.
- Registrar ganho com `valorAjustado = 0` pendurado → zera a venda sem avisar.
- Deixar card aberto sem próximo passo.
- Fechar como "Perdido" algo que é **Desqualificado** (e se auto-penalizar na conversão) — ou o contrário.
- Esquecer de voltar **online** → você para de receber leads e nem percebe.

---

# PARTE 2 — PÓS-VENDA

Objetivo da operação de Pós-venda: resolver o que o cliente precisa **depois da compra** (dúvida, troca, garantia, peça, orçamento de serviço) com rapidez e sem deixar ninguém sem retorno — e registrar o desfecho certo para o histórico e as métricas.

## 2.1 O atendimento perfeito em 6 princípios

1. **Pós-venda é retenção.** Um problema bem resolvido fideliza; mal resolvido vira reclamação pública e cliente perdido para sempre.
2. **Toda demanda tem dono.** No pós-venda o responsável é o **dono de pós-venda** do cliente (campo próprio, separado do vendedor da venda).
3. **Status honesto do card.** "Aguardando cliente" é diferente de "Em atendimento". O card tem que dizer a verdade de quem está com a bola.
4. **Fechar com desfecho.** Resolveu → **Resolvido**. Não dava para resolver → **Encerrado sem solução** (com o porquê). Nada fica pendurado.
5. **Rápido no primeiro retorno, rápido na resolução.** As duas coisas são medidas: tempo até a 1ª resposta **e** tempo total de resolução.
6. **A bola nunca para com a gente.** Enquanto depende da SIXXIS (orçar, buscar peça, analisar), o relógio corre contra nós.

## 2.2 O sistema operacional do dia (rotina)

Mesma base da Venda — **horário comercial, dias úteis, sem feriado** — adaptada para resolução:

**Início do dia:**
- Entre **online**. Demandas de pós-venda são entregues em rodízio para quem está online; cliente que já tem dono de pós-venda espera o dono voltar.
- Ataque a **fila da noite** (mensagens fora do expediente) **até as 9h**.
- Olhe os **casos parados** (abertos sem interação há >7 dias _(ajustável)_) e os **alertas de SLA**: resolva os **vermelhos** (em atraso) primeiro, de olho nos **amarelos** (vencendo).

**Durante o dia:**
- Primeiro retorno rápido, mesmo que seja "recebi, estou verificando".
- **Mova o card** conforme o caso anda (Aberto → Análise → Em atendimento → Aguardando cliente → Resolvido) e **use as etiquetas** de estado (orçamento, pagamento, peça).
- Sempre com **próximo passo** marcado.

**Fim do dia:**
- Nenhum caso sem próximo passo; **offline** ao encerrar.

## 2.3 O funil de Pós-venda, etapa por etapa

6 etapas. As **abertas** (Aberto até Aguardando cliente) são casos vivos; **Resolvido** é o ganho (caso bem-sucedido); **Encerrado sem solução** é o fim sem resolução.

| # | Etapa | O que significa | O que você faz |
|---|---|---|---|
| 1 | **Aberto** | Demanda recém-chegada, sem triagem | Dar o 1º retorno, entender o que o cliente precisa |
| 2 | **Análise** | Triagem: entendendo o caso antes de atender | Identificar tipo (dúvida/troca/garantia/peça/orçamento), encaminhar |
| 3 | **Em atendimento** | Caso em andamento, a bola está com a gente | Executar: orçar, buscar peça, acionar garantia, responder |
| 4 | **Aguardando cliente** | A bola está com o cliente (aprovar orçamento, enviar dado, pagar) | Aguardar — mas com lembrete para cobrar se ele sumir |
| 5 | **Resolvido** | GANHO — caso solucionado | Registrar o **tipo de ganho** e encerrar |
| 6 | **Encerrado sem solução** | Fim sem resolução (cliente desistiu, inviável) | Registrar o motivo |

**Etiquetas de estado** (organizam a carteira dentro das etapas): **Aguardando orçamento** · **Aguardando pagamento** · **Orçamento aprovado** · **Aguardando peça**. Use-as para saber de relance onde cada caso travou.

> **Regra importante (armadilha):** cliente que **já comprou** e volta só para uma dúvida ou acompanhamento **não deve ser movido para "Vendido" de novo** no funil de venda — isso cria uma **compra falsa** e infla o faturamento. O lugar dele é o Pós-venda; o desfecho é **Resolvido** ou **Encerrado sem solução**.

## 2.4 Tempo, SLA e as cores do card

- Prazo contado em **tempo útil** (horário comercial, dias úteis, sem feriado), igual à Venda.
- Mede-se o **tempo até a 1ª resposta** (tempo-online do dono) **e** o **tempo de resolução** (quanto o caso levou do Aberto ao Resolvido).
- O SLA cobra as etapas **Aberto**, **Análise** e **Em atendimento**. **Aguardando cliente** é onde a bola está **com o cliente** — essa etapa **não gera alerta** (o atraso não é nosso).
- O SLA por etapa é configurável por finalidade (Pós-venda) na aba do Supervisor.

**O semáforo do card** (igual à Venda): 🟡 **amarelo** = faltam ≤12h úteis para vencer (aviso); 🔴 **vermelho** = prazo vencido (atraso); 🟣 **roxo** = cliente **VIP** (fora da cobrança de SLA, só destaque); ⚪ **sem cor** = dentro do prazo. A cor volta ao normal quando você move o card.

**Sino e notificações:** você é **notificado (sino + som)** só quando um caso seu entra no **vermelho** (atraso); o amarelo é visual. O **sino de SLA** no topo lista o que está em atraso — clique para abrir e resolver.

## 2.5 Follow-up e cobrança

- Caso em **Aguardando cliente** há tempo demais (cliente não aprovou orçamento, não pagou, não mandou o dado) → crie/mantenha um **lembrete** para cobrar. Assim como na venda, o sistema te organiza, mas **quem fala com o cliente é você**.
- Mensagens de acompanhamento pós-compra (agradecimento, pesquisa de avaliação, "está tudo certo com seu pedido?") existem como **modelos prontos** no CRM — use-os, mas o disparo é humano.

## 2.6 Regras de ouro

- **Dono de pós-venda ≠ vendedor da venda.** São campos separados. A responsabilidade do caso é do dono de pós-venda.
- **Status honesto.** Não deixe em "Em atendimento" o que na verdade está "Aguardando cliente" — isso falseia o SLA e esconde quem está travando.
- **Resolver ≠ vender.** Pós-venda não gera faturamento de venda nova. Se virou uma **nova compra**, isso é um negócio de **Venda** à parte — não transforme o caso de pós-venda em venda.
- **Encerrar com motivo.** "Encerrado sem solução" sempre com o porquê (cliente desistiu, fora de garantia, inviável), para o histórico e as métricas.

## 2.7 Métricas e metas

Recorte por período, finalidade **Pós-venda** e por colaborador.

| Métrica | O que mede | Referência _(ajustável)_ |
|---|---|---|
| **1ª resposta no prazo** | % de casos com primeiro retorno dentro do prazo | ≥ 80% verde · ≥ 50% amarelo |
| **Tempo médio da 1ª resposta** | média do tempo-online até o 1º retorno (ver também mediana) | ≤ 5 min verde · ≤ 30 min amarelo |
| **Tempo de resolução** | média do tempo (útil) do Aberto ao Resolvido | menor é melhor |
| **Sem próximo passo** | % de casos abertos sem lembrete/tarefa | ≤ 20% verde · ≤ 40% amarelo |
| **Parados** | casos abertos sem interação há > 7 dias | menor é melhor |

Os **ganhos de pós-venda** são classificados por **tipo de ganho** (categorias de resolução), separados dos ganhos de venda — então o painel mostra quantos casos foram resolvidos e de que natureza. **Metas** de pós-venda podem ser por tempo de resposta, tempo de resolução e clientes atendidos, por colaborador ou equipe.

## 2.8 O que NÃO fazer

- Transformar acompanhamento pós-compra em "Vendido" (cria faturamento falso).
- Deixar caso em "Em atendimento" quando a bola já voltou para o cliente (use "Aguardando cliente").
- Fechar "Resolvido" sem o tipo de ganho, ou "Encerrado" sem motivo.
- Caso parado em "Aguardando cliente" sem nenhum lembrete de cobrança → ele some e o cliente fica com a sensação de abandono.
- Esquecer de voltar **online** → não recebe novas demandas.

---

## Apêndice — glossário rápido

- **Dono / Dono de pós-venda:** vendedor responsável pelo cliente (venda) ou pelo caso (pós-venda). Fonte da verdade do roteamento.
- **Etapa aberta / ganho / perdido:** tipo da coluna no funil. Aberta = negócio/caso vivo; Ganho = Vendido/Resolvido; Perdido = Perdido/Encerrado sem solução.
- **SLA:** prazo máximo que um card pode ficar numa etapa antes de gerar alerta. Contado em tempo útil. A borda do card sinaliza: **amarelo** = faltam ≤12h para vencer; **vermelho** = vencido/atraso; cor volta ao normal ao mover de etapa.
- **VIP:** cliente com a etiqueta **VIP** — vai para a **coluna VIP** (coringa), fica **fora** do SLA e das métricas e ganha **borda roxa** no card.
- **A Prazo:** coluna/etiqueta **azul** de recontato agendado — cliente pediu X dias; card parado ali (fora do SLA e das métricas) com lembrete na agenda (aviso 24h antes), volta sozinho para Em atendimento no vencimento.
- **Sino de SLA:** indicador no topo que conta os cards **em atraso** (vermelho) e abre a lista do que precisa ser resolvido; notifica o dono na virada para o vermelho.
- **Régua de follow-up:** sequência automática FU1→FU2→FU3 que move o card e cria tarefa (não fala com o cliente).
- **Valor efetivo:** `valorAjustado` se preenchido, senão `valor`. O que conta no faturamento.
- **Presença (online/offline):** estado ao vivo do vendedor; só quem está online recebe lead; tempo offline não pesa nas métricas.
- **Tempo útil:** relógio que só corre em horário comercial, dias úteis, fora de feriados.
- **B2B:** revenda/empresa; dobra o prazo em Negociando.
- **Desqualificado:** não era oportunidade real; não conta contra a conversão.
- **Reaquisição:** campanha mensal que reabre perdidos elegíveis (envio sempre armado por gestor).

> Fonte: alinhado ao Manual de Atendimento Comercial SIXXIS v1.0 (2026) e ao que está implementado no CRM (funis, `slaAlertas`, `reguaFollowup`, `metricas`, `motivosPerda`, `seed`). Alvos marcados _(ajustável)_ são configuráveis na aba do Supervisor.
