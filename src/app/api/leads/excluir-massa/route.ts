// Exclusao/arquivamento de clientes EM MASSA. SOMENTE ADMIN. Aplica a mesma regra
// da exclusao individual: sem historico (conversa/negocio) => apaga de fato; com
// historico => ARQUIVA (protege), a menos que force=true (apaga em cascata).
// Util para limpar clientes de teste de uma vez. Fatia 2.81.
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { excluirOuArquivarLeads } from "@/lib/exclusao";
import { getIO } from "@/lib/socket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  let body: { leadIds?: unknown; force?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const leadIds = Array.isArray(body.leadIds)
    ? Array.from(
        new Set(body.leadIds.filter((x): x is string => typeof x === "string")),
      )
    : [];
  const force = body.force === true;
  if (leadIds.length === 0) {
    return NextResponse.json({ erro: "leadIds obrigatorios" }, { status: 400 });
  }

  const r = await excluirOuArquivarLeads(leadIds, force);

  // Atualiza kanban/carteira/clientes/inbox.
  getIO()?.emit("cliente:atualizado", { leadId: null, nome: null });

  return NextResponse.json({ ok: true, ...r });
}
