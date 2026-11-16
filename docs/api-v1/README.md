# API de Leitura v1 — CRM Sixxis

API **somente leitura** (read-only) para programas externos consultarem dados do
CRM: leads, negócios, conversas, mensagens, pagamentos, métricas e mais. Projetada
para integração e sincronização incremental, com **deny-by-default** em segredos e PII.

- **Base de produção:** `https://sixxis-crm-production.up.railway.app/api/v1`
- **Versão:** `1.0.0`
- **Formato:** JSON (`application/json`); erros em `application/problem+json` (RFC 9457)
- **Fuso dos recortes temporais de métricas:** `America/Sao_Paulo`
- **Spec máquina:** [`openapi.json`](./openapi.json) · [`openapi.yaml`](./openapi.yaml) · docs interativas em `GET /docs`
- **Coleção Postman:** [`colecao.postman.json`](./colecao.postman.json)
- **Exemplo de sync:** [`sync-exemplo.py`](./sync-exemplo.py)

---

## 1. Princípios de segurança

1. **Somente leitura.** Só `GET` / `HEAD` / `OPTIONS`. Qualquer `POST`/`PUT`/`PATCH`/`DELETE`
   responde `405`. As únicas escritas internas são o log de auditoria e o carimbo
   `ultimoUsoEm` da chave.
2. **Allowlist por recurso (fronteira anti-vazamento).** Cada recurso declara
   explicitamente a lista de campos expostos. Só o que está na lista chega ao banco
   (`select`) e ao JSON. Segredos simplesmente **não existem** para a API — nunca são
   lidos. Ficam de fora, por exemplo: `Agente.senha`, tokens do Mercado Livre
   (`accessToken`/`refreshToken`), `metaCapiToken`, tokens/credenciais de instância
   WhatsApp, `Mensagem.raw` (payload bruto Evolution), `Pagamento.initPoint` (link de
   checkout ativo), blobs de logo/favicon e todos os models `Sandbox*`.
3. **Chave guardada só como hash.** A chave em claro (`sxc_live_...`) é mostrada **uma
   única vez** na criação. O banco guarda apenas o SHA-256; a verificação é
   constant-time. Perdeu a chave → gere outra e revogue a antiga.
4. **PII protegida por escopo.** Telefone, e-mail, documento, endereço e nome só vêm em
   claro com `read:pii`. Sem esse escopo, vêm **mascarados** (ex.: `(11) 9****-1234`,
   `j***@gmail.com`).
5. **Conteúdo de mensagem protegido por escopo.** O texto das mensagens só vem com
   `read:mensagens`. Sem ele, o campo volta `null` (metadados continuam disponíveis).

---

## 2. Autenticação

Toda rota (exceto `/health`, `/openapi.json` e `/docs`) exige o cabeçalho:

```
Authorization: Bearer sxc_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

Falha de credencial (ausente, inválida, revogada ou expirada) → **`401`** genérico,
sem revelar qual foi o motivo (não é oráculo). Chave válida mas sem o escopo do recurso
→ **`403`**.

Descubra o que sua chave pode fazer em `GET /me`:

```json
{
  "data": {
    "id": "ck...",
    "nome": "luccas-programa-externo",
    "prefixo": "sxc_live_abcd",
    "escopos": ["read:all", "read:pii", "read:mensagens"],
    "expiraEm": null,
    "podeVerPii": true,
    "podeVerMensagens": true
  },
  "meta": { "requestId": "req_..." }
}
```

> A chave **nunca** deve ser commitada, logada ou colada em chat. Passe por variável de
> ambiente (`SIXXIS_API_TOKEN`).

---

## 3. Escopos

| Escopo | Concede |
|---|---|
| `read:all` | Leitura de **todos** os recursos de domínio. **Não** concede `read:pii` nem `read:mensagens` — esses são sempre explícitos. |
| `read:pii` | Revela PII em claro (telefone, e-mail, documento, endereço, nome). |
| `read:mensagens` | Revela o conteúdo de texto das mensagens. |
| `read:<dominio>` | Leitura de um domínio específico (ver tabela da seção 5). |

Escopos de domínio disponíveis: `read:agentes`, `read:clientes`, `read:negocios`,
`read:conversas`, `read:pedidos`, `read:produtos`, `read:catalogo`, `read:pagamentos`,
`read:campanhas`, `read:tarefas`, `read:metas`, `read:analytics`, `read:integracoes`,
`read:config`, `read:supervisor`, `read:oracle`.

Uma chave só vê um recurso se tiver `read:all` **ou** o escopo de domínio daquele recurso.
Para PII/mensagens, sempre precisa somar `read:pii` / `read:mensagens`.

---

## 4. Endpoints

### Transversais
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/health` | não | Liveness: `{ status, version, commit, time }`. |
| GET | `/me` | sim | Dados da chave autenticada (nunca o token). |
| GET | `/meta/recursos` | sim | Catálogo de recursos, escopos, campos e filtros. |
| GET | `/metricas` | sim | Lista de métricas (KPIs) disponíveis. |
| GET | `/metricas/{nome}` | sim | Executa uma métrica (ver seção 6). |
| GET | `/openapi.json` | não | Especificação OpenAPI 3.1 (gerada do registro). |
| GET | `/docs` | não | Documentação interativa (HTML). |

### Recursos (genérico, 51 recursos)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/{recurso}` | Lista paginada por cursor. |
| GET | `/{recurso}/{id}` | Um item por id. |

---

## 5. Parâmetros de consulta (listas)

| Param | Tipo | Default | Descrição |
|---|---|---|---|
| `limit` | int (1–500) | 100 | Tamanho da página. |
| `cursor` | string | — | Cursor keyset opaco (use `meta.nextCursor` da página anterior). |
| `ids` | string | — | Lista de ids separada por vírgula (**máx. 500**; acima disso → `400`). |
| `fields` | string | — | **Campos esparsos** separados por vírgula (`id` sempre incluído). Reduz payload. |
| `expand` | string | — | Expansões de profundidade 1, separadas por vírgula. |
| `atualizadoDesde` | date-time (ISO) | — | **Sync incremental:** só registros alterados desde a data. |
| `atualizadoAte` | date-time (ISO) | — | Limite superior de alteração. |
| `criadoDesde` / `criadoAte` | date-time (ISO) | — | Janela por data de criação. |
| `incluirExcluidos` | bool | false | Inclui registros com soft-delete. |
| `q` | string | — | Busca textual livre (quando o recurso suporta). |

Além destes, cada recurso aceita **filtros naturais** próprios (igualdade exata), p.ex.
`leads?origem=...&donoId=...`. O catálogo completo de filtros por recurso está em
`GET /meta/recursos` e no `openapi.json`.

### Recursos e sensibilidade

Legenda: **PII** = tem campo mascarado sem `read:pii`; **MSG** = tem conteúdo que exige `read:mensagens`.

| Recurso | Escopo | PII | MSG |
|---|---|:--:|:--:|
| agentes | read:agentes | ✓ | |
| presencas | read:agentes | | |
| leads | read:clientes | ✓ | |
| enderecos | read:clientes | ✓ | |
| empresas-faturadas | read:clientes | | |
| produtos-interesse | read:clientes | | |
| notas | read:clientes | | |
| atividades | read:clientes | | |
| negocios | read:negocios | | |
| negocios-historico | read:negocios | | |
| etapas | read:negocios | | |
| etiquetas | read:negocios | | |
| rastreios | read:negocios | | |
| notas-fiscais | read:negocios | | |
| alertas-negocio | read:negocios | | |
| orcamentos | read:negocios | | |
| orcamento-itens | read:negocios | | |
| config-alerta-sla | read:config | | |
| conversas | read:conversas | | |
| mensagens | read:conversas | ✓ | ✓ |
| grupos | read:conversas | | |
| mensagens-grupo | read:conversas | ✓ | ✓ |
| respostas-rapidas | read:conversas | | |
| tarefas | read:tarefas | | |
| lembretes | read:tarefas | | |
| notificacoes | read:tarefas | | |
| cotacoes | read:produtos | | |
| itens-pedido | read:pedidos | | |
| itens-local | read:pedidos | ✓ | |
| produtos-catalogo | read:catalogo | | |
| movimentacoes-peca | read:catalogo | | |
| pecas-uso | read:catalogo | | |
| pagamentos | read:pagamentos | | |
| campanhas | read:campanhas | | |
| campanha-destinos | read:campanhas | ✓ | |
| campanhas-recaptacao | read:campanhas | | |
| recaptacao-envios | read:campanhas | | |
| prospeccao | read:campanhas | | |
| carteira-lotes | read:campanhas | | |
| carteira-contatos | read:campanhas | ✓ | |
| metas | read:metas | | |
| eventos-capi | read:analytics | | |
| instancias-whatsapp | read:integracoes | ✓ | |
| integracao-mercadolivre | read:integracoes | | |
| configuracao | read:config | | |
| config-roteamento | read:config | | |
| config-agente-ia | read:config | | |
| supervisor-acoes | read:supervisor | | |
| oracle-conversas | read:oracle | | |
| oracle-mensagens | read:oracle | | ✓ |
| sol-eventos | read:oracle | | |

> O dicionário de campos de cada recurso (nome, tipo, descrição) está no `openapi.json`
> (schemas) e em `GET /meta/recursos`. Esta é a fonte única — se a tabela acima e o spec
> divergirem, **o spec manda**.

---

## 6. Métricas (KPIs)

`GET /metricas` lista; `GET /metricas/{nome}` executa. Exigem escopo **`read:analytics`**
(ou `read:all`). Aceitam recorte temporal `de` / `ate` (ISO; default: últimos 30 dias) e,
nas métricas com série temporal, `agrupar` (`dia`/`semana`/`mes`). Fuso: `America/Sao_Paulo`.

| Métrica | O que retorna |
|---|---|
| `leads-por-origem` | Contagem de leads agrupada por origem. |
| `funil` | Negócios **abertos** distribuídos por etapa. |
| `faturamento` | **Ganho no período** + série temporal. |
| `vendedores` | Desempenho por vendedor (ganhos no período). |
| `mensagens` | Volume de mensagens (entrada/saída) por instância. |
| `tarefas` | Tarefas abertas / vencidas. |

> **Definição de faturamento (crítica).** Faturamento conta por **"houve ganho no
> período"**, usando `HistoricoNegocio{tipo:GANHO}.valorGanho` + a data do evento de
> ganho — **não** pelo status atual do negócio. Assim, reabrir um negócio ganho **não**
> zera o faturamento histórico. (Esse é o bug histórico nº1 do CRM; a API já segue a
> regra correta.)

---

## 7. Formato de resposta

**Lista:**
```json
{
  "data": [ { "id": "...", "...": "..." } ],
  "meta": { "requestId": "req_...", "hasMore": true, "nextCursor": "eyJ..." }
}
```

**Item:**
```json
{ "data": { "id": "...", "...": "..." }, "meta": { "requestId": "req_..." } }
```

- `meta.hasMore` indica se há mais páginas; quando `true`, use `meta.nextCursor` no
  próximo request. Quando `false`, acabou.
- Datas saem em **ISO 8601 UTC**. Valores monetários saem como **string decimal com 2
  casas** (BRL), para não perder precisão.

---

## 8. Erros (RFC 9457 — `application/problem+json`)

```json
{
  "type": "escopo-insuficiente",
  "title": "Escopo insuficiente",
  "status": 403,
  "detail": "A chave nao possui o escopo necessario para este recurso.",
  "instance": "/api/v1/pagamentos",
  "requestId": "req_..."
}
```

| status | type | Quando |
|---|---|---|
| 400 | `parametro-invalido` | Query malformada (data inválida, limite fora de faixa, cursor corrompido). |
| 401 | `nao-autenticado` | Bearer ausente/ inválido/ revogado/ expirado (genérico). |
| 403 | `escopo-insuficiente` | Chave válida sem o escopo do recurso/PII/mensagens. |
| 404 | `nao-encontrado` | Recurso ou id inexistente. |
| 405 | `metodo-nao-permitido` | Qualquer verbo de escrita. |
| 429 | `rate-limit` | Estourou o limite (ver seção 9). |

Sempre há `requestId` — inclua-o ao reportar um problema.

---

## 9. Rate limit

- **600 requisições por minuto por chave** (janela fixa por minuto).
- Cabeçalhos em toda resposta: `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
  `X-RateLimit-Reset` (segundos até reiniciar).
- Ao estourar: **`429`** + `Retry-After` (segundos). Respeite-o antes de tentar de novo.
- O limitador é **por chave** e roda após a autenticação. Rajada de token inválido
  (401) ainda não é limitada por IP — pendência de endurecimento abaixo.

---

## 9.1 Limitações conhecidas / pendências de endurecimento

Nenhuma afeta sigilo de dado (allowlist deny-by-default segue valendo); são itens de
robustez/operação revistos na auditoria de segurança do release:

- **Rate limit só por chave (não por IP).** O limitador roda depois de `autenticar`,
  então flood de **token inválido** não é freado por IP (cada tentativa é uma consulta
  ao banco). Mitigação futura: teto por IP antes da autenticação. Em degradação do
  Redis o limitador é *fail-open* (não bloqueia) — por ora aceitável porque a API é
  read-only e sem segredos.
- **Colunas `Json` trafegam cruas** nos recursos que as expõem na allowlist
  (`negocios.produtos`, `orcamentos.pagamentos`, `campanhas.filtroJson`,
  `configuracao.horarios`/`feriados`). São dados de negócio (não segredos), mas a forma
  interna pode mudar sem aviso de quebra — trate esses campos como *opacos*.

---

## 10. Sincronização incremental

Padrão recomendado para manter uma cópia local atualizada sem reprocessar tudo:

1. **Carga inicial:** pagine o recurso só com `limit` + `cursor` até `hasMore=false`.
   Guarde o maior `atualizadoEm` (ou `criadoEm`) visto = seu **watermark**.
2. **Execuções seguintes:** chame com `atualizadoDesde=<watermark>` e pagine por cursor.
   Processe, e avance o watermark para o maior valor da rodada.
3. Use `fields=` para trafegar só o que importa.

Exemplo pronto (Python stdlib, com watermark em disco e respeito a `429`):
[`sync-exemplo.py`](./sync-exemplo.py)

```bash
export SIXXIS_API_BASE="https://sixxis-crm-production.up.railway.app/api/v1"
export SIXXIS_API_TOKEN="sxc_live_..."
python3 -I sync-exemplo.py leads negocios conversas
```

---

## 11. Exemplos `curl`

```bash
BASE="https://sixxis-crm-production.up.railway.app/api/v1"
TOKEN="sxc_live_..."

# health (sem auth)
curl -s "$BASE/health"

# quem sou eu / meus escopos
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/me"

# primeira página de leads, só alguns campos
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/leads?limit=50&fields=id,nome,origem,criadoEm"

# página seguinte (use o nextCursor da anterior)
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/leads?limit=50&cursor=eyJ..."

# sync incremental: negócios alterados desde uma data
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/negocios?atualizadoDesde=2026-11-01T00:00:00Z"

# um item por id
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/negocios/ckxyz..."

# métrica de faturamento (de/ate; agrupar p/ série temporal) — exige read:analytics
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/metricas/faturamento?de=2026-11-01&ate=2026-11-30&agrupar=dia"

# PII mascarada sem read:pii; em claro só com a chave que tem read:pii
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/leads/ckxyz...?fields=id,nome,telefone,email"
```

---

## 12. Versionamento

- Caminho versionado: `/api/v1`. Mudanças **retrocompatíveis** (novos recursos, campos,
  métricas, filtros) entram em `v1` sem aviso de quebra.
- Mudanças **incompatíveis** (remover/renomear campo, alterar semântica) só em uma `v2`
  futura; `v1` segue disponível durante a transição.
- O `openapi.json` traz `x-build` (versão + commit do deploy) — fonte da verdade do que
  está no ar.

### Changelog

- **v1.0.0** — Release inicial: 51 recursos, 6 métricas, auth Bearer com escopos,
  mascaramento de PII/mensagens por escopo, paginação por cursor, sync incremental,
  rate limit 600/min, erros RFC 9457, OpenAPI 3.1 e docs interativas.
