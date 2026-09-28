# Arquitetura canônica — Atendimento omnichannel (CRM como dono)

> **Status: PROPOSTA (Architectural, Artigo 14) — aguarda OK do Luccas antes de qualquer código.**
> Documento de 19/09/2026, HEAD `b61c2e4` da branch `wip/atendimento-omnichannel-provider-abstract`.
> Escopo: só documentação. Nada aqui altera produção, banco, credenciais ou plano pago. Nenhum push/deploy.
> Complementa `WORKORDER_ATENDIMENTO_OMNICHANNEL.md` (workspace do agente) e `PLANO_SANDBOX_ATENDIMENTO.md`.

## 1. Tese em cinco linhas

1. O **CRM é o dono** de identidade do cliente, conversa, dono do lead, roteamento e histórico. Canal nenhum decide nada disso.
2. **Evolution API** e **WhatsApp Cloud API** são **adaptadores**: traduzem formato de canal ⇄ contrato canônico. Sem regra de negócio dentro deles.
3. Tudo que entra vira um **evento canônico** e passa pelo **mesmo núcleo** (`ingerir`). Tudo que sai passa por **uma fachada** (`enviarPeloCanal`) que escolhe a conta/adaptador.
4. **Uma thread por (cliente, setor)**, como hoje. O canal é atributo da mensagem, não da conversa — trocar de Evolution para Cloud não parte o histórico.
5. Migração **strangler**: extrair sem mudar comportamento, provar por teste de contrato, só então plugar o segundo adaptador atrás de flag.

## 2. Estado atual (fatos verificados no código, inventário de 19/09/2026)

| Fato | Onde |
|---|---|
| WhatsApp é 100% Evolution (não oficial, Baileys). **Não existe nada de Cloud API** (nem env, nem schema, nem rota, nem janela de 24h). O único `graph.facebook.com` é o CAPI de anúncios. | `src/lib/evolution.ts`, `src/lib/metaCapi.ts` |
| Webhook único: valida `WEBHOOK_SECRET`, enfileira payload bruto em `messages-in`, responde 200. Sem `jobId` determinístico. | `src/app/api/webhook/evolution/route.ts:17`, `src/lib/queue.ts:75` |
| **Não há camada anti-corrupção**: `processarEvento` (~550 linhas) mistura parsing do payload Evolution (`key.remoteJid`, `fromMe`, `message.*`, `@lid`) com regra de negócio (lead, funil, anúncio, Luna, fora do horário). | `src/lib/queue.ts:1768–2320` |
| Identidade do cliente = `Lead.telefone @unique` derivado do JID. Não há campo de id por canal. `@lid` é resolvido em `resolverJidReal` só para achar o telefone. | `schema.prisma:246`, `queue.ts:455`, `phone.ts` |
| Conversa unificada por `(leadId, finalidade)`; unicidade **parcial** (`WHERE arquivada=false`) vem de migração SQL, não do Prisma. Idem `Negocio` (índice manual). | `conversa.ts:15`, `prisma/manual/20260812020000_negocio_unico_ativo.sql` |
| Dono: `Lead.donoId` (venda) / `donoPosVendaId` (pós-venda); `Conversa.agenteId` é **espelho** via `espelharDonoNasConversas`. Roteamento (sticky → round-robin) é só `rotearLeadNovo`. | `dono.ts:11,50`, `roteamento.ts:13` |
| Regra pós-bug de 17/08: mensagem **OUT** nunca cria/reabre negócio nem roteia; só IN. PERDIDO visível não reabre por mensagem automática (`respeitarPrazoPerdido`). | `queue.ts:2272–2275`, `negocio.ts:94` |
| Dedupe de mensagem = `Mensagem.externalId @unique` global (sem provider/instância). Saídas sem id usam `out-`, `out-auto-`, `out-luna-`. | `schema.prisma:420`, `queue.ts:2008,2316` |
| "Instância" é conceito Evolution: `InstanciaWhatsApp.instanciaEvolution @unique`, com `finalidade`. `Conversa.instancia`, `Mensagem.instancia`, `instanciaRespostaId` (número fixado pelo atendente). | `schema.prisma:376–382,431,819` |
| Envio não tem interface: ~15 rotas + worker + recaptação + Luna chamam `enviarTexto/Audio/Midia` direto e cada uma resolve a instância à mão. `providers.ts` só cobre SMS/e-mail. | `evolution.ts`, `src/app/api/mensagens/*`, `recaptacao.ts:254` |
| `Mensagem.raw` guarda o payload Evolution cru e é reusado para reprocessar mídia → formato do canal persistido no domínio. | `schema.prisma:462`, `midia.ts` |
| Luna/Sol: `ConfigAgenteIA.ativo=false`, provider-abstraído (`llmProvider.ts`), teto de gasto hard-stop. **Dormente; esta arquitetura não a ativa.** | `luna.ts`, `orcamentoIA.ts` |

## 3. Arquitetura alvo

```
 Canal externo            ADAPTADOR (sem regra de negócio)          NÚCLEO DO CRM (dono)
 ─────────────            ────────────────────────────────          ─────────────────────
 Evolution  ─webhook──►   EvolutionAdapter.parse(raw)  ─┐
 Cloud API  ─webhook──►   CloudApiAdapter.parse(raw)   ─┼─► EventoCanonico[] ─► ingerir()
 Sandbox    ─(direto)──►  SandboxAdapter.parse(...)    ─┘        │
                                                                 ├─ resolverIdentidade  → Lead
                                                                 ├─ garantirConversaUnificada
                                                                 ├─ garantirNegocioParaLead (só IN)
                                                                 ├─ rotearLeadNovo      → dono
                                                                 ├─ persistir Mensagem + histórico
                                                                 └─ gates (fora do horário, Luna*)

 Núcleo ─► enviarPeloCanal(conversa, saída) ─► escolher conta ─► Adapter.enviar(...) ─► Evolution | Cloud
                                                 (janela 24h / capabilities / fixada / última usada)
 * Luna continua dormente; quando ativa, recebe/entrega só pela mesma fachada.
```

### 3.1 O que pertence a quem

| Responsabilidade | Dono | Nunca no adaptador |
|---|---|---|
| Validar assinatura/segredo do webhook, tolerar reentrega | Rota do webhook (por provider) | — |
| Traduzir payload ⇄ contrato canônico, baixar mídia por referência | **Adaptador** | lead, conversa, dono, funil |
| Lead por identidade, conversa unificada, negócio, dono, roteamento | **Núcleo** | — |
| Histórico (`Mensagem`, `Atividade`, `HistoricoNegocio`) | **Núcleo** | escrever direto no banco |
| Escolha da conta/canal de saída, checagem de janela/template | **Fachada de saída** | — |
| Políticas (bloqueado, fora do horário, Luna, teto de gasto) | **Núcleo** | — |

### 3.2 Contrato canônico (proposta de tipos — ainda não é código no repo)

```ts
type Provider = "EVOLUTION" | "CLOUD_API" | "SANDBOX";

interface ContaCanal {                 // generaliza InstanciaWhatsApp
  id: string;                          // InstanciaWhatsApp.id
  provider: Provider;
  finalidade: "VENDA" | "POS_VENDA";
  refExterna: string;                  // instanciaEvolution | phone_number_id
}

interface IdentidadeExterna {          // quem é o cliente NO canal
  tipo: "TELEFONE" | "LID" | "BSUID";  // LID (Evolution) e BSUID (Cloud) podem vir SEM telefone
  valor: string;                       // telefone só dígitos com DDI | id opaco
  telefone?: string;                   // se o canal entregou
  nomePerfil?: string;
}

interface EventoBase { provider: Provider; conta: ContaCanal; ocorridoEm: Date; raw: unknown; }

type EventoCanonico =
  | (EventoBase & { tipo: "MENSAGEM"; direcao: "IN" | "OUT"; externalId: string;
        cliente: IdentidadeExterna; conteudo: ConteudoCanonico;
        respondeA?: string; origemAnuncio?: { ctwaClid?: string; anuncioId?: string; titulo?: string; url?: string } })
  | (EventoBase & { tipo: "STATUS_ENVIO"; externalId: string; status: "ENVIADA" | "ENTREGUE" | "LIDA" | "FALHOU"; erro?: string })
  | (EventoBase & { tipo: "REACAO" | "EDICAO" | "REVOGACAO"; alvoExternalId: string; valor?: string })
  | (EventoBase & { tipo: "CONEXAO"; estado: "ABERTA" | "FECHADA" | "CONECTANDO" });   // só faz sentido p/ Evolution

interface ConteudoCanonico {
  tipo: "TEXTO" | "IMAGEM" | "AUDIO" | "VIDEO" | "DOCUMENTO" | "STICKER" | "CONTATO" | "OUTRO";
  texto?: string;
  midia?: { ref: string; mime?: string };   // ref opaca, o adaptador sabe baixar (não é URL crua do canal)
  contato?: { nome: string; telefone?: string; vcard?: string };
}

interface CapacidadesCanal {
  texto: true; midia: boolean; audioPTT: boolean; reacao: boolean;
  edicao: boolean; revogar: boolean;
  exigeTemplateForaDaJanela: boolean;       // Cloud: true; Evolution: false
}

interface CanalAdapter {
  provider: Provider;
  capacidades: CapacidadesCanal;
  parse(raw: unknown, conta?: ContaCanal): EventoCanonico[];          // PURO, sem I/O, testável com fixture
  enviar(conta: ContaCanal, destino: IdentidadeExterna, saida: SaidaCanonica): Promise<ResultadoEnvio>;
  baixarMidia?(conta: ContaCanal, ref: string): Promise<Buffer>;
}

type ResultadoEnvio =
  | { ok: true; externalId: string }
  | { ok: false; motivo: "JANELA_FECHADA" | "TEMPLATE_OBRIGATORIO" | "CAPACIDADE_AUSENTE"
                       | "CONTA_OFFLINE" | "RECUSADO_PELO_CANAL" | "ERRO_TRANSITORIO"; detalhe?: string };
```

Decisão-chave: **`parse` é puro**. Isso torna o contrato testável com fixtures sem banco, sem rede e sem credencial, e é o que permite provar equivalência antes de trocar o `queue.ts`.

## 4. Invariantes (o que nenhum adaptador pode quebrar)

Cada item é testável e vira caso de contrato (seção 8).

**Identidade**
- I1. `Lead.telefone` continua a chave canônica do cliente. Adaptador que só tem LID/BSUID entrega `IdentidadeExterna` sem telefone; o **núcleo** resolve via `IdentidadeCanal` (seção 5) ou, se não achar, aplica a política de "cliente sem telefone" (questão aberta Q2).
- I2. Normalização de telefone é uma só: `phone.ts` (`normalizarJid`, `variantesTelefoneBR`). Cloud API tem quirk conhecido de `wa_id` divergir do número digitado em alguns celulares BR (nono dígito) — casar sempre por `variantesTelefoneBR`, nunca por igualdade estrita. *(A confirmar na doc da Meta; não verificado nesta sessão, web indisponível.)*
- I3. Mesmo cliente por Evolution e por Cloud = **mesmo Lead** (mesmo telefone).

**Conversa e histórico**
- I4. Uma conversa ativa por `(leadId, finalidade)`. Canal/conta é atributo da `Mensagem`; a conversa guarda só a **conta preferida de resposta** (generalização de `instanciaRespostaId`).
- I5. Mensagens e conversas **nunca são apagadas** para migrar de canal. Revogação/edição só marcam (já é assim).
- I6. Adicionar Cloud API **não reescreve** `externalId` nem `raw` de linhas existentes. Backfill só preenche colunas novas com o default `EVOLUTION`.

**Dono e roteamento**
- I7. Só o núcleo decide dono: `rotearLeadNovo` + `espelharDonoNasConversas`. Adaptador nunca escreve `donoId`/`agenteId`.
- I8. Regra de 17/08 é invariante do núcleo, **independe de provider**: `direcao=OUT` (eco, campanha, resposta automática) **nunca** cria/reabre negócio, roteia ou sobe card. Só `IN` real do cliente.
- I9. Dono continua sticky por finalidade: cliente que volta por outro canal cai no mesmo dono (`Lead.donoId`/`donoPosVendaId`), e o setor com atendimento aberto vence a finalidade da conta (`resolverFinalidadeEntrante`).
- I10. Transferência de carteira (ex.: Miguel→Pedro de 11/09) continua sendo só dado: como o dono vive no `Lead`, vale para qualquer canal sem tocar adaptador.

**Dedupe e idempotência**
- I11. Idempotência por `(provider, externalId)`. Hoje `externalId @unique` global basta (formatos não colidem na prática); ids novos do Cloud entram com prefixo `wamid:` no armazenamento para **garantir** não-colisão com legado sem migrar linhas. `P2002` continua sendo sucesso idempotente.
- I12. Webhook rápido e burro: validar → enfileirar → 200. Fila passa a usar `jobId = provider:externalId` (dedupe de reentrega antes de chegar ao worker; hoje só o banco segura).

**Saída**
- I13. **Sem fallback automático entre providers** numa mesma conversa em v1. Cloud fora da janela de 24h sem template = erro tipado `JANELA_FECHADA`, mostrado ao atendente / vira handoff na Luna. Desviar para o canal não oficial para "furar" a janela seria contornar política do canal — só por decisão explícita do Luccas.
- I14. **Mensagem a terceiros continua catraca.** Adaptador novo nasce sem permissão de enviar para número real: em ambiente não-produção só `SANDBOX` (ou números de teste da Meta) — nunca cliente real sem o Luccas direto.
- I15. LGPD: todo log de adaptador/núcleo usa `telefoneParaLog`; nenhum adaptador loga payload cru completo, token ou corpo de mensagem.
- I16. Segredos **nunca** em linha de banco nem em código: `ContaCanal` guarda só o **nome** da env var (`credencialRef`), o valor vem de env/secret store em runtime.

## 5. Modelo de dados alvo — 100% aditivo, nada aplicado

Nenhuma migration é criada por este documento. Proposta para revisão:

1. `InstanciaWhatsApp` **não é renomeada** (é referenciada por `Conversa`/`Mensagem` e tem telas de admin). Ganha colunas nulas/default:
   `provider` (default `EVOLUTION`), `phoneNumberId?`, `wabaId?`, `credencialRef?`.
   `instanciaEvolution` continua `@unique` para as linhas Evolution; linhas Cloud usam `refExterna` novo (`@@unique([provider, refExterna])`).
2. `Mensagem`: `provider` (default `EVOLUTION`), `contaId` já existe como `instanciaId`. `externalId` mantém `@unique`.
3. Nova tabela `IdentidadeCanal(id, leadId, provider, tipo, valor, criadoEm)` com `@@unique([provider, tipo, valor])` — mapeia LID/BSUID → Lead. Evolution ganha de graça o fix definitivo do `@lid` (hoje só resolvido em memória).
4. `Conversa`: `instanciaRespostaId` continua; semântica = "conta preferida de resposta" (qualquer provider).
5. `Mensagem.raw` fica como está; a coluna `provider` já diz qual formato o payload tem (não precisa de `rawProvider`).
6. **Unicidades parciais** de `Conversa`/`Negocio` são SQL manual (`prisma/manual/*`, migração fatia231a). Qualquer trabalho aqui tem que **preservá-las** e testá-las; o schema Prisma não as garante.

Regra de deploy do CRM já vigente se mantém: `prisma migrate deploy` no start, **zero DROP, zero TEMP TABLE, só CTEs**. Toda migration desta arquitetura é `ADD COLUMN`/`CREATE TABLE`/`CREATE INDEX`, reversível por não-uso.

## 6. Saída: escolha de conta e canal

`enviarPeloCanal(conversaId, saida)` substitui as ~15 chamadas diretas. Ordem de decisão:

1. Conta **fixada** pelo atendente (`instanciaRespostaId`), se ativa.
2. Senão, a **última conta que o cliente usou** (`Conversa.instanciaId`).
3. Senão, conta padrão da `finalidade` da conversa.
4. Checar `capacidades` da conta (mídia, áudio, reação, edição). Ausente → `CAPACIDADE_AUSENTE`, UI degrada (ex.: esconde "editar" em Cloud).
5. Se `exigeTemplateForaDaJanela` e a janela (24h desde a última mensagem **IN** do cliente naquela conta) estiver fechada → só template aprovado; sem template → `JANELA_FECHADA`.
6. Chamar o adaptador; gravar `Mensagem` (OUT) com `externalId` retornado (ou `out-*` como hoje se o canal não devolver), `provider`, `instanciaId`.

Campanhas em massa (`processarCampanha`) e recaptação passam pela **mesma fachada**; em conta Cloud viram template-only. Campanha e Luna herdam as travas existentes (teto de gasto, `bloqueado`, `aceitaContato`).

## 7. Migração por fases (strangler, cada uma reversível)

| Fase | O que muda | Comportamento em produção | Gate | Rollback |
|---|---|---|---|---|
| **F0** (este doc) | Só documentação | nenhum | OK do Luccas ao desenho | apagar o arquivo |
| **F1** Extrair `EvolutionAdapter.parse` | Tirar o parsing de `queue.ts` p/ função pura; `ingerir()` recebe `EventoCanonico`. Nomes de evento, `@lid`, envelopes, mídia, anúncio. | **Idêntico** | Teste de contrato dourado: mesmos fixtures → mesma saída do código antigo; `tsc`+`build` | `git revert` |
| **F2** Fachada de saída | `enviarPeloCanal` só com `EvolutionAdapter.enviar`; migrar as rotas uma a uma | Idêntico | Contrato + smoke no sandbox | revert por rota |
| **F3** Schema aditivo | Colunas/tabela da seção 5, backfill `provider=EVOLUTION`; `IdentidadeCanal` populada a partir do que já se resolve | Idêntico | Contagem antes/depois (mensagens, conversas, negócios, dono) = igual; migration só aditiva | não usar as colunas |
| **F4** `CloudApiAdapter` atrás de flag | Webhook `GET` (verificação) + `POST` (assinatura HMAC do app secret); `parse`; `enviar` texto/template; janela de 24h | **Zero tráfego real** (flag off) | Fixtures oficiais da Meta passam; sandbox com número de teste | flag off |
| **F5** Piloto | 1 conta Cloud, escopo mínimo | Tráfego real pequeno | **Luccas direto** (mensagem a terceiro + custo) | desativar conta |
| **F6** Migração gradual de números | Por número/setor, conforme estabilidade | Gradual | Métricas de entrega vs Evolution | voltar a conta p/ Evolution (histórico intacto por I4–I6) |

Preflight de solução existente (regra do workspace): não adotar biblioteca/BSP agora — o contrato canônico é fino e o CRM já tem o domínio; um BSP ou SDK só entra na F4 como **detalhe de implementação do adaptador**, sem mudar o contrato.

## 8. Testes e contratos (propostos; nenhum criado)

O repo **não tem test runner** (sem vitest/jest; só `tsx` em devDependencies). Proposta mínima sem dependência nova: scripts `tsx` com `node:assert` em `scripts/contratos/`, rodados manualmente e opcionalmente no pre-commit. Casos:

- **C1 Paridade Evolution (F1):** fixtures reais **anonimizadas** → `parse` novo ≡ comportamento antigo (tipo, conteúdo, direção, telefone, anúncio, reply, envelopes ephemeral/viewOnce, sticker).
- **C2 `@lid`:** LID com `senderPn`/`participantPn`/`remoteJidAlt`; LID sem telefone resolvido → sem criar lead com identidade falsa.
- **C3 OUT nunca roteia (I8):** dado `direcao=OUT`, `ingerir` não chama `garantirNegocioParaLead`/`rotearLeadNovo` (com Prisma stubado).
- **C4 Dono sticky cross-canal (I3, I9):** mesmo telefone via EVOLUTION e via CLOUD_API → mesmo Lead, mesmo dono.
- **C5 Dedupe (I11–I12):** mesmo `(provider, externalId)` duas vezes → uma `Mensagem`; `P2002` = sucesso.
- **C6 Janela (I13):** conta Cloud, última IN há 25h, texto livre → `JANELA_FECHADA`; com template → ok; Evolution → ok.
- **C7 Sem segredo/PII em log (I15–I16):** `parse`/`enviar` com token/telefone sentinela → nada aparece no `console`.
- **C8 Preservação de unicidade parcial:** as duas UNIQUE parciais (`Conversa`, `Negocio`) continuam impedindo duplicata após F3.
- **C9 Cloud (F4):** fixtures do payload oficial da Meta (`messages`, `statuses`, mídia, reação, `errors`) → eventos canônicos corretos; assinatura HMAC inválida → 401 sem enfileirar.

Fixtures reais exigem `Mensagem.raw` de produção (dado pessoal, acesso ao banco) — **não obtidas aqui** (fora do escopo autorizado). Para F1 é necessário anonimizá-las antes de versionar.

## 9. Questões abertas (decisão do Luccas — nada foi escolhido aqui)

- **Q1 Plano/ BSP da Cloud API:** direto na Meta vs BSP (Twilio/360dialog, com markup). Preço por mensagem e a mudança de cobrança de 01/out/2026 vêm do WORKORDER e **não foram reverificados**. Não escolhi plano nem gastei nada.
- **Q2 Cliente sem telefone (LID/BSUID):** se a Meta/WhatsApp entregar só ID opaco, `Lead.telefone` (obrigatório e `@unique`) não comporta. Opções: (a) exigir telefone e manter fila "identidade pendente"; (b) tornar `telefone` opcional (migration grande, toca todo o CRM). Recomendo (a) até haver evidência real de volume.
- **Q3 Coexistência de número:** o mesmo número rodar em Evolution e Cloud ao mesmo tempo *(não verificado)*; recomendo assumir **um número = um provider** e migrar por número (F6).
- **Q4 Fallback entre providers** (I13): manter proibido em v1, ou permitir com registro explícito?
- **Q5 Número WhatsApp Business + verificação Meta Business** (dependência já listada no WORKORDER, fase 7): fora do meu alcance; depende do Luccas.

## 10. Não-objetivos

Não ativa a Luna/Sol; não muda modelo de IA; não toca site/ERP/VR; não migra dados; não cria número, conta Meta ou credencial; não mexe em `Negocio.valor`/`valorAjustado` (ponto de atenção nº 1 do BRIEFING permanece intacto); não substitui o sandbox — ele vira, no fim, o `SandboxAdapter`.

## 11. Próximo passo inequívoco (após OK)

**F1**, começando pelo teste de contrato C1/C3 sobre o `parse` extraído do `queue.ts` — refatoração pura, sem schema, sem canal novo, sem custo. Pré-requisito: fixtures Evolution anonimizadas (o Luccas autorizar leitura read-only de amostra de `Mensagem.raw`, ou gerá-las a partir do sandbox).
