// Admin: consulta o estado de conexao da instancia na Evolution e persiste.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { estadoConexao } from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const inst = await prisma.instanciaWhatsApp.findUnique({
    where: { id },
    select: { instanciaEvolution: true },
  });
  if (!inst) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }

  const estado = await estadoConexao(inst.instanciaEvolution);
  await prisma.instanciaWhatsApp.update({
    where: { id },
    data: { statusConexao: estado },
  });
  return NextResponse.json({ estado });
}
