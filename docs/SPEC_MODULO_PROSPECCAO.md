# SPEC — Módulo de Prospecção / Carteira de Leads (B2B outbound)

> Status: **PROPOSTA — aguardando OK do Luccas (Art. 14, Architectural).** Nada de schema/código tocado até aprovação.
> Autor: Jarvis CRM · Data: 2026-10-29 · Fonte dos dados: 16 planilhas (lote 27/10/2026).

## 1. O que o Luccas pediu (destilado)
Uma aba nova no sistema para:
1. Receber listas de potenciais clientes (contatos) organizados por **setor/categoria/avaliação**, dedup.
2. **Distribuir entre vendedores**; cada vendedor vê só os contatos entregues a ele.
3. Vendedor **clica no contato/telefone → abre a conversa** com o cliente; depois de ativo aparece no **kanban e inbox** dele.
4. Vendedor vê se **já tem conversa** com aquele número/cliente ou não.
5. **Admin e Supervisor** veem tudo: quem está fazendo, como, quantos por dia por vendedor, qualidade.
6. Filtros por **estado, região e categoria** (varejo/atacado/revenda/locação).
7. **Enriquecer o cadastro** com info extra (endereço etc.) quando existir.

## 2. Análise dos dados (read-only, já executada)

### 2.1 Base operacional canônica = família `b2b_*` (a usar no import)
- **2.712 linhas lidas → 2.528 contatos únicos** (184 duplicados removidos; dedup por telefone, fallback nome+cidade).
- **100% com telefone** (E.164 normalizado) · **100% com endereço** · **97% com nota Google**.
- Colunas: Cidade, Nome, Bairro, Endereço, Nota Google, Nº Avaliações, Telefone, Tipo Telefone, Perfil (obs.).
- **Categoria = aba da planilha:** `Revendedores`(revenda) · `Varejo` · `Locadoras de Eventos`(locação).
- Já vieram **pré-divididos**: Pedro 1.263 · Tiago 1.258 (overlap entre os dois = só 2) · +7 base GO sem vendedor.

| UF | únicos | | Categoria | únicos |
|----|-------:|-|-----------|-------:|
| SP | 1.153 | | revenda   | 1.011 |
| MG |   678 | | varejo    |   825 |
| RJ |   284 | | locação   |   692 |
| GO |   189 | | | |
| MT |   136 | | | |
| MS |    88 | | | |

### 2.2 Camada "inteligência" = 3 masters SIXXIS (enriquecimento)
Schema mais rico (header na linha 5). Trazem campos que a base b2b NÃO tem:
- **Score /100, Classe (A/B/C), Curva cidade, Segmento, Produto sugerido, E-mail público, Hunter, Status comercial, Próxima ação, Link da fonte**, distinção **B2C (uso próprio) vs B2B (revenda)**.
- `SIXXIS_Prospecao_8_Estados_ABC`: B2C 86 + B2B 80 + 160 praças priorizadas + fila hunters 156.
- `SIXXIS_Carteira_CURVA_B_GO_MT_MS_DF`: 144 na Base Curva B (GO/MT/MS/DF) + fila hunters 133.
- `SIXXIS_Prospeccao_Nacional_Climatizadores`: 432 leads "TODOS OS LEADS" + 27 abas por UF.
- **Tratamento proposto:** casar por telefone com a base b2b → **enriquecer** (score/classe/curva/email/segmento). Leads dos masters que NÃO existirem na b2b entram como novos contatos. Dedup único global por telefone.

## 3. Modelo de dados (Prisma — ADITIVO, zero destrutivo)

Novo agregado, **separado do funil vivo** (prospecto frio só vira Lead/Negócio/Conversa quando o vendedor ativa):

```
model ProspeccaoLote {
  id         String   @id @default(cuid())
  nome       String                 // ex. "Lote 8 Estados 27/10"
  origem     String                 // nome do arquivo / fonte
  criadoEm   DateTime @default(now())
  contatos   ProspeccaoContato[]
}

model ProspeccaoContato {
  id            String   @id @default(cuid())
  loteId        String
  lote          ProspeccaoLote @relation(fields:[loteId], references:[id])
  // identidade/dedup
  telefoneE164  String                 // chave de dedup + match com Conversa/Lead
  nome          String
  // classificação
  uf            String
  cidade        String
  bairro        String?
  endereco      String?
  categoria     ProspCategoria         // REVENDA | VAREJO | LOCACAO | OUTRO
  segmento      String?                // B2B/B2C ou segmento fino (masters)
  // avaliação/score
  notaGoogle    Float?
  numAvaliacoes Int?
  score         Int?                   // /100 (masters)
  classe        String?                // A|B|C (masters)
  curvaCidade   String?                // A|B|C (masters)
  emailPublico  String?
  linkFonte     String?
  perfilObs     String?                // "Perfil (obs.)" / justificativa
  // operação
  donoId        String?                // vendedor atribuído (FK Usuario)
  status        ProspStatus @default(NOVO) // NOVO|EM_ABORDAGEM|RESPONDEU|CONVERTIDO|DESCARTADO
  // ponte p/ funil vivo quando ativado
  leadId        String?  @unique       // setado no 1º contato
  conversaId    String?                // idem
  ativadoEm     DateTime?
  descartadoMotivo String?
  criadoEm      DateTime @default(now())
  atualizadoEm  DateTime @updatedAt
  @@unique([telefoneE164])             // dedup global duro
  @@index([donoId, status]); @@index([uf, categoria])
}

model ProspeccaoAtividade {   // auditoria p/ métricas admin/supervisor
  id          String @id @default(cuid())
  contatoId   String
  usuarioId   String
  tipo        String   // ABRIU_CHAT | ENVIOU_1A_MSG | MUDOU_STATUS | DESCARTOU | REATRIBUIU
  detalhe     String?
  criadoEm    DateTime @default(now())
  @@index([usuarioId, criadoEm]); @@index([contatoId])
}
enum ProspCategoria { REVENDA VAREJO LOCACAO OUTRO }
enum ProspStatus { NOVO EM_ABORDAGEM RESPONDEU CONVERTIDO DESCARTADO }
```

Reuso: `Usuario` (vendedores/roles já existem), `Lead`/`Negocio`/`Conversa` (ponte na ativação).

## 4. Fluxo de ativação (ponto crítico — conflito com regra atual do kanban)

⚠️ **Conflito arquitetural a resolver (Ponto de atenção):** a regra viva hoje é *mensagem de SAÍDA (`direcao=OUT`) NÃO cria/reabre negócio nem roteia — só `IN`* (correção do bug de campanha de reativação). Mas prospecção é **exatamente** o vendedor mandando a 1ª mensagem (OUT) e isso **PRECISA** criar o card. → precisa de um caminho explícito de "ativação de prospecção" que crie Lead+Negócio+Conversa **intencionalmente**, marcado com origem=`PROSPECCAO`, distinto da regra de campanha. **Não reaproveitar cegamente `garantirNegocioParaLead`.**

Fluxo proposto:
1. Vendedor vê card do contato → botão **"Abrir conversa"**.
2. Badge mostra se **já existe Conversa/Lead** com aquele telefone (match E.164). Se já existe → abre a conversa existente (não duplica).
3. Se não existe → ao enviar a 1ª mensagem (humano, via Evolution/instância do vendedor): cria `Lead`(dono=vendedor) + `Negocio`(origem=PROSPECCAO, etapa inicial do funil VENDA) + `Conversa`, liga `ProspeccaoContato.leadId/conversaId`, `status=EM_ABORDAGEM`, registra `ProspeccaoAtividade(ENVIOU_1A_MSG)`. Aí sim entra no kanban/inbox.
4. **Quem envia é o vendedor (humano)** — o agente de IA NÃO dispara mensagem a prospecto (respeita catraca "mensagem a terceiro"). Sem blast em massa: é click-to-chat 1 a 1.

## 5. UI / rotas
- `/prospeccao` (vendedor): só seus contatos; filtros UF/região/categoria/status/classe; busca; badge "já em conversa"; botão abrir conversa; marcar status/descartar.
- `/prospeccao/admin` (admin+supervisor): todos os contatos; **reatribuir** vendedor; painel de métricas — contatos por vendedor, **abordagens/dia por vendedor**, taxa resposta, convertidos, descartados c/ motivo, tempo até 1ª msg; filtros iguais. Recharts (já no projeto).
- Item no menu lateral (`Sidebar.tsx`), visível por role.

## 6. Importador
- Script/endpoint admin de import (idempotente por telefone E.164; re-rodar não duplica — faz upsert e **enriquece** campos vazios com masters).
- Dedup: 184 já removidos na base; `@@unique(telefoneE164)` garante no banco.
- Respeita a divisão Pedro/Tiago dos arquivos; admin reatribui depois.
- Preserva endereço/nota/avaliações/perfil → vão pro cadastro do contato (e, na ativação, pro Lead).

## 7. Faseamento proposto (cada fase = gate verde + receipt)
- **F1 schema** (migration aditiva) + importador + import dos 2.528 b2b (sem UI de envio ainda).
- **F2** UI vendedor (lista, filtros, badge "já em conversa"), read-only de ativação.
- **F3** ativação real (caminho OUT→cria card de prospecção) + registro de atividade.
- **F4** painel admin/supervisor + métricas.
- **F5** enriquecimento pelos 3 masters (score/classe/curva/email) + import dos leads extras.

## 8. Decisões que preciso do Luccas antes de codar
1. **Fonte canônica:** confirmo b2b (2.528) como base + masters como enriquecimento? (recomendado)
2. **Entidade separada** (`ProspeccaoContato`, fora do kanban até ativar) vs jogar tudo direto como `Lead`? (recomendo separada)
3. **Divisão:** honrar o split Pedro/Tiago dos arquivos no import? (recomendo sim, com reatribuição no admin)
4. **Vendedores reais:** só Pedro e Tiago, ou tem outros? (arquivos só têm esses 2)
5. **Categoria "atacado":** você citou atacado; nos dados tem revenda/varejo/locação — "revenda" cobre atacado ou quer campo separado?
6. **Envio da 1ª msg:** por qual instância WhatsApp sai (a do vendedor? qual número)? Isso define o wiring da ativação.
