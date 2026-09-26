# Levantamento técnico — Ligação de voz e vídeo (WhatsApp Calling) embutida no CRM

> Status: **levantamento/planejamento** (Artigo 14 = Architectural). Nenhum código escrito, nenhuma produção tocada.
> Data: 2026-09-25. Autor: Jarvis CRM. Par: Jarvis Meta (cuida do lado Meta: habilitar calling no número, template `VOICE_CALL_REQUEST`, webhook `calls` no painel).
> Fonte única de arquitetura: `docs/ARQUITETURA_ATENDIMENTO_OMNICHANNEL.md` (fases F0–F6). Este doc propõe uma fase **F7-Calling** que vem DEPOIS.

## 1. Estado real do código (verificado ao vivo, não de memória)

- **F0 (doc canônico):** feito — a arquitetura omnichannel está desenhada.
- **F1 (extrair `EvolutionAdapter.parse`):** NÃO começado. `grep` por `EventoCanonico`/`ingerir()`/adaptador = 0. O parsing da Evolution segue misturado com regra de negócio em `queue.ts`.
- **F4 (`CloudApiAdapter` + webhook Meta):** NÃO começado. Rotas de webhook existentes: só `src/app/api/webhook/evolution` e `.../mercadopago`. Nada de Cloud API/Graph messaging. `metaCapi.ts` é **Conversions API** (atribuição de ads), produto diferente.
- ⚠️ **Nota de numeração:** o "F1 webhook" que o Meta citou = **F4** no doc canônico. Alinhar o vocabulário pra não confundir o Luccas.

## 2. Arquitetura de tempo real atual (o que existe hoje)

- `server.ts`: Next + Socket.io no MESMO servidor HTTP + workers BullMQ. Socket guardado em singleton (`src/lib/socket.ts`).
- **Socket.io é broadcast puro:** todos os eventos são `getIO()?.emit("evento")` global. NÃO há `io.on("connection")`, NÃO há `io.use()` (auth no handshake), NÃO há rooms/namespaces. Eventos: `mensagem:nova`, `conversa:atualizada`, `negocio:atualizado`, `campanha:progresso`, etc.
- Cliente (`src/lib/socketClient.ts`): conecta same-origin, sem token no handshake, `autoConnect`. A UI escuta os eventos globais e **re-busca** via REST.
- **Conclusão:** ótimo para notificar, **inadequado para sinalização de chamada** (que exige destino: entregar "chamada chegando" ao browser do vendedor CERTO, não a todos).

## 3. O que uma chamada WebRTC exige e HOJE não existe

1. **Sockets autenticados e endereçáveis** — saber qual `Agente` está em cada socket. Precisa de `io.use()` lendo a sessão/JWT do handshake + `socket.join("agente:<id>")`. (Hoje: nada.)
2. **Canal de sinalização bidirecional e direcionado** — offer/answer/ICE/hangup entre um browser específico e o servidor, baixa latência, não-broadcast. Eventos novos: `call:incoming`, `call:accept`, `call:reject`, `call:offer`, `call:answer`, `call:ice`, `call:end`, `call:status`.
3. **UI de chamada** — toast/modal de chamada entrando (aceitar/recusar); painel em-chamada (mudo, desligar, cronômetro; vídeo: `<video>` local+remoto); botão click-to-call no card do lead/conversa. Componentes novos em `src/components/telefonia/` (novo).
4. **`RTCPeerConnection` no browser** — SDP, ICE via STUN/TURN, `getUserMedia` (áudio; vídeo depois). A Calling API da Meta fornece a infra RTC/relay do lado dela; um softphone SIP (0800/CPaaS) precisaria do próprio TURN.
5. **Ponte de calling no servidor** — fala com a API de chamada do provedor (webhook `calls` da Meta, OU SIP/CPaaS), mapeia eventos → canônico, e faz relay de SDP entre provedor e browser.

## 4. Dois produtos de chamada distintos (NÃO confundir)

- **(A) WhatsApp Calling API (Meta):** voz GA no BR; **vídeo ainda não em produção** na Meta (arquitetar agora, ligar quando soltar). EXIGE o número na **Cloud API** (não na Evolution). Business-initiated exige opt-in do cliente via template `VOICE_CALL_REQUEST` dentro de conversa ativa. Mídia: WebRTC/UDP pela RTC da Meta; sinalização via webhook `calls` ou SIP.
- **(B) 0800 / telefonia (55PBX/CPaaS webphone):** a frente de telefonia separada, em cotação com o Luccas. Softphone SIP/WebRTC para um provedor telecom, INDEPENDENTE do WhatsApp/Cloud API. Número PSTN (0800), provedor e mídia próprios.

Ambos plugam na **MESMA UI de chamada** do CRM, mas por **pontes de servidor diferentes** — mesmo padrão do omnichannel: eventos canônicos + adaptador por provedor.

## 5. Encaixe na arquitetura omnichannel

- Estender o modelo canônico: além de `EventoCanonico` (mensagens), criar `EventoChamadaCanonico` (`call.incoming`/`accepted`/`ended`/`missed`/`recording_ready`) + interface `ChamadaAdapter` por provedor (`MetaCallingAdapter`, `SipCallingAdapter`), espelhando `parse`/`enviar`.
- Persistir chamadas: modelo `Chamada` novo (FK conversa/lead/agente, direção, provider, externalId, início/fim, duração, status, `gravacaoUrl` **só link**). Gravação fica na nuvem do provedor (link apenas) — mesma conclusão do `LEVANTAMENTO_WHATSAPP_OFICIAL_TELEFONIA.md`: **peso ~zero no nosso banco**.
- Sinalização anda no Socket.io **existente** (depois de ganhar auth+rooms) → sem infra nova para browser↔servidor; mídia browser↔provedor é WebRTC direto → **peso ~zero no servidor**.

## 6. Fase proposta: F7-Calling (depois do F6 do doc canônico)

> Nome **F7**, não "F4-Calling" — F4 já é o `CloudApiAdapter` no doc canônico.

- **F7.0 — Endurecer Socket.io:** `io.use()` (auth) + rooms por agente. Pré-requisito, e útil por si só (reduz ruído de broadcast em TODAS as features de tempo real). **É a mudança mais arriscada** (toca como todo cliente conecta) — fazer com contrato dourado. Bounded, reversível.
- **F7.1 — Modelo canônico de chamada:** `Chamada` (schema aditivo) + `EventoChamadaCanonico` + interface `ChamadaAdapter`.
- **F7.2 — Voz entrando (receber):** `MetaCallingAdapter` webhook `calls` → sinalização → `RTCPeerConnection` (áudio) no browser → UI (aceitar/recusar/em-chamada). Atrás de flag.
- **F7.3 — Voz saindo (fazer):** click-to-call no card do lead; fluxo de opt-in `VOICE_CALL_REQUEST` para business-initiated.
- **F7.4 — Gravação:** guardar só link; player na timeline da conversa.
- **F7.5 — Vídeo (adiado):** mesma sinalização + tracks de vídeo + UI; **ligar só quando a Meta soltar vídeo em produção**. Arquitetar agora, flag off.

## 7. Cadeia de dependência dura (explicitar ao Luccas)

pagamento na WABA → templates aprovados → app inscrito no webhook → **F4** (`CloudApiAdapter`) → **F5/F6** (cutover: número no Cloud) → **só então F7-Calling (voz)**. Vídeo depende, além disso, da Meta liberar em produção. Não há calling oficial enquanto o número estiver na Evolution.

## 8. Classificação e gate (Artigo 14)

**Architectural** — subsistema novo (protocolo de sinalização, `RTCPeerConnection`, UI de chamada, ponte de provedor, schema). Exige doc de desenho + **OK do Luccas antes de qualquer código**. Este doc é o insumo desse gate; nenhuma linha de implementação foi escrita.
