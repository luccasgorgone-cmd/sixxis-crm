// Admin: localizar o negocio de VENDA de um cliente pelo TELEFONE. Somente
// leitura — nao escreve nada, nao roda no boot.
//
// EXISTE PARA AS CORRECOES NOMINAIS (Fatia 12): a busca da tela de clientes
// trunca em 500, esconde arquivados e filtra o texto no navegador, entao nao
// serve para achar EXATAMENTE o cliente de uma lista. Aqui o telefone e casado
// em todas as variantes (com/sem o 9, com/sem DDI) e os ARQUIVADOS aparecem.
//
// Devolve TODOS os candidatos quando ha mais de um — escolher por conta seria
// adivinhar em cima de faturamento.
//
// GET /api/admin/buscar-negocio-por-telefone?telefone=XXXXXXXXXXX
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import {
  buscarNegociosVendaPorTelefone,
  temGanhoComprovado,
} from "@/lib/buscaNegocioTelefone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const telefone = (req.nextUrl.searchParams.get("telefone") ?? "").trim();
  if (!telefone) {
    return NextResponse.json({ erro: "telefone e obrigatorio" }, { status: 400 });
  }

  const negocios = await buscarNegociosVendaPorTelefone(telefone);

  return NextResponse.json({
    telefone,
    total: negocios.length,
    negocios: negocios.map((n) => ({
      ...n,
      // Dito aqui para quem le a previa nao ter que cruzar os campos na mao.
      temGanhoComprovado: temGanhoComprovado(n),
    })),
  });
}
