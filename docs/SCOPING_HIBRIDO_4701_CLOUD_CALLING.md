# Scoping — Híbrido Evolution + 4701 na Cloud API oficial (com ligação)

> **Status: PROPOSTA (Architectural, Artigo 14) — aguarda OK do Luccas antes de qualquer código.**
> Data: 2026-09-28. Autor: Jarvis CRM. Branch: `wip/atendimento-omnichannel-provider-abstract` (HEAD `d8f1ec4`).
> Escopo deste doc: só planejamento. Não altera produção, banco, credencial ou plano pago. Nenhum push/deploy.
> Fonte única de arquitetura: `ARQUITETURA_ATENDIMENTO_OMNICHANNEL.md` (F0–F6) + `LEVANTAMENTO_CALLING_VOZ_VIDEO.md` (F7). Este doc **especializa** aquele desenho para o caso concreto que o Luccas pediu; não cria contrato novo.

## 1. A decisão, em uma frase

Todos os números atuais continuam na **Evolution API, sem mudança**. **Só o 4701** vai para a **WhatsApp Cloud API oficial**, dedicado, **com ligação de voz** — e o 4701 **nunca** entra na Evolution. Os dois provedores rodam **ao mesmo tempo, para sempre**, roteados por número dentro do mesmo CRM.

Isso é **diferente** do plano canônico original (F6 = migrar todos os números gradualmente até aposentar a Evolution). Aqui **não há aposentadoria da Evolution**: é um híbrido permanente. O modelo de adaptador do doc canônico já comporta isso sem contrato novo — a única mudança de plano é que a F6 "migrar todos" vira **não-objetivo**, substituída por "adicionar UMA conta Cloud (4701) e parar aí".

## 2. Por que isso é o caminho mais seguro

- Os números que já vendem **não são tocados**: continuam Baileys/Evolution, mesmo webhook, mesmo comportamento. Zero risco de regressão no que fatura hoje.
- O 4701 é a **cobaia isolada** do oficial. Se der problema no Cloud, os outros números não sentem nada.
- Ligação de voz **exige** o número na Cloud API (a Evolution não expõe calling — fato verificado). Dedicar o 4701 ao Cloud é o que destrava voz sem forçar o resto da operação a migrar.

## 3. Estado real hoje (verificado no código, não de memória)

| Fato | Onde |
|---|---|
| WhatsApp é 100% Evolution. Zero Cloud API (sem env, schema, rota ou janela de 24h). Único `graph.facebook.com` é o CAPI de **anúncios**, produto diferente. | `evolution.ts`, `metaCapi.ts` |
| Webhook único Evolution: valida `WEBHOOK_SECRET`, enfileira bruto, 200. | `api/webhook/evolution/route.ts`, `queue.ts:75` |
| Parsing Evolution **misturado com regra de negócio** em `queue.ts` (~1768–2320). Sem camada anti-corrupção. F1 (extrair `EvolutionAdapter.parse`) **não começado**. | `queue.ts` |
| `InstanciaWhatsApp.instanciaEvolution @unique` + `finalidade`. Não há campo `provider` — hoje "instância" = conceito Evolution. | `schema.prisma:376–382` |
| Envio sem fachada: ~15 rotas + worker + recaptação chamam `enviarTexto/Midia` direto, cada uma resolve a instância à mão. F2 (`enviarPeloCanal`) **não começado**. | `evolution.ts`, `api/mensagens/*` |
| **F7-Calling, 1ª fatia JÁ implementada** (commit `4846ca1`, empurrado): tipos canônicos (`lib/chamada/tipos.ts`), hook WebRTC (`lib/chamada/servicoChamada.ts`), relay de sinalização **aditivo** (`lib/sinalizacaoChamada.ts`), overlay (`components/telefonia/PainelChamada.tsx`), ícones no `Thread.tsx`. | `lib/chamada/*`, `sinalizacaoChamada.ts` |
| Socket.io **broadcast puro** (`getIO()?.emit()` global). O relay de chamada já adicionou `io.on("connection")` + salas `agente:<id>` **sem** rejeitar conexão nem tocar os emits globais. Auth **estrita** de handshake ainda **não** feita (pendência do F7.0). | `socket.ts`, `sinalizacaoChamada.ts` |
| Ligação real para o CLIENTE está **gated OFF** (`CHAMADAS_ATIVAS` = `NEXT_PUBLIC_CHAMADAS_ATIVAS !== "true"`). Ícones aparecem; clicar hoje só explica a pendência, não disca. | `lib/chamada/tipos.ts:84` |

## 4. Invariantes específicas do híbrido (o que o desenho não pode quebrar)

- **H1. 4701 = `provider: CLOUD_API`.** Nasce como `ContaCanal` Cloud (com `phoneNumberId`/`wabaId`/`credencialRef`), com uma `finalidade` fixa (a definir — ver Q1). **Nunca** ganha `instanciaEvolution`.
- **H2. Roteamento de entrada por provedor.** Webhook Evolution → `EvolutionAdapter.parse`; webhook Cloud → `CloudApiAdapter.parse`. Os dois despejam no **mesmo** `ingerir()`. O número/conta é atributo da mensagem.
- **H3. Identidade cross-provider por telefone (I3 canônico).** Cliente que fala com o 4701 (Cloud) e depois com um número Evolution = **mesmo Lead** (mesmo telefone) = **mesmo dono**. A carteira (ex.: Miguel→Pedro) vale para os dois provedores sem tocar adaptador.
- **H4. Saída escolhe o provedor pela conta.** `enviarPeloCanal` responde pelo 4701 via Cloud (template obrigatório fora da janela de 24h) e pelos outros via Evolution. Sem fallback automático entre provedores (I13): 4701 fora da janela sem template = erro tipado `JANELA_FECHADA`, mostrado ao atendente.
- **H5. Regra de 17/08 é do núcleo, independe de provider (I8).** `direcao=OUT` (eco, campanha, automática) **nunca** cria/reabre negócio nem roteia, seja Evolution ou Cloud.
- **H6. Mensagem a terceiro continua catraca (I14).** O `CloudApiAdapter` nasce sem permissão de enviar a cliente real: até a F5 só número de teste da Meta / sandbox. Tráfego real no 4701 = **OK direto do Luccas** (mensagem a terceiro + custo).
- **H7. LGPD/segredo (I15–I16).** Log com `telefoneParaLog`; token do Cloud vem de env por `credencialRef`, nunca em linha de banco nem em código.

## 5. Fases desta fatia (subconjunto do canônico; cada uma reversível)

Reuso a numeração do doc canônico. **F6 (migrar todos) é explicitamente pulado** — vira não-objetivo.

| Fase | O que muda | Produção | Custo | Gate | Rollback |
|---|---|---|---|---|---|
| **F1** Extrair `EvolutionAdapter.parse` | Parsing puro sai do `queue.ts`; `ingerir()` recebe `EventoCanonico`. | Idêntico | Zero | Teste de contrato dourado (mesmos fixtures → mesma saída) + `tsc`+`build` | `git revert` |
| **F2** Fachada de saída | `enviarPeloCanal` só com `EvolutionAdapter.enviar`; migrar rotas uma a uma. | Idêntico | Zero | Contrato + smoke sandbox | revert por rota |
| **F3** Schema aditivo | `InstanciaWhatsApp.provider`(default `EVOLUTION`)/`phoneNumberId`/`wabaId`/`credencialRef`; tabela `IdentidadeCanal`; backfill `provider=EVOLUTION`. | Idêntico | Zero | Contagens antes/depois iguais; só `ADD COLUMN`/`CREATE TABLE` (regra de deploy: zero DROP/TEMP) | não usar colunas |
| **F4** `CloudApiAdapter` + webhook (flag off) | Rota webhook Cloud: `GET` (verificação) + `POST` (HMAC do app secret); `parse` texto/mídia/status; `enviar` texto/template. 4701 cadastrado como conta Cloud. | **Zero tráfego real** (flag off) | Zero (só teste) | Fixtures oficiais Meta passam; número de teste no sandbox | flag off |
| **F5-4701** Piloto do 4701 | Ativar **só o 4701** no Cloud. Tráfego real pequeno. Resto segue Evolution intocado. | Tráfego real no 4701 | **Sim (por-mensagem)** | **Luccas DIRETO** (catraca: terceiro + custo) | desativar a conta Cloud; 4701 volta a ficar sem canal (ou reverte pra Evolution se re-registrado) |
| **F7-Calling** (só após 4701 vivo no Cloud) | Voz no 4701. Ver 5.1. | Gradual, atrás de flag | Por-chamada (negócio inicia) | Luccas direto por fatia | flag off |

### 5.1 F7-Calling (detalhe — depende de 4701 estar no Cloud)

- **F7.0 Endurecer Socket.io** — completar a auth: `io.use()` lendo sessão do handshake + confirmar salas por agente. Piso já parcialmente feito (salas aditivas). É a mudança **mais arriscada** (toca como todo cliente conecta) → contrato dourado, reversível.
- **F7.1 Modelo `Chamada`** (schema aditivo: FK conversa/lead/agente, direção, provider, `externalId`, início/fim, duração, status, `gravacaoUrl` **só link**) + `EventoChamadaCanonico` + interface `ChamadaAdapter`.
- **F7.2 Voz entrando** — `MetaCallingAdapter` webhook `calls` → sinalização → `RTCPeerConnection` (áudio) → UI aceitar/recusar (o overlay já existe).
- **F7.3 Voz saindo** — click-to-call (ícones já existem) + opt-in `VOICE_CALL_REQUEST` para business-initiated.
- **F7.4 Gravação** — só link, player na timeline.
- **F7.5 Vídeo** — arquitetar agora, **flag off**: a Meta ainda não liberou vídeo em produção no BR.

## 6. Cadeia de dependência dura — o que trava, e de quem é

**Ações do Luccas (fora do meu alcance, não é código):**
1. Registrar o **4701 na WABA** + aceitar Termos + pagamento da Cloud API.
2. **Display name** do 4701 aprovado pela Meta.
3. **Meta App** + token (system user reaproveitável, ID `122169495176667914`) com escopos `whatsapp_business_messaging` + `whatsapp_business_management`.
4. Inscrever o **webhook** (eu construo o endpoint; a inscrição no painel é ação Meta/Luccas — coordeno com o Jarvis Meta).
5. Habilitar **calling** no 4701 + template `VOICE_CALL_REQUEST` aprovado.

**Minha parte (código), na ordem:** F1 → F2 → F3 → F4 (tudo custo zero, sem tráfego real, sem depender das ações acima) → **para em F5**, que só avança com 4701 na WABA (dep. 1–2) + OK direto do Luccas → depois F7 (dep. 5).

Ponto-chave: **F1–F4 podem começar já**, em paralelo ao Luccas resolver a WABA. Nenhuma linha de F1–F4 manda mensagem a cliente nem gasta — é refactor + schema aditivo + adaptador atrás de flag.

## 7. Questões abertas (decisão do Luccas)

- **Q1. Finalidade do 4701:** VENDA ou POS_VENDA? Isso define roteamento e a conta padrão de saída daquela finalidade. (Recomendo: o que o 4701 já faz hoje na Evolution, pra não mudar o funil.)
- **Q2. Coexistência do MESMO número:** o 4701 **já roda hoje na Evolution**? Se sim, migrar o 4701 exige tirá-lo da Evolution (um número = um provider, I/Q3 canônico) — não dá pra ter o mesmo número nos dois ao mesmo tempo sem a "Coexistence" da Meta (não verificado/instável). Recomendo: 4701 sai da Evolution ao entrar no Cloud; histórico fica intacto (I4–I6). **Confirmar se o 4701 é número novo ou um dos atuais.**
- **Q3. Plano/BSP:** direto na Meta vs BSP (Twilio/360dialog). Preço por-mensagem não reverificado nesta sessão. Não escolhi nem gastei.

## 8. Não-objetivos

Não migra os outros números (ficam Evolution pra sempre); não aposenta a Evolution; não ativa Luna/Sol; não toca `Negocio.valor`/`valorAjustado`; não cria número/conta Meta/credencial (ação do Luccas); não faz cotação externa de telefonia 0800 (frente separada, catraca própria).

## 9. Próximo passo inequívoco (após OK)

**F1** — extrair `EvolutionAdapter.parse` do `queue.ts` com teste de contrato dourado (C1/C3 do doc canônico). Refatoração pura, sem schema, sem canal novo, sem custo, sem tráfego. Pré-requisito: amostra anonimizada de `Mensagem.raw` (Luccas autorizar leitura read-only, ou gerar via sandbox).
