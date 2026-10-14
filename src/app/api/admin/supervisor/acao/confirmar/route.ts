// Admin: CONFIRMAR ou DESCARTAR uma ação proposta pelo Supervisor (§6). A IA só
// propõe (SupervisorAcao PROPOSTO); é AQUI, com clique do admin, que a mutação
// real acontece. Defesa em profundidade: revalida (validar) antes de executar,
// porque o estado pode ter mudado desde a proposta (ex.: negócio já arquivado).
//
// Idempotência de "confirmar duas vezes": a transição de status é atômica
// (updateMany PROPOSTO→EXECUTADO). Quem perder a corrida recebe 409.
//
// POST /api/admin/supervisor/acao/confirmar
//   body: { acaoId: string, decisao?: "confirmar" | "descartar" }
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { acharFerramenta } from "@/lib/supervisor/acoes/registro";
import type { Args, AdminCtx } from "@/lib/supervisor/acoes/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function argsDeJson(bruto: unknown): Args {
  return bruto && typeof bruto === "object" && !Array.isArray(bruto)
    ? (bruto as Args)
    : {};
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sessao = await obterAdmin();
  if (!sessao) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const admin: AdminCtx = { id: sessao.id, nome: sessao.nome ?? "Admin" };

  let corpo: Record<string, unknown> | null = null;
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erro: "json invalido" }, { status: 400 });
  }
  const acaoId = typeof corpo?.acaoId === "string" ? corpo.acaoId.trim() : "";
  const decisao = corpo?.decisao === "descartar" ? "descartar" : "confirmar";
  if (!acaoId) {
    return NextResponse.json({ erro: "acaoId obrigatorio" }, { status: 400 });
  }

  const registro = await prisma.supervisorAcao.findUnique({
    where: { id: acaoId },
    select: { id: true, ferramenta: true, argsJson: true, status: true },
  });
  if (!registro) {
    return NextResponse.json({ erro: "acao nao encontrada" }, { status: 404 });
  }
  if (registro.status !== "PROPOSTO") {
    return NextResponse.json(
      { erro: `acao ja ${registro.status.toLowerCase()}`, status: registro.status },
      { status: 409 },
    );
  }

  // ---- DESCARTAR: só muda o status, nada executa. Atômico. ----
  if (decisao === "descartar") {
    const r = await prisma.supervisorAcao.updateMany({
      where: { id: acaoId, status: "PROPOSTO" },
      data: { status: "DESCARTADO" },
    });
    if (r.count === 0) {
      return NextResponse.json({ erro: "acao ja tratada" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, status: "DESCARTADO" });
  }

  // ---- CONFIRMAR: revalida, reivindica atômica, executa, grava snapshots. ----
  const ferramenta = acharFerramenta(registro.ferramenta);
  if (!ferramenta) {
    await prisma.supervisorAcao.update({
      where: { id: acaoId },
      data: { status: "FALHOU", motivo: "ferramenta desconhecida" },
    });
    return NextResponse.json(
      { erro: `ferramenta desconhecida: ${registro.ferramenta}` },
      { status: 422 },
    );
  }

  const args = argsDeJson(registro.argsJson);
  const validacao = await ferramenta.validar(args, admin);
  if (!validacao.ok) {
    // Mantém PROPOSTO: o estado mudou, mas o admin vê o motivo e decide.
    return NextResponse.json({ erro: validacao.erro, revalidou: false }, { status: 422 });
  }

  // Reivindica a execução atomicamente (impede confirmar-duas-vezes em paralelo).
  const claim = await prisma.supervisorAcao.updateMany({
    where: { id: acaoId, status: "PROPOSTO" },
    data: { status: "EXECUTADO", executadoEm: new Date() },
  });
  if (claim.count === 0) {
    return NextResponse.json({ erro: "acao ja tratada" }, { status: 409 });
  }

  let resultado;
  try {
    resultado = await ferramenta.executar(args, admin);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    await prisma.supervisorAcao.update({
      where: { id: acaoId },
      data: { status: "FALHOU", motivo },
    });
    return NextResponse.json({ erro: `falha ao executar: ${motivo}` }, { status: 500 });
  }

  if (!resultado.ok) {
    await prisma.supervisorAcao.update({
      where: { id: acaoId },
      data: { status: "FALHOU", motivo: resultado.erro ?? "falha" },
    });
    return NextResponse.json({ erro: resultado.erro ?? "falha ao executar" }, { status: 422 });
  }

  // Sucesso: grava antes/depois para auditoria e undo; completa os ids.
  await prisma.supervisorAcao.update({
    where: { id: acaoId },
    data: {
      antesJson: (resultado.antes ?? undefined) as object | undefined,
      depoisJson: (resultado.depois ?? undefined) as object | undefined,
      negocioId: resultado.negocioId ?? null,
      leadId: resultado.leadId ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    status: "EXECUTADO",
    negocioId: resultado.negocioId ?? null,
  });
}
