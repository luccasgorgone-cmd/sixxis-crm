// Execução de uma SupervisorAcao — lógica única usada por DOIS caminhos:
//   • a rota /acao/confirmar (gestor clica Confirmar/Descartar/Desfazer);
//   • o chat, quando o gestor COMANDA uma ação reversível (o comando é a
//     autorização → executa direto, sem exigir um segundo clique).
// Em ambos a transição de status é ATÔMICA (updateMany na condição de status),
// então "confirmar/reverter duas vezes" nunca duplica efeito. Defesa em
// profundidade: revalida antes de executar (o estado pode ter mudado).
import { prisma } from "../prisma";
import { acharFerramenta } from "./acoes/registro";
import type { AdminCtx, Args, RegistroAcao } from "./acoes/tipos";

export type CodigoAcao =
  | "ok"
  | "nao_encontrada"
  | "ja_tratada"
  | "revalidou_falhou"
  | "ferramenta_desconhecida"
  | "exec_falhou";

export type ResultadoAcao = {
  ok: boolean;
  codigo: CodigoAcao;
  status?: string;
  erro?: string;
  negocioId?: string | null;
};

function argsDeJson(bruto: unknown): Args {
  return bruto && typeof bruto === "object" && !Array.isArray(bruto)
    ? (bruto as Args)
    : {};
}

// Confirma (executa) uma ação PROPOSTO. Reivindica o status atomicamente antes
// de mutar. Retorna o código para a rota/chamador mapear em HTTP/UI.
export async function confirmarAcao(
  acaoId: string,
  admin: AdminCtx,
): Promise<ResultadoAcao> {
  const registro = await prisma.supervisorAcao.findUnique({
    where: { id: acaoId },
    select: { id: true, ferramenta: true, argsJson: true, status: true },
  });
  if (!registro) return { ok: false, codigo: "nao_encontrada" };
  if (registro.status !== "PROPOSTO") {
    return { ok: false, codigo: "ja_tratada", status: registro.status };
  }

  const ferramenta = acharFerramenta(registro.ferramenta);
  if (!ferramenta) {
    await prisma.supervisorAcao.update({
      where: { id: acaoId },
      data: { status: "FALHOU", motivo: "ferramenta desconhecida" },
    });
    return { ok: false, codigo: "ferramenta_desconhecida", erro: `ferramenta desconhecida: ${registro.ferramenta}` };
  }

  const args = argsDeJson(registro.argsJson);
  const validacao = await ferramenta.validar(args, admin);
  if (!validacao.ok) {
    // Mantém PROPOSTO: o estado mudou; o gestor vê o motivo e decide.
    return { ok: false, codigo: "revalidou_falhou", erro: validacao.erro };
  }

  const claim = await prisma.supervisorAcao.updateMany({
    where: { id: acaoId, status: "PROPOSTO" },
    data: { status: "EXECUTADO", executadoEm: new Date() },
  });
  if (claim.count === 0) return { ok: false, codigo: "ja_tratada" };

  let resultado;
  try {
    resultado = await ferramenta.executar(args, admin);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    await prisma.supervisorAcao.update({ where: { id: acaoId }, data: { status: "FALHOU", motivo } });
    return { ok: false, codigo: "exec_falhou", erro: `falha ao executar: ${motivo}` };
  }
  if (!resultado.ok) {
    await prisma.supervisorAcao.update({
      where: { id: acaoId },
      data: { status: "FALHOU", motivo: resultado.erro ?? "falha" },
    });
    return { ok: false, codigo: "exec_falhou", erro: resultado.erro ?? "falha ao executar" };
  }

  await prisma.supervisorAcao.update({
    where: { id: acaoId },
    data: {
      antesJson: (resultado.antes ?? undefined) as object | undefined,
      depoisJson: (resultado.depois ?? undefined) as object | undefined,
      negocioId: resultado.negocioId ?? null,
      leadId: resultado.leadId ?? null,
    },
  });
  return { ok: true, codigo: "ok", status: "EXECUTADO", negocioId: resultado.negocioId ?? null };
}

// Descarta uma ação PROPOSTO (nada executa). Atômico.
export async function descartarAcao(acaoId: string): Promise<ResultadoAcao> {
  const r = await prisma.supervisorAcao.updateMany({
    where: { id: acaoId, status: "PROPOSTO" },
    data: { status: "DESCARTADO" },
  });
  if (r.count === 0) {
    const existe = await prisma.supervisorAcao.findUnique({
      where: { id: acaoId },
      select: { status: true },
    });
    if (!existe) return { ok: false, codigo: "nao_encontrada" };
    return { ok: false, codigo: "ja_tratada", status: existe.status };
  }
  return { ok: true, codigo: "ok", status: "DESCARTADO" };
}

// Desfaz uma ação EXECUTADO (chama ferramenta.reverter com o snapshot `antes`).
// Reivindica EXECUTADO→REVERTIDO atomicamente antes de desfazer.
export async function reverterAcao(
  acaoId: string,
  admin: AdminCtx,
): Promise<ResultadoAcao> {
  const registro = await prisma.supervisorAcao.findUnique({
    where: { id: acaoId },
    select: {
      id: true,
      ferramenta: true,
      argsJson: true,
      antesJson: true,
      depoisJson: true,
      negocioId: true,
      leadId: true,
      status: true,
    },
  });
  if (!registro) return { ok: false, codigo: "nao_encontrada" };
  if (registro.status !== "EXECUTADO") {
    return { ok: false, codigo: "ja_tratada", status: registro.status };
  }
  const ferramenta = acharFerramenta(registro.ferramenta);
  if (!ferramenta) {
    return { ok: false, codigo: "ferramenta_desconhecida", erro: `ferramenta desconhecida: ${registro.ferramenta}` };
  }

  const claim = await prisma.supervisorAcao.updateMany({
    where: { id: acaoId, status: "EXECUTADO" },
    data: { status: "REVERTIDO" },
  });
  if (claim.count === 0) return { ok: false, codigo: "ja_tratada" };

  const alvo: RegistroAcao = {
    id: registro.id,
    ferramenta: registro.ferramenta,
    argsJson: registro.argsJson,
    antesJson: registro.antesJson,
    depoisJson: registro.depoisJson,
    negocioId: registro.negocioId,
    leadId: registro.leadId,
  };
  let resultado;
  try {
    resultado = await ferramenta.reverter(alvo, admin);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    await prisma.supervisorAcao.update({ where: { id: acaoId }, data: { status: "FALHOU", motivo: `reverter: ${motivo}` } });
    return { ok: false, codigo: "exec_falhou", erro: `falha ao desfazer: ${motivo}` };
  }
  if (!resultado.ok) {
    await prisma.supervisorAcao.update({
      where: { id: acaoId },
      data: { status: "FALHOU", motivo: `reverter: ${resultado.erro ?? "falha"}` },
    });
    return { ok: false, codigo: "exec_falhou", erro: resultado.erro ?? "falha ao desfazer" };
  }
  return { ok: true, codigo: "ok", status: "REVERTIDO", negocioId: registro.negocioId };
}
