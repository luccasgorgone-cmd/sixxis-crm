// PATCH: muda o status de um contato (ex.: marcar RESPONDEU/CONVERTIDO),
// descarta (com motivo) ou reatribui o vendedor (SO admin). Registra atividade
// para as metricas. Escopo: vendedor so mexe no que e dele; admin em tudo.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import type { CarteiraStatusContato } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_VALIDOS = new Set(["NOVO", "EM_ABORDAGEM", "RESPONDEU", "CONVERTIDO", "DESCARTADO"]);

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => null)) as
    | { status?: string; descartadoMotivo?: string; donoId?: string | null }
    | null;
  if (!body) return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });

  const contato = await prisma.carteiraContato.findUnique({
    where: { id },
    select: { id: true, donoId: true },
  });
  if (!contato) return NextResponse.json({ erro: "contato nao encontrado" }, { status: 404 });

  const admin = ehAdmin(agente.papel);
  if (!admin && contato.donoId !== agente.id) {
    return NextResponse.json({ erro: "sem permissao sobre este contato" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  const atividades: { tipo: string; detalhe: string | null }[] = [];

  // Reatribuicao de vendedor: SO admin.
  if (body.donoId !== undefined) {
    if (!admin) return NextResponse.json({ erro: "so admin reatribui" }, { status: 403 });
    if (body.donoId) {
      const alvo = await prisma.agente.findUnique({ where: { id: body.donoId }, select: { id: true } });
      if (!alvo) return NextResponse.json({ erro: "vendedor invalido" }, { status: 400 });
    }
    data.donoId = body.donoId;
    atividades.push({ tipo: "REATRIBUIU", detalhe: body.donoId ?? "(sem dono)" });
  }

  if (body.status !== undefined) {
    const st = body.status.toUpperCase();
    if (!STATUS_VALIDOS.has(st)) return NextResponse.json({ erro: "status invalido" }, { status: 400 });
    data.status = st as CarteiraStatusContato;
    if (st === "DESCARTADO") {
      data.descartadoMotivo = body.descartadoMotivo?.trim() || "(sem motivo)";
      atividades.push({ tipo: "DESCARTOU", detalhe: (data.descartadoMotivo as string) });
    } else {
      atividades.push({ tipo: "MUDOU_STATUS", detalhe: st });
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ erro: "nada para atualizar" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.carteiraContato.update({ where: { id }, data }),
    ...atividades.map((a) =>
      prisma.carteiraAtividade.create({
        data: { contatoId: id, agenteId: agente.id, tipo: a.tipo, detalhe: a.detalhe },
      }),
    ),
  ]);

  return NextResponse.json({ ok: true });
}
