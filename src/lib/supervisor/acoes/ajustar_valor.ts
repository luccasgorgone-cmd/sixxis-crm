// ajustar_valor — ajusta o valor de um negócio. Espelha o ramo "Valor (sem
// mudança de etapa)" do PATCH /api/negocios/[id] (grava `valor`, loga VALOR em
// HistoricoNegocio + Atividade), MAS também ZERA qualquer `valorAjustado`
// pendurado (valorAjustado = null) para que o valorEfetivo =
// COALESCE(valorAjustado, valor) passe a ser exatamente o valor informado.
// Isso neutraliza a armadilha nº1 do sistema (um valorAjustado obsoleto que
// sobreporia/zeraria a venda em silêncio). O reverter restaura valor E
// valorAjustado do snapshot.
import { prisma } from "../../prisma";
import {
  brl,
  buscarNegocio,
  emitirNegocioAtualizado,
  logNegocio,
  snapshot,
} from "./comum";
import {
  lerId,
  lerNumero,
  type Args,
  type FerramentaEscrita,
  type RegistroAcao,
  type ResultadoExec,
  type Validacao,
} from "./tipos";

async function validar(args: Args): Promise<Validacao> {
  const negocioId = lerId(args, "negocioId");
  if (!negocioId) return { ok: false, erro: "negocioId é obrigatório" };
  const valor = lerNumero(args, "valor");
  if (valor == null) return { ok: false, erro: "informe valor (número em reais)" };
  if (valor < 0) return { ok: false, erro: "valor não pode ser negativo" };
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio não encontrado" };
  return { ok: true };
}

async function preview(args: Args): Promise<string> {
  const negocioId = lerId(args, "negocioId");
  const valor = lerNumero(args, "valor");
  const negocio = negocioId ? await buscarNegocio(negocioId) : null;
  const tinhaAjuste = negocio?.valorAjustado != null;
  const extra = tinhaAjuste
    ? ` (remove o ajuste pendente de ${brl(Number(negocio!.valorAjustado))} que sobrepunha o valor efetivo)`
    : "";
  return `Ajustar valor para ${brl(valor)}${extra}.`;
}

async function executar(
  args: Args,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const negocioId = lerId(args, "negocioId")!;
  const valor = lerNumero(args, "valor")!;
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio sumiu", antes: null, depois: null };

  const antes = snapshot(negocio);
  const tinhaAjuste = negocio.valorAjustado != null;
  const nota = tinhaAjuste
    ? ` (removido ajuste anterior de ${brl(Number(negocio.valorAjustado))})`
    : "";

  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({
      where: { id: negocioId },
      // Zera o valorAjustado para o valor efetivo ser exatamente `valor`.
      data: { valor, valorAjustado: null },
    });
    await logNegocio(tx, {
      negocioId,
      leadId: negocio.leadId,
      agenteId: admin.id,
      tipoHistorico: "VALOR",
      tipoAtividade: "VALOR",
      descricao: `Valor ajustado para ${brl(valor)}${nota} (supervisor)`,
    });
  });

  emitirNegocioAtualizado(negocioId, negocio.etapaId);
  const depois = snapshot((await buscarNegocio(negocioId))!);
  return { ok: true, antes, depois, negocioId, leadId: negocio.leadId };
}

async function reverter(
  registro: RegistroAcao,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const antes = registro.antesJson as ReturnType<typeof snapshot> | null;
  if (!antes || !registro.negocioId) {
    return { ok: false, erro: "sem snapshot para reverter", antes: null, depois: null };
  }
  const negocioId = registro.negocioId;
  const atual = await buscarNegocio(negocioId);
  if (!atual) return { ok: false, erro: "negócio não encontrado", antes: null, depois: null };

  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({
      where: { id: negocioId },
      data: {
        valor: antes.valor as number | null,
        valorAjustado: antes.valorAjustado as number | null,
      },
    });
    await logNegocio(tx, {
      negocioId,
      leadId: atual.leadId,
      agenteId: admin.id,
      tipoHistorico: "VALOR",
      tipoAtividade: "VALOR",
      descricao: "Ajuste de valor revertido (supervisor)",
    });
  });

  emitirNegocioAtualizado(negocioId, atual.etapaId);
  const depois = snapshot((await buscarNegocio(negocioId))!);
  return { ok: true, antes: registro.antesJson as Record<string, unknown>, depois };
}

export const ajustarValor: FerramentaEscrita = {
  nome: "ajustar_valor",
  titulo: "Ajustar valor",
  descricao:
    "Ajusta o valor de um negócio em reais. Grava `valor` e zera qualquer `valorAjustado` pendurado, de modo que o valor efetivo (o que conta no faturamento) passe a ser exatamente o número informado. Use o valor total do pedido (produtos + frete).",
  inputSchema: {
    type: "object",
    properties: {
      negocioId: { type: "string", description: "id do negócio" },
      valor: { type: "number", description: "novo valor em reais (>= 0)" },
    },
    required: ["negocioId", "valor"],
    additionalProperties: false,
  },
  preview,
  validar,
  executar,
  reverter,
};
