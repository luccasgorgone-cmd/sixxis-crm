// Sandbox de Atendimento — reset completo (limpar leads/negocios/mensagens
// ficticios). NUNCA toca nenhuma tabela real.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "sem permissao" }, { status: 403 });

  // SandboxNegocio/SandboxMensagem tem onDelete: Cascade a partir de
  // SandboxLead — apagar os leads basta.
  const { count } = await prisma.sandboxLead.deleteMany({});
  return NextResponse.json({ apagados: count });
}
