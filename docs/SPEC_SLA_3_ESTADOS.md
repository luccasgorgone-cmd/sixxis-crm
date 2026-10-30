# SPEC — SLA em 3 estados (amarelo/vermelho) + VIP + reinício de marcação

Pedido do Luccas (30/10/2026). Classificação: **Architectural** (schema + motor +
serializer + UI + limpeza one-time). Plano antes de codar (Art. 14).

## Objetivo

Hoje o card só tem 2 estados: normal e **vermelho** (prazo da etapa estourado).
Passar para 3 estados com aviso antecipado, excluir VIP e reiniciar a marcação:

1. **Amarelo** — aviso de que o prazo da etapa está vencendo (faltam ~12h).
2. **Vermelho** — prazo vencido / em atraso (limiar a confirmar — ver "Pendência").
3. **VIP** — cliente com etiqueta `VIP` fica FORA da marcação de SLA (sem amarelo
   nem vermelho) e ganha uma **borda roxa** no card (além da etiqueta que já tem).
4. **Reinício** — limpar as notificações de SLA atuais e recomeçar a marcar a
   partir de agora. Quem já está vencido pode ficar vermelho; conforme for
   resolvido / mudar de etapa, a cor volta ao normal e o alerta sai (já funciona).

## Modelo de estados (por negócio ABERTO, não-VIP)

Seja `decorrido` = tempo na etapa (em horas, no modo configurado — útil se
`slaEmDiasUteis=on`) e `limiar` = prazo da etapa (ConfigAlertaSla, com dobro B2B
em Negociando). Define-se `margemAmarelo = 12h`:

- `decorrido < limiar - margemAmarelo` → **sem marcação** (normal).
- `limiar - margemAmarelo <= decorrido < limiar` → **AMARELO** (vencendo).
- `decorrido >= limiar` (+ regra do vermelho, ver Pendência) → **VERMELHO**.

Etapas de prazo curto (`limiar <= 12h`, ex. Novo=60min, Em atendimento=1 dia):
a janela amarela é `[0, limiar)` — o card já nasce amarelo e vira vermelho ao
estourar. Comportamento aceitável (prazo curto = aviso curto).

## Pendência a confirmar com o Luccas (bloqueia implementação)

O enunciado "amarelo 12h para vencer ... **somente depois das 18hrs ficar
vermelho**" é ambíguo. Opções:
- (A) Vermelho = assim que o prazo vence (amarelo nas 12h antes). [recomendado]
- (B) Vermelho = 6h DEPOIS de vencer (carência; ~18h após o amarelo começar).
- (C) Vermelho = só após as 18:00 do dia em que vencer.
E as 12h/18h contam em horas ÚTEIS (horário comercial, como o resto do SLA) ou
corridas (relógio de parede)? [recomendado: úteis]

## Implementação (após confirmação)

### Schema (migration ADITIVA, zero DROP)
- `AlertaNegocio.nivel` enum `AlertaNivel` (`AMARELO` | `VERMELHO`), default
  `VERMELHO` (compatível com os alertas atuais, que nasceram como atraso).
- `ConfiguracaoCRM.slaMarcacaoReiniciada` boolean default false (sentinela do
  reinício one-time).

### Motor (`slaAlertas.ts`)
- Resolver o id da etiqueta `VIP` uma vez (como já faz com `B2B`). Negócio cujo
  lead tem VIP: **nunca** cria alerta; se tiver alerta aberto, resolve (sai da cor).
- Criar o alerta já na entrada da janela AMARELA; subir para VERMELHO ao cruzar
  o limiar. Em cada passo (60s) atualizar `nivel` se mudou.
- **Notificar o dono SÓ na transição para VERMELHO** (amarelo é visual, sem
  notificação, pra não gerar ruído). Resolver ao mover/ganhar/perder (já existe).

### Serializer (`serializar.ts`)
- Expor `slaNivel: "AMARELO" | "VERMELHO" | null` a partir do alerta aberto.
- Expor `vip: boolean` (lead tem etiqueta VIP).

### Card (`CardNegocio.tsx`) — prioridade: VIP > vermelho > amarelo > normal
- VIP → borda/halo **roxo** (`ring-purple-500`), sem marcação de SLA.
- `slaNivel==="VERMELHO"` → borda vermelha + relógio vermelho (como hoje).
- `slaNivel==="AMARELO"` → borda âmbar + relógio âmbar ("vencendo").
- senão → normal.

### Sino / notificações
- Contador e lista do sino continuam sobre o **VERMELHO** (o que está em atraso).
  Amarelo é só visual no card.

### Reinício one-time (seed guardado por `slaMarcacaoReiniciada`)
- Se `slaMarcacaoReiniciada=false`: marcar como lidas as `Notificacao` tipo `SLA`
  não lidas (limpa a enxurrada do deploy anterior) e setar o flag true. Roda uma
  vez só. NÃO reseta o relógio das etapas (quem está vencido continua vencido →
  vermelho, como o Luccas pediu).

## Gates e teste
- `tsc --noEmit` exit 0; 14/14 contratos dourados.
- Contrato novo/ampliado para o cálculo dos 3 estados (amarelo/vermelho/limpo,
  VIP fora), puro, sem banco.
- Deploy: push → Railway; confirmar success via GitHub deployment status.
