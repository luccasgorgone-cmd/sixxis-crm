// Admin: LIMPEZA PONTUAL dos PERDIDOS. Roda quando o dono aciona — nao e job,
// nao roda no boot nem no deploy.
//
// POR QUE EXISTE: o arquivamento por prazo nunca foi ligado, entao anos de
// negocios PERDIDO ficaram entulhando o Kanban e o Inbox. Esta rota arquiva
// TODOS eles de uma vez (venda + pos-venda, sem prazo), para o quadro comecar
// limpo; dai em diante o job de prazo cuida do resto.
//
// O QUE FAZ E O QUE NAO FAZ:
//   - arquiva = Negocio.arquivado=true + arquivadoEm + Conversa.arquivada=true
//     (Kanban e Inbox juntos). NADA e deletado: lead, conversa, mensagens,
//     historico, orcamentos e valores continuam no banco e nas telas;
//   - SO status PERDIDO. Negocio ABERTO/pendente e GANHO nao sao tocados
//     (ganho continua com o job de prazo);
//   - IDEMPOTENTE: filtra arquivado=false, entao rodar de novo nao repega o
//     que ja saiu e nao reescreve arquivadoEm;
//   - cliente que voltar a falar reaparece normalmente (o desarquivamento
//     casado de lib/arquivamento reabre negocio e conversa).
//
// GET  = previa: so CONTA, nao escreve nada.
// POST = executa e devolve a contagem (venda / pos-venda / total).
import { NextResponse } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import {
  arquivarNegociosEConversas,
  contarArquivaveis,
} from "@/lib/arquivamento";
import type { Prisma } from "@/generated/prisma/client";
import { StatusNeg } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// O alvo, escrito uma vez so: perdidos que ainda estao no quadro. Sem filtro de
// prazo (e o proposito da limpeza) e sem nenhum outro status.
const ALVO: Prisma.NegocioWhereInput = {
  status: StatusNeg.PERDIDO,
  arquivado: false,
};

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const previa = await contarArquivaveis(ALVO);
  return NextResponse.json({
    previa: { venda: previa.venda, posVenda: previa.posVenda, total: previa.total },
    executado: false,
  });
}

export async function POST(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  try {
    const r = await arquivarNegociosEConversas(ALVO);
    console.log(
      `[limpeza-perdidos] ${r.total} perdidos arquivados ` +
        `(venda ${r.venda}, pos-venda ${r.posVenda}, ${r.conversas} conversas) ` +
        `por ${admin.nome ?? admin.id} — nada foi deletado`,
    );
    return NextResponse.json({
      executado: true,
      arquivados: { venda: r.venda, posVenda: r.posVenda, total: r.total },
      conversasArquivadas: r.conversas,
    });
  } catch (erro) {
    return NextResponse.json(
      {
        erro: "falha na limpeza",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      },
      { status: 500 },
    );
  }
}
