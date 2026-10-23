# Plano de implementação — Manual de Atendimento Comercial SIXXIS (v1.0 2026)

> Gap analysis (código atual vs. manual) + plano em fases. Base: manual recebido 23/10 (20/23 págs — faltam 21-23 Governança/monitoramento/implantação). Classificação Artigo 14: **Architectural**. Nada implementado ainda — este doc é o plano para aprovação.

## Princípio de segurança desta implementação
O manual fala em "enviar FU1/FU2/FU3", "enviar oferta de reaquisição" etc. **Mensagem a cliente é catraca.** Portanto toda automação aqui **move etapa + cria a próxima ação (lembrete/tarefa) para o vendedor**, nunca dispara mensagem ao cliente sozinha — exceto onde já existe mecanismo aprovado (motor de recaptação, que só envia quando o admin ARMA a campanha). A Sol/Luna segue `ativo=false`.

---

## Gap analysis consolidado (o que já temos)

### A. Funil & etapas
- Etapas Novo / Em atendimento / Negociando / FollowUp-1/2/3 / Vendido(Ganho) / Perdido → **EXISTEM** (configuráveis por admin, `model Etapa`, seed `src/lib/seed.ts`). Extra atual: "Aguardando pagamento".
- **Desqualificado separado de Perdido → AUSENTE** (`StatusNeg` só ABERTO/GANHO/PERDIDO).
- Etapa "Reaquisição"/"Reativado" → **AUSENTE**.

### B. Motor de SLA / tempo
- SLA por (finalidade, etapa) via `ConfigAlertaSla.minutosParaAlerta` + `slaAlertas.ts` → **EXISTE**, mas em **minutos corridos** (tempo de parede), não dias úteis.
- **Dias úteis / horário comercial / feriados no relógio do SLA → AUSENTE** (horário comercial existe em `horario.ts` só pra auto-reply).
- **B2C 5d vs B2B 10d → AUSENTE** (`Segmento` VAREJO/ATACADO existe no Lead mas não afeta prazo).
- Prazos do manual (Novo ≤1h, Em atend. 1d, FU1 2d/FU2 3d/FU3 1d) → **não semeados**.
- **"Bola com quem" (pausar relógio quando a bola está com o cliente) → AUSENTE**.
- 1º contato ≤15min/≤1h → **EXISTE parcial** (`primeiraRespostaDb.ts` mede por tempo-online, limiar único configurável; não há ≤15min E ≤1h ao mesmo tempo, nem "hora útil").
- Fila da noite (responder até 9h) → **PARCIAL** (só auto-reply fora do horário; sem fila/priorização).
- Lead vencido + auto-mover etapa na revisão da manhã → **AUSENTE** (há alerta de SLA e arquivamento de FECHADOS; nenhum job move ABERTO de etapa por prazo).

### C. Follow-up
- Régua automática FU1(D2-3)/FU2(D4-6)/FU3(D7), até 14h → **AUSENTE** (só `Lembrete`/`Tarefa` manuais one-off).
- Regra de retorno (interação volta p/ Em atendimento/Negociando; limite 1) → **PARCIAL**: reabre negócio, mas sempre p/ "Novo" (`garantirNegocioParaLead`), **sem limite** (só `vezesPerdido`, sem teto).

### D. Motivos de perda
- Lista fixa `motivosPerda.ts` (12 códigos) obrigatória **só na UI** (`ModalFechamento.tsx`); a **API aceita texto livre** (`/api/negocios/[id]` não valida com `ehCodigoMotivo`). Não bate com a lista do manual (faltam Frete, Marketplace/site, Adiou, Produto-não-atende, Pediu-não-contatar; sobram SEM_INTERESSE/CONFUSO/SO_PESQUISANDO/PAGAMENTO). **Desqualificado não é distinto de Perdido.**

### E. Reaquisição mensal
- Motor de recaptação em ondas `recaptacao.ts` → **EXISTE** (disparo manual, cota diária, opt-out, trava de reenvio). **MAS**: sem gatilho "6º dia útil", público hoje é lead **ABERTO sem resposta** (não Perdidos), sem etapa "Reaquisição", sem janela R1(6º)/R2(8º)/fim(10º), sem estados "Reativado"/"Perdido definitivo".

### F. Prospecção ativa (Fase 2)
- Aba "Captação Ativa" → **EXISTE só como medição** (leads `origem="manual"`: captados/conversão/R$/ranking/série, por coorte).
- Lote 50/semana, 10/dia, cadência 4 semanas (Abordagem→Qualificação→Proposta→Fechamento), ≥5 tentativas em 2 canais, "Perdido — Nutrição" volta em 90d, meta diária 10+10 → **AUSENTES**.

### G. KPIs (painel do Supervisor hoje: 6 cards + funil/parados/perdas/origens/ranking + histograma 1ª resposta)
- **EXISTEM**: 1ª resposta no prazo (≤1h default), conversão, ticket, cobertura, com/sem próximo passo, tempo médio 1ª resposta, leads vencidos (parados), Pareto de motivos, ranking/receita por vendedor, conversão da Sol + taxa de handoff (em `MetricasSol`, módulo à parte).
- **PARCIAIS**: ≤15min (só faixa no histograma), conversão por etapa (é ocupação/ciclo, não taxa degrau→degrau), ciclo médio (GANHO+PERDIDO em seg, não Novo→Ganho em dias), receita por origem (string livre, sem buckets passivo/prospecção/reaquisição), volume diário por vendedor (série existe, sem card), dois números (schema sim, métrica não).
- **AUSENTES**: mediana da 1ª resposta, fila-noite %, follow-ups no prazo %, motivo de perda preenchido %, meta diária de prospecção, taxa de qualificação/desqualificação por campanha, vendas recuperadas por follow-up, taxa de reativação (no painel), prospecção taxa de resposta/qualificação, conversão das transferências, custo por venda por número.

### H. Canais / agente / qualificação
- Múltiplos números (`InstanciaWhatsApp`, provider Evolution/Cloud) → **EXISTE** (infra); papel "número do agente × número dos vendedores" + verba → **AUSENTE** (só `finalidade` VENDA/POS_VENDA). Luna/Sol → **EXISTE, dormente** (`ConfigAgenteIA.ativo=false`; `instanciasAtendidas` separa o que a IA atende).
- Handoff agente→humano → **PARCIAL** (para a Luna + cria Lembrete/Notificação; **sem** etiqueta "transferido do agente" nem entrada como "Novo").
- Etiquetas → **EXISTEM**; etiqueta/flag **B2B → AUSENTE** (nenhuma etiqueta muda prazo).
- Segmento + tipoEstabelecimento → **EXISTEM**; flag "Interessado"/qualificação de interesse → **PARCIAL** (só produtos de interesse + prompt da Luna, nada persistido).

---

## Plano em fases (ordem recomendada por dependência + valor/risco)

### Fase 0 — Fundação de tempo útil (keystone) ⭐ recomendo começar aqui
Sem isso, "vencido", régua de FU e metade dos KPIs ficam errados (contam fim de semana/madrugada).
- Função PURA `minutosUteisEntre(de, ate, horarios, feriados)` + `proximaAberturaUtil` (espelha o padrão puro+contrato de `tempoOnline.ts`/`segundosOnlineEntre`, com teste dourado `cNN`). Reusa `horario.ts`.
- Tabela/config de feriados (nova, pequena) + horário comercial já existe.
- `slaAlertas.ts` + `indicadores.ts (limiarParadoMs/estaParado)` ganham modo "dias úteis" (aditivo, flag por config — não quebra o corrido atual).
- Semear os prazos do manual em `ConfigAlertaSla` por etapa (Novo 60min úteis, Em atend. 1 dia útil, FU1 2d, FU2 3d, FU3 1d; Negociando 5d/10d — ver Fase B2B).
- **Risco:** médio (toca o motor de tempo), mitigado por ser aditivo + contrato dourado + prova contra prod read-only.

### Fase 1 — Motivos de perda = manual + validação dura + "Desqualificado" (baixo risco, alto valor de governança)
- Reescrever `motivosPerda.ts` para a lista fechada do manual (com flag "entra na reaquisição?" por motivo).
- Validar no backend (`/api/negocios/[id]`) com `ehCodigoMotivo` (recusar texto livre); manter obs obrigatória em alguns.
- "Desqualificado" distinto de "Perdido": novo valor em `StatusNeg` (ou flag `desqualificado`), separado nas métricas (não conta contra conversão). Migração de dados legados (mapear códigos antigos → novos).
- Self-contained; destrava Pareto fiel + taxa de desqualificação.

### Fase 2 — Régua de follow-up automática + lead vencido + regra de retorno (alto valor, risco médio)
- Novo motor (job no `server.ts`, padrão `slaAlertas.ts`): na revisão da manhã (horário comercial), move ABERTO por prazo (Em atend.→FU1→FU2→FU3→Perdido "Sem resposta") **e cria a próxima ação (lembrete "enviar FUx até 14h") para o vendedor** — NÃO envia ao cliente.
- Regra de retorno: ao chegar interação qualificada, voltar p/ Em atendimento OU Negociando (não "Novo"), com **limite de 1 retorno** (`Negocio.vezesRetorno`); 2º retorno só com aprovação. Depende de distinguir "interação qualificada" (hoje a ingestão não classifica conteúdo — decisão: heurística simples (pediu preço/frete/link) ou marcação manual do vendedor).
- Depende da Fase 0.

### Fase 3 — Reaquisição mensal alinhada ao manual (risco médio)
- Gatilho no 6º dia útil (novo tick datado); público = Perdidos elegíveis do mês anterior (por motivo, Fase 1); etapa "Reaquisição"; janela R1(6º)/R2(8º)/fim(10º); estados "Reativado"/"Perdido definitivo". Estende `recaptacao.ts` (reusa envio/opt-out/cota). Envio segue o portão manual já existente (admin ARMA) ou automatiza só o agendamento — decisão sua.

### Fase 4 — KPIs faltantes no painel (baixo risco, alto valor; muito é só leitura)
- Disciplina: ≤15min dedicado (2 limiares), mediana 1ª resposta, follow-ups no prazo %, motivo preenchido %, fila-noite % (depende Fase 0/fila), meta diária prospecção (depende Fase 5).
- Funil: conversão real degrau→degrau (via `HistoricoNegocio`), vendas recuperadas por follow-up (depende Fase 2), taxa de qualificação/desqualificação (depende Fase 1), taxa de reativação (depende Fase 3).
- Resultado: ciclo Novo→Ganho em dias úteis, buckets de origem (passivo/prospecção/reaquisição), conversão das transferências, volume diário por vendedor (card), recorte por número.

### Fase 5 — Prospecção ativa completa (Fase 2 do manual) (módulo novo, maior esforço)
- Lote semanal de 50 + distribuição 10/dia, cadência de 4 semanas por contato, tentativas por canal (≥5 em 2 canais), "Perdido — Nutrição" com retorno em 90d, metas diárias 10+10. Estende a Captação Ativa.

### Fase 6 — Canais/agente + B2B (polimento)
- Handoff Luna→humano: etiqueta "transferido do agente" + entrada como Novo + histórico (`Atividade`).
- Etiqueta/flag B2B (revenda/loja/assistência/academia ou >5 un.) que ativa os prazos B2B da Fase 0/2.
- Papel do número (agente × vendedores) + volume 8–12/dia + métricas por número (depende Fase 4).

---

## Decisões pendentes (suas)
1. **Ordem/escopo**: começar pela Fase 0 (fundação, recomendado) ou por ganhos rápidos de baixo risco (Fase 1 motivos + Fase 4 KPIs de leitura)? Ou fazer tudo na ordem acima?
2. **Follow-up (Fase 2)**: confirmo que a automação **só move etapa + cria tarefa pro vendedor**, sem mandar mensagem ao cliente (catraca)? (recomendo sim)
3. **"Interação qualificada"**: como detectar — heurística automática (pediu preço/frete/link/pagamento) ou o vendedor marca manualmente? (recomendo heurística + override manual)
4. **Desqualificado**: novo status no enum (mais limpo, migração) vs. flag (menos invasivo)? (recomendo flag `desqualificado` no Negocio, menos risco)
5. **Reaquisição**: automatizar só o agendamento (admin ainda ARMA o envio) ou disparo automático no 6º dia útil? (recomendo manter o ARMA manual — envio a cliente)
6. **Páginas 21–23** (Governança/monitoramento/implantação) — reenviar pra fechar a fase de governança.

Cada fase vira seu próprio plano detalhado (sem placeholder) + gates + prova + deploy por catraca, aplicada cirurgicamente.
