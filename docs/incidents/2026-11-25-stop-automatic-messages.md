# Incidente: contenção global de mensagens automáticas

## Objetivo

Quando `ConfiguracaoCRM.mensagensAutomaticasAtivas` não for exatamente `true`, nenhuma mensagem automática pode sair para clientes de VENDA ou POS_VENDA. Mensagens enviadas deliberadamente por atendentes continuam funcionando.

## Evidência de produção em 25/11/2026

- Mestre geral e aviso fora do horário estavam desligados.
- Sol/Luna estava desligada e sem eventos nos últimos 24h.
- Não havia recaptura `ARMADA`, campanha `ENVIANDO` ou destino pendente desses fluxos.
- Não houve `Mensagem OUT viaIA=true` nos últimos sete dias.
- As seis instâncias da Evolution tinham zero `evolutionBot` configurado.
- No pós-venda, mensagens que apareceram no CRM durante a investigação eram webhooks `fromMe=true` recebidos em lote com cerca de 2–4 horas de atraso; o `messageTimestamp` era anterior ao recebimento pelo CRM.

## Causa técnica corrigível

O campo documentado como interruptor mestre era consultado apenas pelo aviso fora do horário. Sol/Luna, recaptura e campanhas em massa possuíam controles próprios e podiam ignorar o mestre geral se fossem ativados futuramente.

## Requisitos

1. O mestre precisa bloquear, no limite imediatamente anterior ao I/O externo, aviso fora do horário, respostas da Sol/Luna, recaptura e campanhas em massa (WhatsApp, SMS e e-mail).
2. Ausência de configuração e falha ao consultar o mestre devem falhar fechado.
3. A Sol deve evitar inclusive gerar resposta quando o mestre estiver desligado.
4. Recaptura bloqueada pelo mestre deve pausar; campanha em massa bloqueada deve cancelar, preservando os destinos ainda pendentes.
5. Envios humanos das rotas `api/mensagens/**` e dos fluxos manuais de orçamento/cobrança não passam pelo gate automático.
6. Sem alteração de schema ou exclusão de histórico.

## Contenção implementada

- Um executor central consulta o mestre sem cache e falha fechado para valor
  ausente, diferente de `true` ou erro de leitura.
- Campanhas (WhatsApp, SMS e e-mail), aviso fora do horário, bolhas da Sol e
  recaptura consultam esse executor imediatamente antes do I/O externo.
- A Sol também revalida antes do provedor de IA e antes do handoff; OFF entre
  bolhas interrompe o restante do fluxo sem criar lembrete automático.
- A recaptura devolve atomicamente a vaga reservada se o mestre desligar durante
  o jitter e só então pausa a campanha.
- O último limite de I/O relê também o estado operacional: campanha ainda
  `ENVIANDO` e recaptura ainda `ARMADA`. Stop manual durante o jitter/leituras
  bloqueia o destinatário em voo; na recaptura, a cota é devolvida sem sobrescrever
  o motivo da pausa manual.
- Erro ao consultar o mestre é distinguido de mestre desligado nos logs e no
  resultado interno, mantendo os dois estados bloqueados.
- O contrato C29 cobre 14 cenários, incluindo promessas controladas ON→OFF, ordem
  `mestre → estado → mestre → I/O`, decremento único da cota, corridas da Sol e
  bypass humano.
