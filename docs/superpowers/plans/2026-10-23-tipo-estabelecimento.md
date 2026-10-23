# Tipo de Estabelecimento do cliente (plano)

**Goal:** Classificação NOVA do cliente (Lead) — "tipo de estabelecimento", seleção ÚNICA, lista FIXA no código (decisões do Luccas 23/10), marcável na conversa (BlocoCliente do Inbox), ao lado do Segmento (Varejo/Atacado). Migration ADITIVA.

**Architecture:** Espelha o campo `Segmento?` que já existe no Lead — enum opcional + select no `BlocoCliente.tsx` + PATCH `/api/leads/[id]` com trilha em `mudancas`. Fonte única da lista (identificador→rótulo PT) em `src/lib/tipoEstabelecimento.ts`, usada pela UI (options) e pela validação da rota.

**Tech Stack:** Next.js 16, Prisma 7 (PostgreSQL), TS, React.

## Lista fixa (enum TipoEstabelecimento) — identificador → rótulo

Do Luccas (dedup — "oficina mecânica" vinha 2x):
RESTAURANTE=Restaurante · BAR=Bar · ACADEMIA=Academia · ACADEMIA_LUTA=Academia de luta · LOJA_CARRO=Loja de carro · OFICINA_MECANICA=Oficina mecânica · LOJA_ROUPA=Loja de roupa · MALHARIA=Malharia · SERRALHERIA=Serralheria · AREA_LAZER=Área de lazer · SALAO_FESTAS=Salão de festas · MATERIAL_ELETRICO=Loja de material elétrico · SUPERMERCADO=Supermercado · MERCEARIA=Mercearia · ACOUGUE=Açougue · VAREJO_BAIRRO=Loja de bairro (varejo geral)

Sugestões minhas (confirmar/cortar no gate de deploy):
PADARIA=Padaria · LANCHONETE=Lanchonete/Pizzaria/Hamburgueria · HORTIFRUTI=Hortifruti/Sacolão · DISTRIBUIDORA_BEBIDAS=Distribuidora de bebidas/Adega · PET_SHOP=Pet shop · FARMACIA=Farmácia/Drogaria · SALAO_BELEZA=Salão de beleza/Barbearia · MOVEIS_DECORACAO=Loja de móveis/Decoração · HOTEL_POUSADA=Hotel/Pousada · POSTO_CONVENIENCIA=Posto/Conveniência

OUTRO=Outro (sempre, pra não travar cliente sem encaixe).

## Global Constraints
- Migration ADITIVA (ADD COLUMN nullable; enum CREATE TYPE). Sem DROP/TEMP. Provar vs schema de prod com ROLLBACK.
- Campo OPCIONAL (null = não definido), igual ao Segmento. Não mexe em nada existente.
- Branch `wip`; deploy/migration = catraca (só com OK do Luccas).

## Tasks

### Task 1: enum + lista fonte única
- [ ] `prisma/schema.prisma`: `enum TipoEstabelecimento { ... 26 valores + OUTRO }`; `tipoEstabelecimento TipoEstabelecimento?` no model Lead.
- [ ] `src/lib/tipoEstabelecimento.ts`: `TIPOS_ESTABELECIMENTO: { valor: TipoEstabelecimento; rotulo: string }[]` (ordem da lista) + helper `rotuloTipoEstabelecimento(v)`.
- [ ] `prisma migrate dev --create-only` → revisar SQL = CREATE TYPE + ALTER TABLE ADD COLUMN (sem DROP/TEMP).

### Task 2: wire leitura/escrita
- [ ] `src/lib/cliente.ts`: `tipoEstabelecimento: true` em `selectClientePainel`; campo em `LeadPainelRow`; em `serializarClientePainel`.
- [ ] `src/app/api/leads/[id]/route.ts`: `tipoEstabelecimento: true` no select; `body.tipoEstabelecimento !== undefined` na deteção de mudança; bloco de validação (valor ∈ enum ou null) setando `data.tipoEstabelecimento` + push "tipoEstabelecimento" em `mudancas`. Importar o enum.

### Task 3: UI no BlocoCliente
- [ ] `src/components/cliente/BlocoCliente.tsx`: prop `tipoEstabelecimento?` no tipo do cliente; exibição (texto/badge, "não definido" honesto quando null); `<select>` no form de edição (options de `TIPOS_ESTABELECIMENTO`), estado + PATCH `/api/leads/${id}` com `tipoEstabelecimento`, espelhando o bloco do Segmento.

### Task 4: gates + prova
- [ ] `tsc` 0 + `next build` 0.
- [ ] Migration provada ADITIVA e válida vs schema de prod com transação ROLLBACK (sem resíduo).
- [ ] Commit em `wip`. Apresentar pro Luccas (lista final + deploy).

## Fora deste plano
- Segmentar relatórios/Supervisor por tipo (fase futura).
- Lista gerenciável por admin (decidido: fica fixa agora).
