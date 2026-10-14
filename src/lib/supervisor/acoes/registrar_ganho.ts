// registrar_ganho — fecha um negócio como GANHO (estado interno). Replica os
// campos do ramo GANHO do PATCH /api/negocios/[id], MAS de propósito NÃO dispara
// Meta CAPI (dispararPurchase) nem cria Orçamento: o caminho canônico de venda
// (checkout do site / PATCH manual) é quem dispara o Purchase, e disparar aqui
// duplicaria a atribuição. O supervisor registra só o estado comercial; isso é
// sinalizado no receipt para o Luccas.
import { Finalidade, TipoGanho } from "../../../generated/prisma/enums";
import { primeiraEtapaGanho } from "../../negocio";
import { rotuloTipoGanho } from "../../tipoGanho";
import { resolverAlertasNegocio } from "../../slaAlertas";
import { prisma } from "../../prisma";
import {
  brl,
  buscarNegocio,
  emitirNegocioAtualizado,
  logNegocio,
  snapshot,
  StatusNeg,
} from "./comum";
import {
  lerId,
  lerNumero,
  lerTexto,
  type Args,
  type FerramentaEscrita,
  type RegistroAcao,
  type ResultadoExec,
  type Validacao,
} from "./tipos";

// tipoGanho só vale na pós-venda; na venda é ignorado (não existe lá).
function tipoGanhoValido(
  args: Args,
  finalidade: Finalidade,
): TipoGanho | null {
  if (finalidade !== Finalidade.POS_VENDA) return null;
  const t = lerTexto(args, "tipoGanho");
  if (t && (t === "DUVIDA" || t === "PAGAMENTO" || t === "GARANTIA")) {
    return t as TipoGanho;
  }
  return null;
}

// Valor que será gravado: arg explícito > valor atual do negócio > 0 só quando
// for "dúvida" (pós-venda sem cobrança). null = não dá para fechar ganho.
function resolverValor(
  args: Args,
  negocioValor: number | null,
  soDuvida: boolean,
): number | null {
  const arg = lerNumero(args, "valor");
  if (arg != null) return arg;
  if (negocioValor != null) return negocioValor;
  return soDuvida ? 0 : null;
}

async function validar(args: Args): Promise<Validacao> {
  const negocioId = lerId(args, "negocioId");
  if (!negocioId) return { ok: false, erro: "negocioId é obrigatório" };
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio não encontrado" };
  if (negocio.status === StatusNeg.GANHO) {
    return { ok: false, erro: "o negócio já está marcado como ganho" };
  }
  const etapaGanho = await primeiraEtapaGanho(negocio.finalidade);
  if (!etapaGanho) {
    return { ok: false, erro: "funil sem etapa de ganho configurada" };
  }
  const tg = tipoGanhoValido(args, negocio.finalidade);
  const soDuvida = tg === "DUVIDA";
  const valor = resolverValor(
    args,
    negocio.valor != null ? Number(negocio.valor) : null,
    soDuvida,
  );
  if (valor == null || (valor <= 0 && !soDuvida)) {
    return { ok: false, erro: "valor (> 0) é obrigatório para marcar ganho" };
  }
  return { ok: true };
}

async function preview(args: Args): Promise<string> {
  const negocioId = lerId(args, "negocioId");
  const negocio = negocioId ? await buscarNegocio(negocioId) : null;
  if (!negocio) return "Fechar negócio como ganho.";
  const tg = tipoGanhoValido(args, negocio.finalidade);
  const soDuvida = tg === "DUVIDA";
  const valor = resolverValor(
    args,
    negocio.valor != null ? Number(negocio.valor) : null,
    soDuvida,
  );
  return `Fechar como GANHO por ${brl(valor)}${
    tg ? ` — ${rotuloTipoGanho(tg)}` : ""
  }. Não dispara conversão Meta (CAPI) nem gera orçamento.`;
}

async function executar(
  args: Args,
  admin: { id: string; nome: string },
): Promise<ResultadoExec> {
  const negocioId = lerId(args, "negocioId")!;
  const negocio = await buscarNegocio(negocioId);
  if (!negocio) return { ok: false, erro: "negócio sumiu", antes: null, depois: null };
  const etapaGanho = await primeiraEtapaGanho(negocio.finalidade);
  if (!etapaGanho) {
    return { ok: false, erro: "funil sem etapa de ganho", antes: null, depois: null };
  }
  const tg = tipoGanhoValido(args, negocio.finalidade);
  const soDuvida = tg === "DUVIDA";
  const valor = resolverValor(
    args,
    negocio.valor != null ? Number(negocio.valor) : null,
    soDuvida,
  )!;

  const antes = snapshot(negocio);
  const agora = new Date();
  const transicao = negocio.status !== StatusNeg.GANHO;

  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({
      where: { id: negocioId },
      data: {
        etapaId: etapaGanho.id,
        entrouEtapaEm: agora,
        valor,
        ...(tg ? { tipoGanho: tg } : {}),
        status: StatusNeg.GANHO,
        fechadoEm: agora,
        jaFoiGanho: true,
        ultimoGanhoEm: agora,
        ...(transicao ? { vezesGanho: { increment: 1 } } : {}),
      },
    });
    await logNegocio(tx, {
      negocioId,
      leadId: negocio.leadId,
      agenteId: admin.id,
      tipoHistorico: "GANHO",
      tipoAtividade: "GANHO",
      descricao: `Negócio ganho (${brl(valor)})${
        tg ? ` — ${rotuloTipoGanho(tg)}` : ""
      } (supervisor)`,
      valorGanho: valor,
    });
  });

  await resolverAlertasNegocio(negocioId);
  emitirNegocioAtualizado(negocioId, etapaGanho.id);
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
        etapaId: (antes.etapaId as string | null) ?? null,
        entrouEtapaEm: antes.entrouEtapaEm
          ? new Date(antes.entrouEtapaEm as string)
          : new Date(),
        valor: antes.valor as number | null,
        tipoGanho: (antes.tipoGanho as TipoGanho | null) ?? null,
        status: antes.status as (typeof StatusNeg)[keyof typeof StatusNeg],
        fechadoEm: antes.fechadoEm ? new Date(antes.fechadoEm as string) : null,
        jaFoiGanho: Boolean(antes.jaFoiGanho),
        ultimoGanhoEm: antes.ultimoGanhoEm
          ? new Date(antes.ultimoGanhoEm as string)
          : null,
        vezesGanho: Number(antes.vezesGanho ?? 0),
      },
    });
    await logNegocio(tx, {
      negocioId,
      leadId: atual.leadId,
      agenteId: admin.id,
      tipoHistorico: "GANHO",
      tipoAtividade: "GANHO",
      descricao: "Ganho revertido (supervisor)",
    });
  });

  await resolverAlertasNegocio(negocioId);
  emitirNegocioAtualizado(negocioId, (antes.etapaId as string | null) ?? null);
  const depois = snapshot((await buscarNegocio(negocioId))!);
  return { ok: true, antes: registro.antesJson as Record<string, unknown>, depois };
}

export const registrarGanho: FerramentaEscrita = {
  nome: "registrar_ganho",
  titulo: "Registrar ganho",
  descricao:
    "Fecha o negócio como GANHO com um valor. Não dispara conversão Meta nem gera orçamento (só estado interno). Use o valor atual do negócio se nenhum for passado.",
  inputSchema: {
    type: "object",
    properties: {
      negocioId: { type: "string", description: "id do negócio a fechar" },
      valor: {
        type: "number",
        description:
          "valor da venda em reais; se omitido, usa o valor atual do negócio",
      },
      tipoGanho: {
        type: "string",
        enum: ["DUVIDA", "PAGAMENTO", "GARANTIA"],
        description: "só pós-venda; DUVIDA permite valor zero",
      },
    },
    required: ["negocioId"],
    additionalProperties: false,
  },
  preview,
  validar,
  executar,
  reverter,
};
