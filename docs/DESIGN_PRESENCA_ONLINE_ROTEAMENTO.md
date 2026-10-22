# Desenho — Presença online do vendedor (métrica + roteamento + UI)

Status: APROVADO pelo Luccas em 2026-10-22; build autorizado na branch
`wip/atendimento-omnichannel-provider-abstract`. Deploy/migration = catraca (só
com "pode subir" direto).
Supersede: `DESIGN_METRICAS_HORARIO_COMERCIAL.md` (horário fixo → presença real).

## Intenção e porquê

Medir atendimento pela **presença real** do vendedor (logado + online), não por
um horário comercial fixo. Assim a métrica fica justa de forma automática (almoço,
folga, noite, sábado = estar offline) e o **mesmo sinal de disponibilidade governa
a entrega de leads** (só quem está online recebe). Um sistema, duas consequências:
métrica honesta e distribuição justa.

## Presença — fonte da verdade

- Estado por vendedor: **ONLINE / OFFLINE**.
- **Fica online:** ao logar e/ou pelo toggle no header.
- **Fica offline:** pelo toggle, ou **auto-offline por inatividade**.
- **Inatividade:** 15 min sem atividade → modal **"Você ainda está online?"** com
  **contagem de 1 minuto**; sem resposta no prazo → vendedor vai pra **OFFLINE**
  automaticamente.
- **"Atividade"** = interação real no app (navegação/ações/mensagens enviadas pelo
  vendedor no CRM), reportada por heartbeat enquanto a aba está ativa.
- **Persistência:** períodos de presença ONLINE (início/fim) por vendedor — base
  para a métrica somar "tempo online" — + o estado atual. Migration **aditiva**.

## UI (header)

- **Ícone/indicador online/offline no HEADER**, ao lado dos ícones de dark mode,
  notificação e alerta. **Clicável** para alternar. Verde = online, cinza =
  offline (tokens `var(--color-*)`, theme-aware).
- **Modal de inatividade** global (countdown de 1 min) com botões "Continuo
  online" / "Ficar offline".

## Socket hardening (dependência real)

Hoje a camada de tempo real é **broadcast puro** e as salas `agente:<id>`
(`sinalizacaoChamada.ts`) entram por um `agenteId` **vindo do cliente, sem
autenticar** — não dá pra confiar nisso para decidir "quem está online" se isso
governa roteamento e métrica (falsificável). **F7.0:** autenticar o handshake do
socket com a sessão real do vendedor antes de confiar na presença. Pré-requisito
do subsistema.

## Métrica por presença

- Tempo de resposta = **tempo ONLINE do vendedor dono** entre o contato do cliente
  e a 1ª resposta. Períodos offline não contam.
- Função: `segundosOnlineEntre(agenteId, inicio, fim): number` — soma a interseção
  de `[inicio, fim)` com os **períodos de presença ONLINE** daquele vendedor.
  Substitui a ideia de `segundosAbertoEntre` (horário fixo) do doc supersedido.
- **Exata daqui pra frente** (presença é ao vivo). Para o passado sem dados de
  presença, **fallback = delta cru** (igual a hoje; a métrica nunca regride).
- **Escopo sistema todo:** Supervisor + dashboard do colaborador + `GeralAdmin`
  leem o mesmo `calcularMetricas`; o `AVG(EXTRACT(EPOCH ...))` cru de
  `src/lib/metricas.ts` vira busca-linhas + cálculo em JS com `segundosOnlineEntre`.
- **Alerta "parado"**: dispara em **tempo real (wall-clock)** como hoje (não atrasar
  paginação do time); só o **número exibido** no Supervisor usa tempo-online.

## Roteamento por presença

- **Lead NOVO sem dono:** entra em **rodízio um-pra-cada** SÓ entre vendedores
  **ONLINE** da finalidade. Um único online → recebe todos.
- **Cliente que JÁ tem dono:** **espera o dono voltar** — mantém "um cliente, um
  vendedor". **Não** re-entrega a outro quando o dono está offline.
- **Ninguém online:** lead novo fica **sem dono em fila**, atribuído ao **próximo
  vendedor que ficar online** (rodízio retoma). (Detalhe de fila: builder.)
- Toca `src/lib/roteamento.ts` (`rotearLeadNovo`) + a lógica de rodízio: o conjunto
  de candidatos passa a ser "online agora", não "todos ativos".

## Metas / não-metas / anti-metas

- **Meta:** métrica por tempo online real; entrega só a quem está online, rodízio
  justo; presença confiável e fácil de alternar.
- **Não-meta:** re-entregar cliente que já tem dono; aplicar presença a dias/horas
  fixos (presença substitui isso); recalcular o passado (sem dados).
- **Anti-meta:** presença falsificável governando roteamento; alerta "parado"
  atrasando por causa de tempo-online; vendedor online "fantasma" (por isso o
  auto-offline por inatividade).

## Peças a construir (ordem de risco)

1. **Captação Ativa** (projeto separado, independente — `DESIGN_CAPTACAO_ATIVA.md`):
   primeiro, baixo risco.
2. **Presença (fundação):** schema de presença (aditivo) + socket autenticado
   (F7.0) + heartbeat + estado online/offline + toggle no header + modal de
   inatividade (15min → 1min → auto-offline).
3. **Métrica por presença:** `segundosOnlineEntre` + aplicar em `metricas.ts` /
   `indicadores.ts` / `painel.ts` (sistema todo) + teste de contrato dourado.
4. **Roteamento por presença:** candidatos = online; rodízio um-pra-cada; cliente
   com dono espera; fila quando ninguém online.

## Deixado para o builder

- Intervalo do heartbeat; shape exato da tabela de presença (períodos vs. estado +
  log); ponto exato do hardening do handshake; UX fina do modal; comportamento de
  fila quando ninguém online; como exibir "tempo online" na UI (tooltip).
- Migration aditiva (sem DROP/TEMP), provada contra o schema de produção via
  transação com ROLLBACK antes de considerar pronta.

## Gate

Build na `wip` autorizado (gates verdes + receitas). Migration e deploy para `main`
(Railway) são catraca cheia — só com OK direto do Luccas no momento de subir.
