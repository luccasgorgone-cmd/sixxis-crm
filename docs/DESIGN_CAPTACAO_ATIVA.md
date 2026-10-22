# Desenho — Aba "Captação Ativa" (Supervisor, admin-only)

Status: PROPOSTA (aguardando aprovação do Luccas antes de qualquer código).
Data: 2026-10-22. Branch de trabalho: `wip/atendimento-omnichannel-provider-abstract`.

## Intenção e porquê

O Luccas quer **saber quais clientes foram adicionados manualmente** (cadastrados
na mão por um vendedor) em contraste com os que entraram sozinhos (WhatsApp /
anúncio / site). O objetivo de negócio é **medir se os vendedores estão fazendo
prospecção ativa de clientes** — e não só reagindo a quem chega. A superfície é
uma nova aba **"Captação Ativa"**, com acesso **somente admin**, "bem completa"
(quanto mais informação melhor) e com visão **por período**.

## O sinal de dados (já existe, não inventado)

Verificado no código em 2026-10-22:

- Cadastro manual (`POST /api/leads`, `src/app/api/leads/route.ts:174-204`) grava
  **`Lead.origem = "manual"`** — exclusivo desse fluxo. A ingestão do WhatsApp
  (`src/lib/queue.ts:2145,2186,2208`) grava `"whatsapp"` / `"anuncio"` /
  `"google-ads"`. Logo `origem === "manual"` é o marcador limpo de "adicionado
  na mão".
- O mesmo fluxo registra **`Atividade(tipo=CRIACAO)`** com `agenteId` = **quem
  cadastrou** e descrição "Cliente cadastrado manualmente e atribuído a X".
- Vincular um telefone **já existente** a um dono é registrado como
  `Atividade(tipo=ATRIBUICAO)` — **não** é captação de cliente novo e **não entra**
  na contagem (senão infla).
- `Lead.criadoEm` = quando (filtro por período). `Lead.donoId` = vendedor dono.

Definição canônica de "captação ativa" nesta aba:
> Lead com `origem = "manual"` **e** um `Atividade(CRIACAO)` de cadastro manual,
> com `criadoEm` dentro do período. Revínculos (`ATRIBUICAO`) ficam de fora.

## Atribuição (decidido com o Luccas)

- **Ranking credita o vendedor dono** (`Lead.donoId`) — é dele o cliente.
- A **coluna "cadastrado por"** (`Atividade(CRIACAO).agenteId`) fica **sempre
  visível** na lista. Quando um admin cadastra e atribui a um vendedor, isso fica
  explícito — não se confunde esforço do vendedor com cadastro administrativo.

## O que a aba mostra (metas de conteúdo)

Tudo recortado pelo período selecionado, com comparação vs. período anterior de
mesma duração (padrão ▲/▼ já usado no Supervisor):

1. **KPIs de topo:** total de clientes captados no período; nº de vendedores que
   captaram; taxa de conversão dos captados (viraram GANHO) e **R$ gerado** por
   eles.
2. **Ranking por vendedor:** nº de captados + conversão + R$ gerado por vendedor,
   com barra proporcional (padrão do `PainelRelatorios`). Clique no vendedor =
   drilldown da lista só dele.
3. **Tendência no tempo:** captações por dia (ou semana quando o período é longo).
4. **Lista detalhada** (o "quanto mais melhor"): por cliente — nome, telefone,
   **vendedor dono**, **cadastrado por**, data do cadastro, etapa atual do negócio,
   e valor se GANHO. Com busca e paginação.

## Onde mora e acesso

- **Nova aba "Captação Ativa"** no `SupervisorConsole.tsx` (junto de Relatórios /
  Alertas / Chat / Config / Explicativo).
- **Admin-only**: o endpoint usa `obterAdmin()` como todas as rotas
  `/api/admin/supervisor/*`. A aba reaproveita o **filtro de período** que o
  console já tem.

## Regra de dinheiro (constraint)

"R$ gerado pelos captados" segue a **regra de faturamento canônica** do CRM
("houve ganho no período" via `HistoricoNegocio`, respeitando
`valorAjustado ?? valor` como valor efetivo). Não reinventar; reusar os helpers
existentes de faturamento/painel (`src/lib/supervisor/painel.ts`,
`vendasPeriodo`). Atenção ao bug histórico nº1 (`valorAjustado = 0` pendurado).

## Metas / não-metas / anti-metas

- **Meta:** medir prospecção ativa por vendedor, por período, com conversão e R$.
- **Não-meta:** editar/mexer no cadastro de clientes; mexer em roteamento; tocar
  no fluxo de ingestão.
- **Anti-meta (falha mesmo "funcionando"):** contar revínculos de telefone
  existente como captação; creditar prospecção a quem não captou; vazar a aba
  para não-admin.

## Peças a construir (sem schema novo)

- `src/lib/supervisor/captacao.ts` — função pura de agregação (recebe janela,
  devolve KPIs + ranking + série temporal + linhas da lista). Testável sem banco
  via injeção dos registros, ou com query dedicada.
- `GET /api/admin/supervisor/captacao` — `obterAdmin()` + período → chama a lib.
- `src/components/supervisor/PainelCaptacao.tsx` — a aba (recharts já em uso;
  tokens `var(--color-*)` theme-aware; sem tabela em markdown — é web).
- Fiar a aba no `SupervisorConsole.tsx` (tab + ícone lucide + roving tabindex já
  existente).

## Deixado para o builder

- Formato exato da série temporal (dia vs. semana por tamanho do período).
- Paginação/tamanho de página da lista; se exporta CSV (seguir padrão
  `googleOffline.ts` se sim: `;`+BOM pt-BR para abrir no Excel — **diferente** do
  CSV do Google, que é sem BOM).
- Teste de contrato dourado para a lib pura (seguindo `scripts/contratos/*`).

## Correções e decisões pós-revisão de builder (minhas)

- **`origem="manual"` é fonte única confiável** — verificado: nenhum seed/import
  grava esse valor, só `POST /api/leads`. A contagem não infla.
- **Predicado da linha:** cohort = `Lead.origem="manual"` com `criadoEm` na janela.
  "Cadastrado por" = o `Atividade(CRIACAO)` com `agenteId` **não-nulo** e descrição
  de cadastro manual (as ingestões anúncio/google-ads também criam `CRIACAO`, mas
  sem `agenteId` — então escolher o CRIACAO com `agenteId` evita ambiguidade).
- **Finalidade + dono por finalidade:** a aba honra o filtro Venda/Pós-venda/Tudo
  que o console já tem. "Vendedor dono" = `donoId` para VENDA e `donoPosVendaId`
  para POS_VENDA (senão toda captação de pós-venda sumiria, pois o cadastro manual
  grava o dono em `campoDono(finalidade)`).
- **Fuso do agrupamento diário:** dia em `America/Sao_Paulo`, consistente com como
  o período é resolvido no resto do CRM (`resolverPeriodo`), pra a série bater com
  o total.

## Decisão pendente (do Luccas)

**Conversão e R$ gerado = coorte, não "fechado no período".** Recomendo medir por
**coorte**: pego os clientes captados na janela e sigo os negócios deles **pra
frente, sem filtrar por data de fechamento** — quantos viraram GANHO e quanto
geraram no total. É o que responde "a prospecção deu resultado?". A alternativa
(só vendas fechadas DENTRO da janela, regra `vendasPeriodo`) faria um cliente
captado dia 28 de um mês parecer "0% convertido" e a aba pareceria quebrada.
Preciso do teu OK nessa leitura (coorte) — muda o número de conversão/R$ exibido.

## Gate

Nada é construído até o Luccas aprovar este desenho. Deploy para `main` (Railway)
é catraca cheia e exige OK direto dele no momento de subir — este doc e o código
ficam na branch `wip/*` até lá.
