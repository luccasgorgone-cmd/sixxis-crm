// Admin: lista as PROPOSTAS ABERTAS da varredura do Supervisor (as ações que a
// varredura periódica deixou prontas para o gestor confirmar na aba Alertas).
// Só leitura. Filtra por origem = varredura (adminId sentinela) e status PROPOSTO.
//
// GET /api/admin/supervisor/acoes
import { NextResponse } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { ORIGEM_VARREDURA } from "@/lib/supervisor/varredura";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "sem permissao" }, { status: 403 });

  const itens = await prisma.supervisorAcao.findMany({
    where: { status: "PROPOSTO", adminId: ORIGEM_VARREDURA },
    select: { id: true, ferramenta: true, preview: true, negocioId: true, leadId: true, criadoEm: true },
    orderBy: { criadoEm: "desc" },
    take: 50,
  });
  return NextResponse.json({ total: itens.length, itens });
}
