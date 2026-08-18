// Sandbox de Atendimento (WORKORDER_ATENDIMENTO_OMNICHANNEL, 18/08/2026).
// ISOLADO POR DESENHO: so toca prisma.sandboxLead/sandboxNegocio/
// sandboxMensagem. NUNCA importa prisma.lead/negocio/conversa/mensagem, o
// client Evolution, nem a fila real de mensagens (queue.ts).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { nomeFicticioAleatorio, obterRoteiro } from "@/lib/sandboxSimulador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista todos os leads ficticios do sandbox, com o negocio (Kanban) de cada um
// e as ultimas mensagens (para a Inbox renderizar sem N+1 chamadas).
export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "sem permissao" }, { status: 403 });

  const leads = await prisma.sandboxLead.findMany({
    orderBy: { criadoEm: "desc" },
    include: {
      negocios: {
        orderBy: { criadoEm: "desc" },
        include: {
          mensagens: { orderBy: { criadoEm: "asc" } },
        },
      },
    },
  });
  return NextResponse.json({ leads });
}

// Cria um lead ficticio novo + o negocio (Kanban) dele. `roteiroId` opcional:
// quando presente, o lead segue esse roteiro pre-pronto no simulador
// (autoTick); ausente = so responde quando o Luccas digitar manualmente.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "sem permissao" }, { status: 403 });

  let body: { nome?: unknown; roteiroId?: unknown; finalidade?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const roteiro = obterRoteiro(typeof body.roteiroId === "string" ? body.roteiroId : undefined);
  const nome =
    typeof body.nome === "string" && body.nome.trim()
      ? body.nome.trim().slice(0, 120)
      : nomeFicticioAleatorio();
  const finalidade =
    body.finalidade === "POS_VENDA"
      ? "POS_VENDA"
      : roteiro?.finalidade === "POS_VENDA"
        ? "POS_VENDA"
        : "VENDA";

  const lead = await prisma.sandboxLead.create({
    data: {
      nome,
      roteiro: roteiro?.id ?? null,
      negocios: { create: { finalidade, etapa: "NOVO" } },
    },
    include: { negocios: { include: { mensagens: true } } },
  });

  return NextResponse.json({ lead });
}
