// Admin: lista de colaboradores com resumo de atendimentos ATUAL (ao vivo /
// pendentes / finalizados). Sem filtro de periodo (os contadores sao estados
// atuais; o periodo fica no perfil e nos dashboards).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { contagemAtendimentos } from "@/lib/supervisao";
import { Papel } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function acessoRotulo(v: boolean, p: boolean): string {
  if (v && p) return "Ambos";
  if (v) return "Venda";
  if (p) return "Pos-venda";
  return "Nenhum";
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const agentes = await prisma.agente.findMany({
    where: { papel: { not: Papel.ADMIN } },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      ativo: true,
      acessoVenda: true,
      acessoPosVenda: true,
    },
  });

  const colaboradores = await Promise.all(
    agentes.map(async (a) => ({
      id: a.id,
      nome: a.nome,
      ativo: a.ativo,
      acessoVenda: a.acessoVenda,
      acessoPosVenda: a.acessoPosVenda,
      acesso: acessoRotulo(a.acessoVenda, a.acessoPosVenda),
      ...(await contagemAtendimentos(a.id)),
    })),
  );

  return NextResponse.json({ colaboradores });
}
