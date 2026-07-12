// Gera o PDF do orcamento do negocio (staging atual) e o sobe no R2, retornando a
// URL publica. NAO envia nada ao cliente (isso e o /enviar-orcamento). Escopo:
// dono do negocio / dono do cliente na finalidade / admin — mesmo criterio do
// PATCH /api/negocios/[id] e do staging de pecas. Fatia 3.13.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { checarAcessoNegocio, montarDadosPdfOrcamento } from "@/lib/orcamentoDados";
import { gerarPdfOrcamento } from "@/lib/orcamentoPdf";
import { enviarParaR2ComRetry } from "@/lib/r2";
import { codigoAgente } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  const { id } = await ctx.params;

  const acesso = await checarAcessoNegocio(agente, id);
  if (!acesso.ok) {
    return NextResponse.json({ erro: acesso.erro }, { status: acesso.status });
  }

  const montagem = await montarDadosPdfOrcamento(id);
  if (!montagem) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  if (!montagem.temItens) {
    return NextResponse.json(
      { erro: "Orçamento sem itens." },
      { status: 422 },
    );
  }

  // Codigo anonimo do atendente (Fatia J): mesmo do envio, para o preview casar.
  const cod = codigoAgente(agente.id);
  const bytes = await gerarPdfOrcamento(montagem.dados, montagem.logo, cod);
  const buffer = Buffer.from(bytes);

  // Chave VERSIONADA por geracao (epoch): cada PDF vira um objeto novo no R2, entao
  // a URL muda sempre e o navegador nunca serve uma versao antiga em cache (3.16).
  const chave = `orcamentos/orc-${id}-${cod}-${Date.now()}.pdf`;
  const url = await enviarParaR2ComRetry(chave, buffer, "application/pdf");
  if (!url) {
    return NextResponse.json(
      { erro: "Falha ao salvar o PDF." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    url,
    numeroFormatado: montagem.numeroFormatado,
  });
}
