// GET: numeros de WhatsApp disponiveis para o vendedor escolher ao iniciar a 1a
// mensagem (so linhas ATIVAS de VENDA). Qualquer vendedor logado pode ler.
import { NextResponse } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { numerosDisponiveis } from "@/lib/carteira/consulta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const numeros = await numerosDisponiveis();
  return NextResponse.json({ numeros });
}
