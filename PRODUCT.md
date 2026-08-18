# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Vendedores de venda** (Marcello, Miguel, Pedro): trabalham o dia inteiro dentro do Inbox e do Kanban, atendendo clientes que chegam por anúncio no WhatsApp, movendo o negócio pelas etapas (Novo → Em atendimento → Negociando → FollowUp 1/2/3 → Aguardando pagamento → Vendido/Perdido), fechando orçamento e confirmando venda.

**Vendedor de pós-venda** (Vitor): mesmo padrão de trabalho, funil próprio (Aberto → Em atendimento → Aguardando cliente → Resolvido/Encerrado sem solução) — dúvidas, garantia, peças, rastreio.

**Faturamento** (Emerson): entra para conferir/gerar nota fiscal por negócio fechado.

**Admin** (Luccas, fundador/dev/CEO da Sixxis): configura o sistema inteiro (etapas, roteamento, Meta CAPI, IA dormente, arquivamento), acompanha dashboard/carteira/metas/mapa regional, e roda rotas administrativas de manutenção (correção de duplicados, diagnóstico de faturamento).

Situação real de uso: equipe pequena (~6 pessoas), turno comercial inteiro com a tela aberta, decisão tomada rápido dentro da própria conversa — não é uma ferramenta que alguém "visita"; é o posto de trabalho.

## Product Purpose

Centralizar todo o relacionamento com o cliente da Sixxis (e-commerce de climatizadores, bikes de spinning e aspiradores) num único lugar: a conversa de WhatsApp, o funil de vendas, o pós-venda, orçamento e pagamento, faturamento, rastreio e as métricas de gestão. Existe porque o atendimento acontecia disperso (WhatsApp solto + planilhas) e a empresa precisava de rastreabilidade de venda real, histórico de cliente confiável e visibilidade de funil sem depender de ferramenta genérica de terceiro.

Sucesso = o vendedor nunca perde um cliente por falta de visibilidade, o faturamento reportado bate com o que realmente aconteceu (mesmo quando um card é reaberto depois), e o histórico do cliente permanece limpo (sem compra duplicada, sem venda fantasma).

## Positioning

Não é um CRM genérico adaptado — é construído sob medida para o processo exato da Sixxis: um lead + finalidade (VENDA ou PÓS-VENDA) nunca duplica negócio (é sempre reaberto, nunca recriado); "houve ganho no período" é a fonte de verdade do faturamento, não o status atual do card (o que sobrevive a reaberturas); a sincronização com a loja (puxar pedido pago pra pré-preencher o fechamento) e a conversão pro Meta CAPI (rastrear a venda de volta ao anúncio que originou) são nativas do fluxo, não plugins genéricos. Um SaaS de CRM comprado não reproduziria essa lógica de negócio sem trabalho equivalente.

## Operating Context

- **Inbox de WhatsApp em tempo real** (Socket.io): mensagens de texto, áudio, imagem, documento chegam ao vivo; reply com citação, reação, edição/apagamento espelhando o comportamento nativo do WhatsApp.
- **Kanban** com duas finalidades (VENDA / PÓS-VENDA) rodando em paralelo — um mesmo cliente pode ter negócio ativo nos dois ao mesmo tempo, com etapas e vendedores diferentes.
- **Fechamento de venda**: orçamento com PDF, link de pagamento (Mercado Pago), possibilidade de puxar o pedido já pago diretamente do site pra pré-preencher.
- **Pós-fechamento**: nota fiscal, rastreio de entrega, garantia (1 ano produto, 3 meses peça, contada da NF).
- **Gestão**: carteira por vendedor, metas, dashboard, mapa de inteligência regional (clima + população), agente de análise "Oracle" (read-only, IA).
- **Administração**: roteamento de leads, configuração de etapas/etiquetas, rotas de manutenção read-only-first (prévia via GET, aplica via POST) para corrigir duplicados e diagnosticar faturamento divergente.
- Uso concentrado em horário comercial, navegador desktop (a operação é de linha de frente sentada, não mobile-first) — sem evidência hoje de uso relevante em celular pela equipe.

## Capabilities and Constraints

- Next.js 16 (App Router) + React 19, custom server (`server.ts`) hospedando Next + Socket.io + workers BullMQ no mesmo processo — não é o modelo serverless padrão do Next.
- Tailwind CSS v4 (`@theme`, tokens em `globals.css`) já em uso — não é greenfield de estilo, é sistema existente a preservar/documentar.
- Tema claro e escuro já implementados (`.dark` remapeando tokens semânticos).
- `lucide-react` para ícones (monocromático, sem emoji na UI — convenção já estabelecida no código).
- `recharts` para gráficos, `d3-geo` + `topojson-client` para o mapa choropleth do Brasil, `@dnd-kit` para drag-and-drop do Kanban.
- Fonte: Inter (`next/font`, variável `--font-inter`), única família tipográfica em uso hoje.
- Zero DROP / migrações só aditivas no banco — regra de engenharia do repositório, não uma questão de produto, mas limita o que uma mudança de UI pode assumir sobre o shape dos dados.
- **Agente de IA "Sol/Luna"**: existe no código (motor completo, `luna.ts`), mas está DORMENTE por decisão explícita do dono — nunca ativar/expor na UI como se estivesse ligado sem instrução direta.
- **Meta CAPI**: integração pronta no código, mas as credenciais (Pixel ID + token) não estão configuradas em produção — hoje é no-op silencioso.
- Indefinido/não confirmado: se há alguma demanda real de uso em tablet/mobile pela equipe (hipótese hoje é desktop-only).

## Brand Commitments

- **Nome/identidade textual**: "sixxis" com o ponto em tiffany, usado como logo textual quando a empresa não configura uma logo própria (`Logo.tsx`) — cada instalação pode subir sua própria logo/favicon (multi-tenant leve via `ConfiguracaoCRM`).
- **Paleta de marca já fixada em tokens** (`globals.css`, `@theme`), constante nos dois temas:
  - `--color-tiffany: #3cbfb3` (cor de assinatura, "o ponto" da marca)
  - `--color-tiffany-escuro: #2aa79b`
  - `--color-roxo: #7c3aed`
  - `--color-erro: #dc2626`
  - `--color-sucesso: #16a34a`
- Tokens semânticos (`escuro`/`medio`/`fundo`/`superficie`) que se invertem no tema escuro — a UI já assume que qualquer superfície nova usa esses tokens, não cor fixa.
- Tom da marca: direto, técnico, sem enfeite — reflete o próprio código (comentários em português claro, sem jargão de venda). Nenhuma diretriz de voz de marketing foi encontrada além disso; não inventar.

## Evidence on Hand

Nenhum material de marketing, testemunho, case ou imagem de produto real disponível no repositório — este é um produto interno (ferramenta de operação), não uma superfície voltada a visitante externo. Os "dados reais" que existem são operacionais: schema do banco (~70 modelos), rotas de API (195), e o comportamento documentado em `AGENTS.md`/`BRIEFING_CRM.md` do próprio repositório — usados como evidência de como o produto realmente funciona, não como conteúdo a exibir numa superfície de marketing. Não fabricar dado de cliente, valor de venda ou métrica de exemplo além do que já existe no seed/documentação.

## Product Principles

1. **Nenhum dado é apagado, só arquivado/neutralizado** — qualquer decisão de UI que pareça "remover" algo (sair do Kanban, cliente duplicado, negócio fechado errado) tem que refletir esse princípio: o histórico sobrevive sempre.
2. **O status atual não é a verdade do que aconteceu** — faturamento e métricas contam por "houve o evento no período", não pelo estado presente do card; UI de relatório precisa deixar isso legível, não sugerir que reabrir um card apaga uma venda passada.
3. **Prévia antes de aplicar** — o padrão de engenharia (GET mostra o que aconteceria, POST aplica) é também um padrão de confiança de produto: mudanças administrativas/em massa devem sempre dar ao Luccas uma chance de ver antes de executar.
4. **Densidade de operação sobre estética de vitrine** — isto é uma ferramenta "Operate" (o vendedor completa uma tarefa 8h por dia), não "Persuade": escaneabilidade, previsibilidade visual entre telas e velocidade de leitura do estado (quem é o cliente, em que etapa, há quanto tempo) superam qualquer expressão de marca ousada.
5. **A marca vive em detalhes precisos, não em experimentação visual** — o tiffany como assinatura pontual (badge, destaque, estado ativo), tokens semânticos consistentes entre tema claro/escuro, ícones monocromáticos sem emoji — mudança de UI deve reforçar esse vocabulário existente, não introduzir um novo.
