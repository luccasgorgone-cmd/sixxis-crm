# Plano — Captura de `gclid` no WhatsApp → Google Offline Conversions

**Status:** DESENHO (Artigo 14 — Architectural). Aguardando OK DIRETO do Luccas antes de tocar código.
**Branch de trabalho:** `wip/atendimento-omnichannel-provider-abstract`. **SEM deploy/push.**
**Objetivo (coordenado pelo Marketing):** o algoritmo do Google Ads otimiza num sinal faminto porque a venda fecha no WhatsApp, fora do checkout do Site. Capturando o `gclid` do clique do anúncio e devolvendo a venda ganha como conversão offline, fechamos o mesmo furo que o Purchase do Meta já fechou — só que no lane do **Google** (independente do `ctwaClid`, que já está no ar).

## Contrato (definido com o Marketing)
- Site embute, na 1ª mensagem do `wa.me`, o marcador **`[#g:<gclid>]`**.
- CRM: parseia o marcador na mensagem inbound inicial, guarda o `gclid`, **remove o marcador da exibição** pro atendente.
- Export read-only dos GANHOs de WhatsApp COM gclid, colunas EXATAS:
  `gclid,data,valor,moeda,transaction_id`
  - `data` ISO com offset -03:00 · `valor` 2 casas · `moeda=BRL` · `transaction_id=<negocioId>`
  - filtro `status=GANHO AND gclid NOT NULL` · **SEM PII** · mesmo formato do CSV do Site (pipe `datamanager_upload` do Marketing).

## Precedente no código (espelhar, não inventar)
`ctwaClid` (clid do Click-to-WhatsApp do Meta) já existe e mostra o caminho exato:
- `Lead.ctwaClid String?` (schema linha 260) — click-id mora no **Lead**.
- Capturado SÓ em `direcao===IN`, na 1ª mensagem, **nunca sobrescrito com vazio** (`queue.ts:2162`), com `Atividade(CRIACAO)` de origem.
- Lido do Lead no disparo do Purchase (`route.ts` do PATCH de negócio), valor = `Negocio.valor` (NÃO `valorAjustado`).

## Diferença do caso Google
O `ctwaClid` vem do `externalAdReply` (referral do Evolution). O `gclid` **não** — ele chega **dentro do texto** da 1ª mensagem (`[#g:<gclid>]`), porque o Site pré-preenche o corpo do `wa.me`. Então: parse por regex no texto + strip do marcador antes de persistir o conteúdo.

## Mudanças (quando houver OK — aditivas, sem DROP)
1. **Schema** (`prisma/schema.prisma`): `Lead.googleClickId String?` (espelha `ctwaClid`). Migration aditiva `2026xxxx_lead_google_click_id` (sem DROP/TEMP; roda só no deploy p/ main = catraca).
2. **Parser** (`parseEventoEvolution` em `queue.ts`, caminho F1 canônico): helper puro `extrairGclid(texto)` → `{ gclid, textoLimpo }`.
   - Captura: `/\[#g:([^\]]+)\]/` (pega TUDO até o `]`) e **depois** valida o capturado contra `/^[A-Za-z0-9_.-]+$/` — assim um char inesperado não derruba o gclid inteiro em silêncio (refinamento do Marketing). Se não casar, remove o marcador mas **não** grava lixo.
   - Strip: `/\s*\[#g:[^\]]*\]\s*/g` remove TODAS as ocorrências do marcador + espaço em volta; `trim()` no resto.
   - **v1 = SÓ gclid.** `gbraid`/`wbraid` (tráfego iOS) ficam pra v1.1 com marcadores próprios (`[#gb:]`/`[#wb:]`) + colunas extras — documentado abaixo como limitação conhecida pra não achar que cobriu iOS sem cobrir.
   - `gclid` entra no evento canônico (`src/lib/canal/tipos.ts`, ao lado de `ctwaClid` na linha 47); `textoLimpo` vira o `conteudo` persistido (atendente nunca vê o marcador).
3. **Ingestão** (bloco IN de origem, `queue.ts:~2162`): grava `lead.googleClickId` gated por `direcao===IN && !lead.googleClickId && ev.gclid` (idêntico ao ctwaClid: nunca sobrescreve). `Atividade(CRIACAO)` "Origem: Google Ads (clique rastreado)" — **sem** o valor cru na descrição.
4. **Export** (decisão Q4 do Marketing = ARQUIVO, não credencial): a entrega pro pipe `datamanager_upload` é um **arquivo** escrito no workspace — `exports/google-offline-AAAA-MM-DD.csv` — que o pipe lê do filesystem (evita espalhar credencial de sessão admin). Gerador compartilhado (função pura que monta as linhas) reusado por:
   - **(a) escrita em arquivo** `exports/google-offline-AAAA-MM-DD.csv` (caminho do pipe; depois a cadência vira o próximo-passo #4 do Marketing, agendado);
   - **(b) rota admin opcional** `GET /api/admin/relatorios/google-offline/route.ts` (`text/csv`), só pra download humano no painel — não é o caminho do pipe.
   - **Dialeto (Q5 confirmado 1:1 com o Site):** separador `,` · **UTF-8 sem BOM** · quebra de linha **LF** (`\n`). O BOM quebra a 1ª coluna (`gclid`) no `DictReader` do uploader — então gravar bytes crus, nunca `﻿` no começo.
   - Query: `negocio` `status=GANHO` + `lead.googleClickId != null`; pega o `HistoricoNegocio` mais recente `tipo=GANHO` (`criadoEm`, `valorGanho`).
   - Linha: `gclid`=lead.googleClickId · `data`=ISO(-03:00) do `criadoEm` do GANHO · `valor`=`Number(Negocio.valor).toFixed(2)` (espelha o Meta; só `valor>0`) · `moeda`=BRL · `transaction_id`=negocioId.
   - 1 linha por negócio (transaction_id único). Header exato `gclid,data,valor,moeda,transaction_id`. Sem PII.
5. **Teste de contrato** (`scripts/contratos/`): golden do `extrairGclid` (puro, sem DB/rede) — casos: marcador no fim, no meio, ausente, inválido, múltiplo.

## Gate
`tsc --noEmit` + `next build` verdes. **NENHUM deploy/push** (Artigo 1 — catraca, só Luccas direto).

## Decisões (fechadas com o Marketing — inter-session, desenho; o OK pra CODAR é do Luccas direto)
- **Q1 — modelo do gclid:** ✅ no **Lead** (espelha ctwaClid).
- **Q2 — `data` da conversão:** ✅ `criadoEm` do `HistoricoNegocio` GANHO mais recente (= "houve ganho").
- **Q3 — `valor`:** ✅ `Negocio.valor`, igual ao Meta (ignora `valorAjustado`).
- **Q4 — entrega do CSV:** ✅ **arquivo** `exports/google-offline-AAAA-MM-DD.csv` lido do filesystem pelo pipe (sem credencial de sessão admin); rota GET admin é extra, só pra download humano.
- **Q5 — dialeto do CSV:** ✅ `,` + UTF-8 + LF, **SEM BOM** (confirmado 1:1 com o CSV do Site; BOM quebraria a coluna `gclid` do `DictReader`).
- **Marcador:** ✅ `[#g:<gclid>]`, captura `/\[#g:([^\]]+)\]/` + validação de charset `[A-Za-z0-9_.-]`. **v1 = só gclid.**

## Limitação conhecida v1 (iOS)
Em iOS, o Google às vezes entrega `gbraid`/`wbraid` no lugar do `gclid`. v1 **não** captura esses — só `gclid`. v1.1 adiciona marcadores próprios (`[#gb:]`/`[#wb:]`) + colunas extras no CSV quando o Marketing/Google priorizar. Registrado aqui pra não parecer que iOS está coberto.

## O que falta pro go-live (além do código)
1. **OK direto do Luccas** no desenho (gate Artigo 14) pra eu codar. ← ÚNICO bloqueio pra começar o código.
2. Site realmente embutindo `[#g:<gclid>]` no corpo do `wa.me` (time do Site, Marketing coordena).
3. Deploy p/ main + migration aditiva = catraca (Luccas direto).
4. ✅ Q4 (arquivo) e Q5 (dialeto sem BOM) já fechados com o Marketing — não bloqueiam mais.
