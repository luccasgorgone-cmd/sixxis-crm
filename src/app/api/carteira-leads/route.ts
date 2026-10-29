// API da CARTEIRA DE LEADS. GET: lista os contatos do vendedor (ou todos, se
// admin) com filtros (UF, categoria, status, classe, busca, dono) + paginacao, o
// resumo por status e o selo "ja tem conversa/lead". Nao envia mensagem.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente } from "@/lib/autorizacao";
import { listarContatos } from "@/lib/carteira/consulta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const dados = await listarContatos(
    { id: agente.id, papel: agente.papel },
    {
      uf: sp.get("uf"),
      categoria: sp.get("categoria"),
      status: sp.get("status"),
      classe: sp.get("classe"),
      donoId: sp.get("dono"),
      busca: sp.get("busca"),
      pagina: Number(sp.get("pagina") ?? "1") || 1,
      porPagina: Number(sp.get("porPagina") ?? "60") || 60,
    },
  );
  return NextResponse.json(dados);
}
