// SOL-4 B2: previa do publico da recaptacao. READ-ONLY e SEM ENVIO.
//
//   GET /api/admin/recaptacao/publico?campanhaId=<id>&previa=10
//
// Esta rota nao cria RecaptacaoEnvio, nao muda status de campanha e nao manda
// mensagem nenhuma. Serve para o dono ver, ANTES de armar, quantas pessoas
// seriam alcancadas, por que outras ficaram de fora, e como o texto fica de
// verdade para as primeiras.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import {
  etapaEntradaVenda,
  selecionarPublico,
  renderizarMensagem,
} from "@/lib/recaptacaoPublico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREVIA_PADRAO = 10;
const PREVIA_MAX = 50;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const campanhaId = sp.get("campanhaId") ?? "";
  const previaBruta = Math.trunc(Number(sp.get("previa") ?? PREVIA_PADRAO));
  const previa = Number.isFinite(previaBruta)
    ? Math.min(PREVIA_MAX, Math.max(1, previaBruta || PREVIA_PADRAO))
    : PREVIA_PADRAO;

  const etapa = await etapaEntradaVenda();
  if (!etapa) {
    return NextResponse.json(
      { erro: "funil de VENDA sem etapa de entrada ativa" },
      { status: 409 },
    );
  }

  // O template so entra se o dono apontar uma campanha; sem ela a previa mostra
  // o publico, mas nao inventa um texto.
  const campanha = campanhaId
    ? await prisma.campanhaRecaptacao.findUnique({
        where: { id: campanhaId },
        select: { id: true, nome: true, mensagemTemplate: true, status: true },
      })
    : null;

  const { elegiveis, descartes, truncado } = await selecionarPublico(etapa.id);

  return NextResponse.json({
    etapa,
    campanha: campanha
      ? { id: campanha.id, nome: campanha.nome, status: campanha.status }
      : null,
    total: elegiveis.length,
    // Somados por motivo: explica a diferenca entre o tamanho da coluna "Novo" e
    // o publico real, em vez de deixar o dono achar que sumiu gente.
    descartes,
    truncado,
    previa: elegiveis.slice(0, previa).map((c) => ({
      leadId: c.leadId,
      telefone: c.telefone,
      primeiroNome: c.primeiroNome,
      instancia: c.instancia,
      // Texto EXATO que sairia para esta pessoa (inclusive a saudacao neutra
      // quando nao ha primeiro nome real).
      mensagem: campanha
        ? renderizarMensagem(campanha.mensagemTemplate, c.primeiroNome)
        : null,
    })),
  });
}
