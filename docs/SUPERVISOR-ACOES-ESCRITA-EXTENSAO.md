# Supervisor — extensão das ferramentas de escrita (Nível 1)

**Data:** 2026-10-16 · **Classificação (Artigo 14):** Architectural (estende o
subsistema de ações de escrita do Supervisor). Autorizado direto pelo Luccas
("construa tudo, vai pelas suas recomendações, me entrega pronto").

## Objetivo

Completar o conjunto de ações que o Supervisor Comercial IA pode **propor** (e,
sob comando do gestor, executar) — mantendo o modelo human-in-the-loop já
existente: a IA só devolve `{ferramenta, args}`; o servidor valida, mostra o
card com preview, e só executa no **Confirmar**. Toda ação é reversível e
auditada em `SupervisorAcao` (antes/depois). Nenhuma fala com o cliente (linha
vermelha estrutural, testada no boot por `assertSemEnvioAoCliente`).

## O que já existia

`mover_etapa`, `registrar_ganho`, `registrar_perda`, `criar_lembrete`,
`criar_nota`, `reatribuir_vendedor`, `arquivar_negocio`, `definir_config`.
(`criar_lembrete` já cobre "criar tarefa/próximo passo".)

## O que esta extensão adiciona (4 ferramentas)

Todas seguem o contrato `FerramentaEscrita` (`acoes/tipos.ts`) e espelham o
caminho manual (`PATCH /api/negocios/[id]` e rotas de etiqueta), reusando os
helpers de `acoes/comum.ts`.

1. **`definir_temperatura`** — muda `Negocio.temperatura` (QUENTE/MORNO/FRIO).
   Espelha o ramo do PATCH manual, que grava **só** o campo (sem log de
   histórico/atividade — a própria `SupervisorAcao` é a auditoria). Reverter
   restaura a temperatura anterior.

2. **`definir_pendencia`** — marca/remove pendência (`pendente`,
   `motivoPendencia`, `motivoPendenciaCode`). Validação idêntica ao manual:
   ao marcar exige `code` **ou** obs; `code` precisa ser um código conhecido
   (`motivosPendencia.ehCodigoPendencia`); `OUTRO` exige obs. Log: **só
   `Atividade(PENDENCIA)`** (não há `TipoHistorico.PENDENCIA`), igual ao manual.

3. **`ajustar_valor`** — ajusta o valor do negócio. Grava `valor` **e zera
   qualquer `valorAjustado` pendurado** (`valorAjustado = null`), de forma que
   o `valorEfetivo = COALESCE(valorAjustado, valor)` passe a ser exatamente o
   número informado. Isso neutraliza a armadilha nº1 do sistema (um
   `valorAjustado=0`/obsoleto que zeraria/sobreporia a venda em silêncio). Log:
   `HistoricoNegocio(VALOR)` + `Atividade(VALOR)`, como o PATCH manual do campo
   `valor`. Reverter restaura `valor` **e** `valorAjustado`.

4. **`gerenciar_etiqueta`** — adiciona/remove etiqueta do **cliente (Lead)** via
   join `LeadEtiqueta`, resolvendo o `leadId` pelo negócio. Idempotente (não
   duplica link, não falha ao remover inexistente). Log:
   `HistoricoNegocio(ETIQUETA)` + `Atividade(ETIQUETA)`, espelhando
   `POST/DELETE /api/negocios/[id]/etiquetas`. Reverter desfaz exatamente o que
   foi feito (só remove o link se ESTA ação o criou; só recria se ESTA ação o
   removeu).

## Mudança de suporte

`acoes/comum.ts`: `SELECT_NEGOCIO` + `snapshot()` passam a incluir
`temperatura`, `pendente`, `motivoPendencia`, `motivoPendenciaCode` (hoje
ausentes) — necessário para o `reverter` de (1) e (2) restaurar o estado.
Aditivo: as ferramentas existentes só ganham campos extras no `antesJson`,
que seus `reverter` ignoram.

## Pontos de acoplamento atualizados

- `acoes/registro.ts` — registra as 4 (ponto único; dele derivam prompt, enum
  do envelope, `acharFerramenta`, `nomesFerramentas`).
- `scripts/contratos/c5-supervisor.ts` — lista/contagem exata (8 → 12).
- `components/supervisor/CardAcao.tsx` — rótulos humanos (`ROTULO_ACAO`).
- `supervisor/ia.ts` — texto do system prompt (lista de ações).

Execução/confirmação/reversão (`executarAcao.ts`, rota `acao/confirmar`) e o
card de UI já são **genéricos** (resolvem por `acharFerramenta` + `preview`):
nenhuma mudança por-ferramenta necessária além dos rótulos.

## Verificação

- Gates: `tsc --noEmit`, `next build`, `tsx scripts/contratos/c5-supervisor.ts`.
- Comportamental: `validar/preview/executar/reverter` de cada ferramenta contra
  um negócio REAL de produção, dentro de transação com **ROLLBACK proposital**
  (nada persistido), confirmando mutação + log + reversão.
