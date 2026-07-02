// Inteligencia Regional: agrega clientes, vendas (GANHO) e faturamento por UF e
// por regiao. Escopo por dono (canonico): colaborador ve so os seus; admin ve
// todos e pode passar ?agenteId=X ou ?semDono=1. A UF de cada lead vem do
// Endereco (primeiro UF valido de 2 letras) ou, na falta, do DDD; sem nenhum ->
// SEM_UF.
// GET /api/inteligencia/regioes?agenteId?(admin)&semDono?(admin)
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, escopoLeadWhere } from "@/lib/autorizacao";
import { ufPorTelefone, infoPorUF } from "@/lib/ddd";
import { CAPITAIS } from "@/lib/capitais";
import { StatusNeg } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AggUF = {
  uf: string;
  estado: string;
  regiao: string;
  clientes: number;
  vendas: number;
  faturamento: number;
};

// Duas casas decimais, retornando number (nao Decimal/string).
function arred2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  // Escopo por dono: colaborador ve so os seus; admin ve todos (ou ?agenteId/
  // ?semDono). Traz tudo num unico findMany (base pequena): endereco -> uf,
  // negocios -> status/valor. Agregacao em JS (sem N+1).
  const where = escopoLeadWhere(agente, req.nextUrl.searchParams);
  const leads = await prisma.lead.findMany({
    where,
    select: {
      telefone: true,
      enderecos: { select: { uf: true } },
      negocios: { select: { status: true, valor: true } },
    },
  });

  const porUFMap = new Map<string, AggUF>();
  let semUF = 0;

  for (const lead of leads) {
    // UF do lead: primeiro Endereco.uf valido (2 letras) ou DDD do telefone.
    let uf: string | null = null;
    for (const e of lead.enderecos) {
      const u = (e.uf ?? "").trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(u)) {
        uf = u;
        break;
      }
    }
    if (!uf) uf = ufPorTelefone(lead.telefone);

    if (!uf) {
      semUF++;
      continue;
    }

    let agg = porUFMap.get(uf);
    if (!agg) {
      // estado/regiao: preferir o mapa do ddd.ts; capitais como fallback de nome.
      const info = infoPorUF(uf);
      agg = {
        uf,
        estado: info?.estado ?? CAPITAIS[uf]?.capital ?? uf,
        regiao: info?.regiao ?? "Outros",
        clientes: 0,
        vendas: 0,
        faturamento: 0,
      };
      porUFMap.set(uf, agg);
    }

    agg.clientes++;
    for (const n of lead.negocios) {
      if (n.status === StatusNeg.GANHO) {
        agg.vendas++;
        agg.faturamento += n.valor ? Number(n.valor) : 0;
      }
    }
  }

  const porUF = Array.from(porUFMap.values())
    .map((a) => ({ ...a, faturamento: arred2(a.faturamento) }))
    .sort((a, b) => b.clientes - a.clientes);

  // Agregacao por regiao.
  const porRegiaoMap = new Map<
    string,
    { regiao: string; clientes: number; vendas: number; faturamento: number }
  >();
  for (const a of porUF) {
    let r = porRegiaoMap.get(a.regiao);
    if (!r) {
      r = { regiao: a.regiao, clientes: 0, vendas: 0, faturamento: 0 };
      porRegiaoMap.set(a.regiao, r);
    }
    r.clientes += a.clientes;
    r.vendas += a.vendas;
    r.faturamento += a.faturamento;
  }
  const porRegiao = Array.from(porRegiaoMap.values())
    .map((r) => ({ ...r, faturamento: arred2(r.faturamento) }))
    .sort((a, b) => b.clientes - a.clientes);

  const total = porUF.reduce(
    (acc, a) => {
      acc.clientes += a.clientes;
      acc.vendas += a.vendas;
      acc.faturamento += a.faturamento;
      return acc;
    },
    { clientes: 0, vendas: 0, faturamento: 0 },
  );
  total.faturamento = arred2(total.faturamento);

  return NextResponse.json({ porUF, porRegiao, total, semUF });
}
