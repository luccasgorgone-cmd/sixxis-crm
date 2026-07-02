// Inteligencia Regional: lista os clientes (leads) de um estado. Mesma regra de
// UF do mapa/regioes: Endereco.uf valido (2 letras) -> fallback ufPorTelefone.
// Escopo por dono (canonico): colaborador ve so os seus; admin ve todos e pode
// passar ?agenteId=X ou ?semDono=1. Ordena por ultimo contato desc, limita a ~200.
// GET /api/inteligencia/clientes?uf=XX&agenteId?(admin)&semDono?(admin)
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, escopoLeadWhere } from "@/lib/autorizacao";
import { nomeEfetivo } from "@/lib/cliente";
import { formatarTelefone } from "@/lib/format";
import { ufPorTelefone, infoPorUF } from "@/lib/ddd";
import { CAPITAIS } from "@/lib/capitais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const uf = (req.nextUrl.searchParams.get("uf") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf) || !CAPITAIS[uf]) {
    return NextResponse.json({ erro: "uf invalida" }, { status: 400 });
  }

  // Escopo por dono: colaborador ve so os seus; admin ve todos (ou ?agenteId/
  // ?semDono). A UF continua filtrada em memoria (endereco -> DDD).
  const where = escopoLeadWhere(agente, req.nextUrl.searchParams);

  const leads = await prisma.lead.findMany({
    where,
    select: {
      id: true,
      nome: true,
      pushName: true,
      nomeManual: true,
      telefone: true,
      enderecos: {
        select: { uf: true },
        orderBy: [{ principal: "desc" }, { criadoEm: "asc" }],
      },
      conversas: { select: { id: true, ultimaMensagemEm: true } },
      negocios: {
        select: {
          id: true,
          status: true,
          pendente: true,
          temperatura: true,
          valor: true,
          criadoEm: true,
        },
      },
    },
  });

  type Item = {
    leadId: string;
    nome: string;
    telefone: string;
    temperatura: "QUENTE" | "MORNO" | "FRIO" | null;
    status: "ABERTO" | "GANHO" | "PERDIDO" | "PENDENTE" | null;
    valorAberto: number;
    ultimoContato: string | null;
    negocioId: string | null;
    conversaId: string | null;
  };

  const clientes: Item[] = [];
  for (const l of leads) {
    // UF: primeiro endereco com uf valido de 2 letras, senao DDD do telefone.
    let ufLead: string | null = null;
    for (const e of l.enderecos) {
      const u = (e.uf ?? "").trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(u)) {
        ufLead = u;
        break;
      }
    }
    if (!ufLead) ufLead = ufPorTelefone(l.telefone);
    if (ufLead !== uf) continue;

    // Ultimo contato = maior ultimaMensagemEm; guarda a conversa correspondente.
    let ultimoContato: Date | null = null;
    let conversaId: string | null = l.conversas[0]?.id ?? null;
    for (const c of l.conversas) {
      if (
        c.ultimaMensagemEm &&
        (!ultimoContato || c.ultimaMensagemEm > ultimoContato)
      ) {
        ultimoContato = c.ultimaMensagemEm;
        conversaId = c.id;
      }
    }

    // Negocio principal (aberto > ultimo por criacao) para link/temperatura.
    const aberto = l.negocios.find((n) => n.status === "ABERTO");
    const ultimo = [...l.negocios].sort(
      (a, b) => b.criadoEm.getTime() - a.criadoEm.getTime(),
    )[0];
    const principal = aberto ?? ultimo ?? null;

    let status: Item["status"] = null;
    if (l.negocios.some((n) => n.pendente)) status = "PENDENTE";
    else if (l.negocios.some((n) => n.status === "ABERTO")) status = "ABERTO";
    else if (l.negocios.some((n) => n.status === "GANHO")) status = "GANHO";
    else if (l.negocios.some((n) => n.status === "PERDIDO")) status = "PERDIDO";

    const valorAberto = l.negocios
      .filter((n) => n.status === "ABERTO")
      .reduce((s, n) => s + (n.valor != null ? Number(n.valor) : 0), 0);

    clientes.push({
      leadId: l.id,
      nome: nomeEfetivo(l),
      telefone: formatarTelefone(l.telefone),
      temperatura: (principal?.temperatura ?? null) as Item["temperatura"],
      status,
      valorAberto,
      ultimoContato: ultimoContato ? ultimoContato.toISOString() : null,
      negocioId: principal?.id ?? null,
      conversaId,
    });
  }

  clientes.sort((a, b) => {
    const ta = a.ultimoContato ? new Date(a.ultimoContato).getTime() : 0;
    const tb = b.ultimoContato ? new Date(b.ultimoContato).getTime() : 0;
    return tb - ta;
  });

  return NextResponse.json({
    uf,
    estado: infoPorUF(uf)?.estado ?? uf,
    total: clientes.length,
    clientes: clientes.slice(0, LIMITE),
  });
}
