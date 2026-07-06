// Produtos do SITE disponiveis ao orcamento de VENDA (Fatia 3.09). Mesma fonte
// viva da Sol (loja). Gate: usuario com acesso a VENDA (ou admin). Params:
// categoria?, busca?. Retorno inclui slug/url e preco atual/promocional.
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { listarProdutosLoja } from "@/lib/loja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  if (!ehAdmin(agente.papel) && !agente.acessoVenda) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  let produtos;
  try {
    produtos = await listarProdutosLoja();
  } catch {
    // Loja indisponivel/nao configurada: lista vazia (a UI degrada, nao quebra).
    return NextResponse.json({ produtos: [], indisponivel: true });
  }

  const sp = req.nextUrl.searchParams;
  const categoria = sp.get("categoria")?.trim().toLowerCase();
  const busca = sp.get("busca")?.trim().toLowerCase();

  const filtrados = produtos.filter((p) => {
    if (categoria && (p.categoria ?? "").toLowerCase() !== categoria) return false;
    if (busca && !p.nome.toLowerCase().includes(busca)) return false;
    return true;
  });

  return NextResponse.json({
    produtos: filtrados.map((p) => ({
      slug: p.slug,
      nome: p.nome,
      categoria: p.categoria,
      preco: p.preco,
      precoPromo: p.precoPromo,
      url: p.url,
      ativo: p.ativo,
    })),
    // Categorias distintas (para os chips na UI).
    categorias: [...new Set(produtos.map((p) => p.categoria).filter(Boolean))].sort(),
  });
}
