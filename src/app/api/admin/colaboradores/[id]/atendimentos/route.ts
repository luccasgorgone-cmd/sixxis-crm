// Admin: atendimentos de um colaborador por status (aovivo|pendente|finalizado).
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { resolverPeriodo } from "@/lib/metricas";
import { listaAtendimentos, type StatusAtendimento } from "@/lib/supervisao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALIDOS: StatusAtendimento[] = ["aovivo", "pendente", "finalizado"];

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const sp = req.nextUrl.searchParams;
  const statusParam = sp.get("status") ?? "aovivo";
  const status = (VALIDOS as string[]).includes(statusParam)
    ? (statusParam as StatusAtendimento)
    : "aovivo";

  const periodo = resolverPeriodo(
    sp.get("periodo"),
    sp.get("inicio"),
    sp.get("fim"),
    new Date(),
  );

  const atendimentos = await listaAtendimentos(id, status, periodo);
  return NextResponse.json({ atendimentos });
}
