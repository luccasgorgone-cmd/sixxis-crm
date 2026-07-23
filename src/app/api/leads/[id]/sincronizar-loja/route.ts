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
import { analisar, type EstadoCrm, type Analise } from "@/lib/sincronizarLoja";
import { recalcularNomeBusca } from "@/lib/nomeBusca";
import { registrarAtividade } from "@/lib/atividade";
import { AtividadeTipo, StatusNeg } from "@/generated/prisma/enums";
import { getIO } from "@/lib/socket";
import type { Prisma } from "@/generated/prisma/client";

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
      temNomeReal: !!(
        lead.nomeManual?.trim() ||
        lead.pushName?.trim() ||
        lead.nome?.trim()
      ),
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

// ---------------------------------------------------------------------------
// POST = APLICACAO. Grava SOMENTE as chaves recebidas (marcadas pelo usuario).
// Recomputa a mesclagem no servidor: NUNCA confia em valor vindo do cliente,
// so nas chaves. Tudo em transacao atomica e idempotente (rodar 2x nao duplica
// NF, rastreio nem endereco). NAO toca em GANHO/valor/estoque/orcamento.
// ---------------------------------------------------------------------------

const CADASTRO_LEAD: Record<string, "nomeManual" | "cpf" | "email" | "empresa"> =
  {
    nome: "nomeManual",
    cpf: "cpf",
    email: "email",
    empresa: "empresa",
  };

// Resolve o negocio para vincular NF/rastreio: o do corpo (se e do lead), senao
// o UNICO negocio ABERTO do lead. Ambiguo (varios abertos) -> null + flag.
async function resolverNegocio(
  leadId: string,
  negocioIdBody: string | null,
): Promise<{ id: string | null; ambiguo: boolean }> {
  if (negocioIdBody) {
    const n = await prisma.negocio.findFirst({
      where: { id: negocioIdBody, leadId },
      select: { id: true },
    });
    if (n) return { id: n.id, ambiguo: false };
  }
  const abertos = await prisma.negocio.findMany({
    where: { leadId, status: StatusNeg.ABERTO },
    select: { id: true },
  });
  if (abertos.length === 1) return { id: abertos[0].id, ambiguo: false };
  return { id: null, ambiguo: abertos.length > 1 };
}

export async function POST(
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

  let body: { pedidoId?: string; campos?: unknown; negocioId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }
  if (!Array.isArray(body.campos)) {
    return NextResponse.json({ erro: "campos obrigatorio" }, { status: 400 });
  }
  const pedidas = new Set(
    body.campos.filter((c): c is string => typeof c === "string"),
  );
  if (pedidas.size === 0) {
    return NextResponse.json({ erro: "nada a aplicar" }, { status: 400 });
  }
  const pedidoId = body.pedidoId?.trim() || null;
  const negocioIdBody = body.negocioId?.trim() || null;

  const negocio = await resolverNegocio(id, negocioIdBody);

  const base = await montarEstado(id, negocio.id);
  if (!base) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  const { estado, telefone } = base;

  let cliente;
  try {
    cliente = await buscarClienteComTimeout(telefone);
  } catch {
    return NextResponse.json(
      { erro: "Integracao com a loja indisponivel — tente novamente." },
      { status: 503 },
    );
  }

  const analise: Analise = analisar(estado, cliente, pedidoId);
  const porChave = new Map(analise.campos.map((c) => [c.chave, c]));

  const aplicados: string[] = [];
  const pulados: { chave: string; motivo: string }[] = [];
  const avisos: string[] = [];
  let nomeAplicado = false;

  await prisma.$transaction(async (tx) => {
    // --- Lead (cadastro): nome->nomeManual, cpf, email, empresa ---
    const leadData: Prisma.LeadUncheckedUpdateInput = {};
    for (const chave of Object.keys(CADASTRO_LEAD)) {
      if (!pedidas.has(chave)) continue;
      const campo = porChave.get(chave);
      if (!campo || campo.classificacao === "igual") continue;
      const valor = analise.valores[chave] ?? null;
      (leadData as Record<string, unknown>)[CADASTRO_LEAD[chave]] = valor;
      if (chave === "nome") nomeAplicado = true;
      aplicados.push(chave);
    }
    if (Object.keys(leadData).length > 0) {
      await tx.lead.update({ where: { id }, data: leadData });
    }

    // --- Endereco: atualiza o principal; cria (principal) se nao houver ---
    type CampoEnd =
      | "cep"
      | "logradouro"
      | "numero"
      | "complemento"
      | "bairro"
      | "cidade"
      | "uf";
    const endData: Partial<Record<CampoEnd, string | null>> = {};
    for (const campo of analise.campos) {
      if (campo.grupo !== "endereco") continue;
      if (!pedidas.has(campo.chave) || campo.classificacao === "igual") continue;
      endData[campo.chave as CampoEnd] = analise.valores[campo.chave] ?? null;
      aplicados.push(campo.chave);
    }
    if (Object.keys(endData).length > 0) {
      const principal = await tx.endereco.findFirst({
        where: { leadId: id, principal: true },
        select: { id: true },
      });
      if (principal) {
        await tx.endereco.update({
          where: { id: principal.id },
          data: endData,
        });
      } else {
        await tx.endereco.create({
          data: { leadId: id, principal: true, ...endData },
        });
      }
    }

    // --- Nota fiscal (aditiva; exige data; idempotente pelo numero) ---
    if (pedidas.has("notaFiscal")) {
      const numero = analise.valores.notaFiscal;
      if (!numero) {
        pulados.push({ chave: "notaFiscal", motivo: "loja sem numero de NF" });
      } else {
        const existe = await tx.notaFiscal.findFirst({
          where: { leadId: id, numero },
          select: { id: true },
        });
        if (existe) {
          pulados.push({
            chave: "notaFiscal",
            motivo: "NF ja registrada para o cliente",
          });
        } else if (!analise.dataNF) {
          pulados.push({ chave: "notaFiscal", motivo: "sem data da NF" });
        } else {
          await tx.notaFiscal.create({
            data: {
              leadId: id,
              negocioId: negocio.id,
              numero,
              dataNF: new Date(analise.dataNF),
              agenteId: agente.id,
            },
          });
          aplicados.push("notaFiscal");
          if (!negocio.id) {
            avisos.push(
              "Nota fiscal vinculada apenas ao cliente (negocio nao identificado).",
            );
          }
        }
      }
    }

    // --- Rastreio (exige negocio; idempotente pelo codigo) ---
    if (pedidas.has("codigoRastreio")) {
      const codigo = analise.valores.codigoRastreio;
      if (!codigo) {
        pulados.push({
          chave: "codigoRastreio",
          motivo: "loja sem codigo de rastreio",
        });
      } else if (!negocio.id) {
        pulados.push({
          chave: "codigoRastreio",
          motivo: negocio.ambiguo
            ? "varios negocios abertos — abra o negocio certo"
            : "sem negocio para vincular",
        });
      } else {
        const existe = await tx.rastreioNegocio.findFirst({
          where: { negocioId: negocio.id, codigo },
          select: { id: true },
        });
        if (existe) {
          pulados.push({
            chave: "codigoRastreio",
            motivo: "rastreio ja registrado no negocio",
          });
        } else {
          await tx.rastreioNegocio.create({
            data: {
              negocioId: negocio.id,
              codigo,
              transportadora: analise.transportadora,
            },
          });
          aplicados.push("codigoRastreio");
        }
      }
    }
  });

  // Nome mudou -> recalcula nomeBusca (Fatia P, ponto unico). Best-effort.
  if (nomeAplicado) await recalcularNomeBusca(id);

  if (aplicados.length > 0) {
    await registrarAtividade({
      leadId: id,
      agenteId: agente.id,
      tipo: AtividadeTipo.ACOMPANHAMENTO,
      descricao: `Dados sincronizados da loja: ${aplicados.join(", ")} (por ${agente.nome ?? "colaborador"})`,
    });
    const novoNome = nomeAplicado
      ? (analise.valores.nome ?? estado.nomeEfetivo)
      : estado.nomeEfetivo;
    getIO()?.emit("cliente:atualizado", { leadId: id, nome: novoNome });
  }

  return NextResponse.json({
    ok: true,
    aplicados,
    pulados,
    avisos,
    negocioVinculado: negocio.id,
  });
}
