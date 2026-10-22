// Presenca AO VIVO do PROPRIO usuario (online/offline), separada do Agente.ativo
// (conta). GET le o estado; POST {online:boolean} alterna. O auto-offline por
// inatividade (cliente) chama POST {online:false}. So mexe no proprio agente.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { estadoPresenca, ficarOnline, ficarOffline } from "@/lib/presenca/presenca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  return NextResponse.json(await estadoPresenca(agente.id));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  let body: { online?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  if (typeof body.online !== "boolean") {
    return NextResponse.json(
      { erro: "campo 'online' (booleano) obrigatorio" },
      { status: 400 },
    );
  }
  const r = body.online
    ? await ficarOnline(agente.id)
    : await ficarOffline(agente.id);
  return NextResponse.json(r);
}
