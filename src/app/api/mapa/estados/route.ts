// Mapa: agregado por UF (centro de clientes georreferenciado). Cruza dados
// internos (clientes/negocios/valor/produto) com a populacao IBGE (potencial de
// mercado). UF via Endereco.uf -> fallback DDD do telefone. Sempre 200.
// GET /api/mapa/estados  (agente logado -> 401)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente } from "@/lib/autorizacao";
import { mapaPopulacao } from "@/lib/ibge";
import {
  selectLeadMapa,
  resolverUF,
  montarResumo,
  type LeadMapa,
  type ResumoUF,
} from "@/lib/mapa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }

  const [leads, populacaoPorUF] = await Promise.all([
    prisma.lead.findMany({ select: selectLeadMapa }),
    mapaPopulacao(),
  ]);

  // Agrupa os leads por UF (ou conta como semUF quando nao da para inferir).
  const porUFLeads = new Map<string, LeadMapa[]>();
  let semUF = 0;
  for (const lead of leads) {
    const uf = resolverUF(lead);
    if (!uf) {
      semUF++;
      continue;
    }
    const lista = porUFLeads.get(uf);
    if (lista) lista.push(lead);
    else porUFLeads.set(uf, [lead]);
  }

  const porUF: ResumoUF[] = [];
  const totais = {
    clientes: 0,
    abertos: 0,
    ganhos: 0,
    perdidos: 0,
    valorAberto: 0,
    faturamento: 0,
  };
  for (const [uf, lista] of porUFLeads) {
    const resumo = montarResumo(uf, lista, populacaoPorUF.get(uf) ?? null);
    porUF.push(resumo);
    totais.clientes += resumo.clientes;
    totais.abertos += resumo.negocios.abertos;
    totais.ganhos += resumo.negocios.ganhos;
    totais.perdidos += resumo.negocios.perdidos;
    totais.valorAberto += resumo.valorAberto;
    totais.faturamento += resumo.faturamento;
  }
  porUF.sort((a, b) => b.clientes - a.clientes);

  return NextResponse.json({
    porUF,
    totais,
    semUF,
    fontePopulacao: "IBGE — Estimativas de Populacao",
  });
}
