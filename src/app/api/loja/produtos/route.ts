// Proxy do CRM para o catalogo da loja. A chave interna fica no servidor.
// Qualquer agente logado. Loja offline -> degrada com lista vazia + flag.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { buscarProdutos } from "@/lib/loja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const busca = req.nextUrl.searchParams.get("busca") ?? "";
  try {
    const produtos = await buscarProdutos(busca);
    return NextResponse.json({ produtos, offline: false });
  } catch {
    // Nao quebra o CRM: retorna vazio sinalizando indisponibilidade.
    return NextResponse.json({ produtos: [], offline: true });
  }
}
