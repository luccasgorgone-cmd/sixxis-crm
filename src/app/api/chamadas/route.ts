// Historico de chamadas recebidas, com ESCOPO: ADMIN ve todas; colaborador/
// pos-venda veem SOMENTE as suas (agenteId = dono resolvido). Filtros: periodo,
// status, instancia. So leitura — o CRM registra; a chamada e atendida no
// WhatsApp/celular (a Evolution nao transmite audio).
import { NextResponse, type NextRequest } from "next/server";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { nomeEfetivo } from "@/lib/cliente";
import { resolverPeriodo } from "@/lib/metricas";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_VALIDOS = new Set(["recebida", "perdida", "rejeitada"]);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;

  // ESCOPO (rigoroso): nao-admin so ve as chamadas cujo dono resolvido e ele.
  const where: Prisma.ChamadaWhereInput = ehAdmin(agente.papel)
    ? {}
    : { agenteId: agente.id };

  const status = sp.get("status");
  if (status && STATUS_VALIDOS.has(status)) where.status = status;

  const instanciaId = sp.get("instancia");
  if (instanciaId) where.instanciaId = instanciaId;

  // Filtro direto por telefone (parcial, so digitos). Combina com o escopo (AND).
  const telefone = sp.get("telefone")?.trim();
  if (telefone) {
    const dig = telefone.replace(/\D/g, "");
    where.telefone = { contains: dig || telefone };
  }

  // Busca combinada: telefone OU nome do lead (aplicada dentro do escopo).
  const busca = sp.get("busca")?.trim();
  if (busca) {
    const dig = busca.replace(/\D/g, "");
    where.OR = [
      { telefone: { contains: dig || busca } },
      {
        lead: {
          OR: [
            { nome: { contains: busca, mode: "insensitive" } },
            { pushName: { contains: busca, mode: "insensitive" } },
            { nomeManual: { contains: busca, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const periodo = sp.get("periodo");
  if (periodo) {
    const { inicio, fim } = resolverPeriodo(periodo, null, null, new Date());
    where.horaEm = { gte: inicio, lte: fim };
  }

  const chamadas = await prisma.chamada.findMany({
    where,
    orderBy: { horaEm: "desc" },
    take: 200,
    include: {
      lead: { select: { nome: true, pushName: true, nomeManual: true, telefone: true, fotoUrl: true } },
      agente: { select: { nome: true } },
    },
  });

  // Nomes amigaveis das instancias (numero que recebeu).
  const ids = Array.from(
    new Set(chamadas.map((c) => c.instanciaId).filter((v): v is string => !!v)),
  );
  const instancias = ids.length
    ? await prisma.instanciaWhatsApp.findMany({
        where: { id: { in: ids } },
        select: { id: true, nome: true, numero: true },
      })
    : [];
  const mapaInst = new Map(instancias.map((i) => [i.id, i]));

  const itens = chamadas.map((c) => ({
    id: c.id,
    telefone: c.telefone,
    tipo: c.tipo,
    status: c.status,
    finalidade: c.finalidade,
    horaEm: c.horaEm,
    visto: c.visto,
    leadId: c.leadId,
    leadNome: c.lead ? nomeEfetivo(c.lead) : null,
    leadFoto: c.lead?.fotoUrl ?? null,
    instanciaNome:
      (c.instanciaId ? mapaInst.get(c.instanciaId)?.nome : null) ?? c.instancia,
    instanciaNumero: c.instanciaId ? mapaInst.get(c.instanciaId)?.numero ?? null : null,
    agenteNome: c.agente?.nome ?? null,
  }));

  return NextResponse.json({ chamadas: itens });
}
