// Disponibilidade do PROPRIO usuario: le/altera o SEU Agente.disponivel (Ausente/
// Disponivel). SEPARADO de `ativo` (conta/login, do admin) — assim o vendedor que
// se poe Ausente NAO se tranca fora do login. Reflete no roteamento: ausente
// (disponivel=false) nao recebe novos leads (filtroEquipe exige disponivel), mas
// segue logando. So mexe no proprio agente.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const a = await prisma.agente.findUnique({
    where: { id: agente.id },
    select: { disponivel: true },
  });
  return NextResponse.json({ disponivel: a?.disponivel ?? false });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  let body: { disponivel?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  if (typeof body.disponivel !== "boolean") {
    return NextResponse.json(
      { erro: "campo 'disponivel' (booleano) obrigatorio" },
      { status: 400 },
    );
  }
  // SEMPRE o proprio agente (agente.id) — nunca altera outro. NUNCA toca `ativo`.
  const atualizado = await prisma.agente.update({
    where: { id: agente.id },
    data: { disponivel: body.disponivel },
    select: { disponivel: true },
  });
  return NextResponse.json({ disponivel: atualizado.disponivel });
}
