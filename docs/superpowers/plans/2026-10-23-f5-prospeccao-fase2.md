# F5 — Prospecção Ativa (Fase 2 do Manual) — módulo completo (plano)

**Goal:** Módulo operacional da prospecção ativa: cadência de 4 semanas por contato, registro de tentativas/canais, metas diárias (10 cadastros + 10 1º contatos), "Perdido — Nutrição" com retorno em 90 dias, e métricas (resposta/qualificação). Reaproveita a Captação Ativa (leads origem="manual"). **NÃO auto-envia mensagem** — agenda a próxima ação (Lembrete) para o vendedor e mede. Nasce seguro (flag `prospeccaoAtiva` off = dry-run).

**Arquitetura:** lead de prospecção = `Lead` com `origem="manual"` (convenção já usada pela Captação). Estado de cadência num side-table 1:1 `ProspeccaoContato` (fase/tentativas/canais/datas/nutrição). Núcleo puro `cadencia.ts` (semana→fase, critério "sem resposta") + contrato. Job `prospeccao.ts` (tick, dry-run/flag) avança fase por tempo e cria a próxima ação; no fim da semana 4 → NUTRICAO (+90d); re-surge após 90d. API `/api/prospeccao` registra contato, loga tentativa (canal), qualifica/encerra. Métricas: meta diária 10+10 + taxas (estende Captação).

## Decisões (do Luccas, já dadas)
- Módulo completo. Nunca mensagem ao cliente (catraca) — só tarefa pro vendedor. Nasce desligado.

## Sub-fases
- **F5a** schema (`FaseProspeccao` enum + `ProspeccaoContato`) + migration aditiva + núcleo puro `cadencia.ts` + contrato c14.
- **F5b** job `prospeccao.ts` (avança fase, cria Lembrete da próxima ação, NUTRICAO+90d), flag `prospeccaoAtiva` (off), registrado no server.ts em dry-run.
- **F5c** API `/api/prospeccao`: criar contato (a partir de um lead manual), registrar tentativa (canal), qualificar→funil normal, encerrar (sem resposta só com ≥5 tentativas/≥2 canais).
- **F5d** métricas: meta diária 10+10 + taxa de resposta/qualificação (estende captacao.ts/painel) — sem duplicar.
- **F5e** UI: painel de prospecção do vendedor (lista por fase + próxima ação + botão registrar tentativa) + meta diária no Supervisor.

## Cadência (modelo)
Semana = semanas de calendário desde `primeiroContatoEm`. S1 Abordagem (1º contato D1 + 2ª tentativa ~D3 canal diferente), S2 Qualificação (~7d: qualificado/sem resposta/não qualificado), S3 Proposta, S4 Fechamento. Fim de S4 sem avanço → NUTRICAO, `nutricaoAte` = hoje+90 dias; some da carteira (filtro) e volta após a data. "Sem resposta" só com ≥5 tentativas em ≥2 canais.

## Gate
Cada sub-fase: tsc 0 + build 0 + contrato. Migração aditiva provada. Deploy ao fim (flag off). Certificação final do sistema depois.
