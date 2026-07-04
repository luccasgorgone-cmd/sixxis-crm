// Aplica/remove uma ETIQUETA em MASSA nos clientes selecionados (Fatia 2.76).
// Escopo: nao-admin so mexe nos PROPRIOS leads (escopoLeadWhere); admin em todos.
// Idempotente: adicionar nao duplica LeadEtiqueta (skipDuplicates); remover o que
// nao existe nao quebra. Emite evento para as telas atualizarem as etiquetas.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, escopoLeadWhere } from "@/lib/autorizacao";
import { getIO } from "@/lib/socket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  let body: { leadIds?: unknown; etiquetaId?: unknown; acao?: unknown };
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
  const etiquetaId = typeof body.etiquetaId === "string" ? body.etiquetaId : "";
  const acao = body.acao === "remover" ? "remover" : "adicionar";

  if (leadIds.length === 0 || !etiquetaId) {
    return NextResponse.json(
      { erro: "leadIds e etiquetaId sao obrigatorios" },
      { status: 400 },
    );
  }

  const etiqueta = await prisma.etiqueta.findUnique({
    where: { id: etiquetaId },
    select: { id: true },
  });
  if (!etiqueta) {
    return NextResponse.json({ erro: "etiqueta invalida" }, { status: 400 });
  }

  // ESCOPO: restringe aos leads que o usuario pode ver/gerir.
  const permitidos = await prisma.lead.findMany({
    where: { AND: [{ id: { in: leadIds } }, escopoLeadWhere(agente, new URLSearchParams())] },
    select: { id: true },
  });
  const ids = permitidos.map((l) => l.id);
  const ignorados = leadIds.length - ids.length;

  let afetados = 0;
  if (ids.length > 0) {
    if (acao === "adicionar") {
      const r = await prisma.leadEtiqueta.createMany({
        data: ids.map((leadId) => ({ leadId, etiquetaId })),
        skipDuplicates: true,
      });
      afetados = r.count;
    } else {
      const r = await prisma.leadEtiqueta.deleteMany({
        where: { leadId: { in: ids }, etiquetaId },
      });
      afetados = r.count;
    }
  }

  // Atualiza kanban/carteira/clientes (as etiquetas aparecem nos cards/lista).
  if (afetados > 0) {
    getIO()?.emit("negocio:atualizado", {
      negocioId: null,
      etapaId: null,
      motivo: "etiqueta-massa",
    });
  }

  return NextResponse.json({ ok: true, acao, afetados, ignorados });
}
