# Levantamento — WhatsApp Oficial (Cloud API) + Voz/Vídeo + Telefonia 0800

**Data:** 2026-09-22
**Autores:** Jarvis CRM (integração/custo/telefonia) + Jarvis Meta (conta Meta/API/anti-bloqueio)
**Status:** LEVANTAMENTO — nada tocado em código ou no atendimento. Aguardando decisão do Luccas.
**Relacionado:** `docs/ARQUITETURA_ATENDIMENTO_OMNICHANNEL.md` (o adapter Cloud API já está desenhado lá).

> Pedido do Luccas: (1) o que falta pra ter a API oficial do Meta, já com número verificado; (2) colocar chamada e videochamada no CRM; (3) entender o "manda mensagem por ~30 centavos mas não toma bloqueio"; (4) ficar com um só número; (5) telefonia 0800 dentro ou fora do sistema.

---

## 1. Estado real da conta Meta (inspeção via tools meta-ads — Jarvis Meta)

- ✅ **Business Portfolio "sixxisoficial"** (ID `653605780059117`) — `verification_status = VERIFIED`. **A Business Verification, que é o passo que mais trava, JÁ ESTÁ FEITA.** Criado em 2023.
- ✅ **Página FB "Sixxis do Brasil"** (ID `113494068344928`) ligada ao business.
- ✅ **Instagram business** presente (ID `17841404571523891`).
- ✅ **System User "Conversions API System User"** (ID `122169495176667914`) já existe — pode ser reaproveitado pra gerar o token de WhatsApp.
- ⚠️ **Ponto cego (nenhum agente vê por API):** o token atual é de ADS (escopos `ads_*`/`business_management`), sem escopo de WhatsApp — não dá pra listar WABA nem status do número por aqui. **Ação do Luccas:** confirmar no painel **Business Manager → Contas do WhatsApp** se já existe uma WABA e se o número verificado já está registrado nela (verificação de número no app ≠ registro na Cloud API).

## 2. O que falta pra ativar a Cloud API (dado o business já verificado)

Conexão direta na **Cloud API é GRÁTIS** (só paga as mensagens). **BSP não é necessário — nem pra mensagem nem pra calling** (ambos rodam direto na Cloud API hospedada pelo Meta). Ver §4.

1. **Confirmar/criar a WABA** e registrar o número verificado nela.
2. **Display name aprovado.**
3. **Meta App** com use case WhatsApp + **token permanente** via System User com escopos `whatsapp_business_messaging` + `whatsapp_business_management` (reaproveitar o System User de CAPI que já existe).
4. **Webhook HTTPS público** com verify token/challenge — **é aqui que muda o código do CRM** (§5).
5. **Migração do número via Coexistence:** o número fica no **app WhatsApp normal E na API ao mesmo tempo, sem perder histórico**. Migração sem trauma — resolve o "ficar com um só número" sem desligar nada.

## 3. Custo por mensagem e "não toma bloqueio"

Modelo atual (desde jul/2025): cobrança **por mensagem** (não mais por conversa de 24h). Preços BR aproximados:

| Categoria | Custo aprox. (BR) | Quando |
|---|---|---|
| **Serviço** (cliente iniciou, dentro de 24h) | **R$ 0** | cliente responde anúncio e conversamos |
| Utilidade | R$ 0,04–0,05 | confirmação de pedido, aviso |
| Autenticação | R$ 0,15–0,19 | código/verificação |
| **Marketing** (template) | **R$ 0,31–0,38** | nós iniciamos fora da janela (ex.: reativação) |

**O "30 centavos" é a mensagem de marketing por template.** Mas o grosso do nosso fluxo é **cliente iniciando** (responde anúncio) → dentro de 24h é **grátis** conversar. Só paga template quando **nós** iniciamos fora da janela. O custo real fica bem abaixo de "30 centavos por mensagem".

**➕ Free Entry Point (importante pra nós):** lead que chega por **anúncio Click-to-WhatsApp** ou botão CTA abre uma **janela GRÁTIS de 72h** pra qualquer tipo de mensagem (não só resposta). Como a maioria dos nossos leads vem de anúncio do Meta, boa parte do funil ganha **72h de texto livre grátis** — reforça ainda mais que o custo real é baixo. Se o toque inicial for por anúncio, ganha a janela; se não, aí sim template de marketing pago.

**"Não toma bloqueio":**
- A API oficial **não bane a conta aleatoriamente** como a Evolution não-oficial. Esse é o ganho central.
- Existe **quality rating** (verde/amarelo/vermelho, por bloqueios/denúncias dos clientes nos últimos 7 dias) e **tiers de volume**: começa em **1.000 destinatários únicos/dia**, sobe pra 10k → 100k → ilimitado conforme qualidade. Escala sozinho mantendo qualidade — o oposto do risco de ban da Evolution.
- Teto que não dá pra burlar: ~2 templates de **marketing** por usuário/dia somando todas as empresas (não contorna com vários números).
- **Calling exige tier mínimo de 2.000/dia.**

## 4. Voz e vídeo no CRM (WhatsApp Business Calling API)

- **Voz VoIP:** GA no Brasil, via WebRTC. Dá pra fazer **click-to-call embutido** na UI do vendedor. Cliente liga = **grátis**; negócio liga = **pago** (pulsos de 6s) e exige **opt-in** do cliente.
- **Vídeo:** ainda **NÃO** disponível — previsão BR ~Q4/2026.
- **Sem gravação nativa** da chamada.
- **NÃO exige BSP** — roda direto na Cloud API (Graph API + webhooks + WebRTC). Pré-requisitos oficiais: número na Cloud API, assinar webhook `calls` (a menos que use SIP, que é opcional), app assinado na WABA, permissão `whatsapp_business_messaging`, e **tier mínimo de 2.000 destinatários/dia**. Ou seja: infra grátis, só paga a chamada business-initiated (pulsos de 6s).
- Trabalho do lado CRM: servidor de sinalização (**reaproveita o Socket.io que já roda in-process**), UI de chamada no navegador, gestão de `RTCPeerConnection`, assinar o webhook `calls`. **Não é widget pronto.** Fazer **depois** da migração de mensagem.

## 5. Esforço de migração Evolution → Cloud API (Jarvis CRM)

Hoje: WhatsApp entra por **Evolution API (não-oficial)** → webhook → fila BullMQ → `queue.ts` (que mistura parsing da Evolution com regra de negócio, ~linhas 1768–2320; sem camada anti-corrupção). Zero código de Cloud API hoje. O alvo (adapters) já está desenhado em `ARQUITETURA_ATENDIMENTO_OMNICHANNEL.md`.

Estimativa T-shirt (número firme só depois de scoping no código real):

| Fase | O que é | Tamanho |
|---|---|---|
| **F0** | Extrair o parsing da Evolution de `queue.ts` pra um adapter puro `parse → EventoCanonico → ingerir()`. Paga sozinho, independe do resto. | Médio–Grande |
| **F1** | Adapter Cloud API **inbound**: webhook Meta (GET verify/challenge + POST validado por HMAC), parse → mesmo EventoCanonico. | Médio |
| **F2** | Adapter Cloud API **outbound**: texto livre na janela 24h + **template aprovado** fora dela. Cauda no ciclo de vida do template (criar/aprovar/sincronizar/variáveis). | Médio |
| **F3** | Cutover via Coexistence, com Evolution de pé como fallback (strangler). | Pequeno–Médio |
| **F4** | Hardening: tracking da janela 24h, quality/tier, opt-in de calling, retry/erro. | Médio |

**Resumo honesto:** são **semanas** de trabalho focado, não dias — custo real em F0 (desacoplar `queue.ts`) + ciclo de template (F2). Mas **incremental e baixo risco**: a Evolution continua rodando até a oficial estar provada no sandbox que já existe. Não é big-bang.

**Impacto de negócio (mudança de fluxo, não só de custo):** hoje a **campanha de reativação** dispara texto livre; na oficial, iniciar fora da janela de 24h **exige template de marketing aprovado** (~R$0,31–0,38/msg). Dentro de 24h (cliente respondeu anúncio) = texto livre grátis.

## 6. Telefonia 0800 / VoIP

- **Não pesa o servidor do CRM** em nenhum cenário: o áudio vai **direto navegador do vendedor ↔ provedor** (55PBX/Zenvia/Twilio); nosso backend só troca token/sinalização leve.
- **Opção A — fora do sistema:** discador no PC de cada vendedor. **Zero desenvolvimento**, roda amanhã. Perde o vínculo ligação↔cliente no CRM.
- **Opção B — integrado:** softphone WebRTC embutido no card + ligação vira histórico. É dev (SDK do provedor no front + endpoint de token no back), mas **independente do WhatsApp** — pode andar em paralelo. Subsistema novo (Artigo 14).

## 7. Sequência recomendada

1. **Confirmar WABA/registro do número** no painel (ação do Luccas) → pode destravar sem esforço de código.
2. **Migrar o número pra Cloud API (Coexistence)** — resolve "um número só" + fim dos bloqueios da Evolution. Base de tudo.
3. **0800 fora do sistema** já (rápido, sem dev) pra validar uso.
4. **Voz no WhatsApp** e **0800 integrado** como fase seguinte — cada um com desenho + OK do Luccas antes de codar.

## 8. Pendências / decisões do Luccas

- Confirmar existência de WABA + registro do número no painel (§1, ponto cego).
- Cloud API **direto** (grátis) é suficiente pra tudo — mensagem E calling. BSP só se ele quiser um intermediário por conveniência, nunca por obrigação.
- Autorizar (ou não) o início do scoping fino da migração pra fechar prazo real de F0→F3.
