// Fatia AA — sincronizar dados do cliente a partir da LOJA.
// GET  = PREVIEW (read-only): compara CRM x Loja e devolve a lista de campos com
//        classificacao (preencher/conflito/igual) para a tela de conferencia.
// Nada e gravado aqui. Loja offline / sem cadastro -> estado amigavel, nunca 500.
// A mesclagem vive em @/lib/sincronizarLoja (ponto unico, reusado pelo POST).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, podeGerenciarLead } from "@/lib/autorizacao";
import { nomeEfetivo } from "@/lib/cliente";
import { buscarCliente } from "@/lib/loja";
import { analisar, type EstadoCrm } from "@/lib/sincronizarLoja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_LOJA_MS = 6000;

// Busca o cliente na loja com teto de tempo: a loja lenta NUNCA derruba o painel.
async function buscarClienteComTimeout(telefone: string) {
  return Promise.race([
    buscarCliente(telefone),
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("timeout loja")), TIMEOUT_LOJA_MS),
    ),
  ]);
}

// Monta o estado atual do CRM para a mesclagem. codigosRastreio = null quando
// nao ha negocio resolvido (o rastreio entao nem e oferecido).
async function montarEstado(
  leadId: string,
  negocioId: string | null,
): Promise<{ estado: EstadoCrm; telefone: string } | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      nome: true,
      pushName: true,
      nomeManual: true,
      telefone: true,
      cpf: true,
      email: true,
      empresa: true,
    },
  });
  if (!lead) return null;

  const principal = await prisma.endereco.findFirst({
    where: { leadId, principal: true },
    select: {
      cep: true,
      logradouro: true,
      numero: true,
      complemento: true,
      bairro: true,
      cidade: true,
      uf: true,
    },
  });

  const nfs = await prisma.notaFiscal.findMany({
    where: { leadId },
    select: { numero: true },
  });

  // Rastreio so faz sentido com um negocio DO PROPRIO lead.
  let codigosRastreio: string[] | null = null;
  if (negocioId) {
    const negocio = await prisma.negocio.findFirst({
      where: { id: negocioId, leadId },
      select: { rastreios: { select: { codigo: true } } },
    });
    if (negocio) codigosRastreio = negocio.rastreios.map((r) => r.codigo);
  }

  return {
    telefone: lead.telefone,
    estado: {
      nomeEfetivo: nomeEfetivo(lead),
      temNomeManual: !!lead.nomeManual?.trim(),
      cpf: lead.cpf ?? null,
      email: lead.email ?? null,
      empresa: lead.empresa ?? null,
      endereco: {
        cep: principal?.cep ?? null,
        logradouro: principal?.logradouro ?? null,
        numero: principal?.numero ?? null,
        complemento: principal?.complemento ?? null,
        bairro: principal?.bairro ?? null,
        cidade: principal?.cidade ?? null,
        uf: principal?.uf ?? null,
      },
      numerosNF: nfs.map((n) => n.numero),
      codigosRastreio,
    },
  };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await podeGerenciarLead(agente, id))) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const pedidoId = req.nextUrl.searchParams.get("pedidoId")?.trim() || null;
  const negocioId = req.nextUrl.searchParams.get("negocioId")?.trim() || null;

  const base = await montarEstado(id, negocioId);
  if (!base) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  const { estado, telefone } = base;

  // Loja indisponivel -> estado offline amigavel (nunca derruba o painel).
  let cliente;
  try {
    cliente = await buscarClienteComTimeout(telefone);
  } catch {
    return NextResponse.json({
      ok: true,
      offline: true,
      temCadastro: false,
      pedidoId: null,
      campos: [],
      avisos: ["Integracao com a loja indisponivel no momento."],
    });
  }

  const temCadastro =
    !!cliente.cliente || (cliente.pedidos?.length ?? 0) > 0;
  if (!temCadastro) {
    return NextResponse.json({
      ok: true,
      offline: false,
      temCadastro: false,
      pedidoId: null,
      campos: [],
      avisos: ["Nenhum pedido encontrado na loja para este telefone."],
    });
  }

  const analise = analisar(estado, cliente, pedidoId);
  return NextResponse.json({
    ok: true,
    offline: false,
    temCadastro: true,
    pedidoId: analise.pedidoUsado?.id ?? null,
    campos: analise.campos,
    avisos: analise.avisos,
  });
}
