// Admin: CAPTAÇÃO ATIVA do Supervisor. Somente leitura — mede prospecção ativa
// (clientes cadastrados MANUALMENTE: Lead.origem="manual") por período, com
// conversão e R$ por coorte. Não chama IA, não gasta token, não escreve nada.
//
// GET /api/admin/supervisor/captacao?periodo=hoje|semana|15d|mes[&inicio=&fim=]
//                                   [&finalidade=VENDA|POS_VENDA][&agenteId=]
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { resolverPeriodo } from "@/lib/metricas";
import { coletarCaptacao } from "@/lib/supervisor/captacao";
import { Finalidade } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const janela = resolverPeriodo(
    sp.get("periodo"),
    sp.get("inicio"),
    sp.get("fim"),
    new Date(),
  );

  const f = sp.get("finalidade");
  const finalidade =
    f === Finalidade.VENDA || f === Finalidade.POS_VENDA
      ? (f as Finalidade)
      : null;
  const agenteId = sp.get("agenteId")?.trim() || null;

  const captacao = await coletarCaptacao({ janela, finalidade, agenteId });
  return NextResponse.json(captacao);
}
