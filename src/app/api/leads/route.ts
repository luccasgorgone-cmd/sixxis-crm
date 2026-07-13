// Cadastro MANUAL de cliente (Lead) com vinculo ao dono, sem furar o round-robin.
// POST {nome?, telefone (obrigatorio), finalidade, donoId?(admin), email?, cpf?,
//       cnpj?, assumir?} -> cria o Lead ja com dono definido, aceitaContato=true,
// origem="manual". NAO cria conversa/negocio (nascem no 1o contato). Telefone
// duplicado: 409 com {leadId} (a UI oferece assumir) ou, com assumir=true,
// vincula o dono ao lead existente.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { registrarAtividade } from "@/lib/atividade";
import { normalizarTelefoneBR } from "@/lib/phone";
import { campoDono, temAcesso } from "@/lib/dono";
import { espelharDonoNasConversas } from "@/lib/dono";
import { garantirNegocioParaLead } from "@/lib/negocio";
import { nomeEfetivo, nomeBuscaDe } from "@/lib/cliente";
import { parseDataNascimento } from "@/lib/format";
import { Finalidade, AtividadeTipo, Segmento } from "@/generated/prisma/enums";

// Valida o segmento do corpo (VAREJO/ATACADO) ou null (nao definido).
function lerSegmento(v: unknown): Segmento | null {
  return v === Segmento.VAREJO || v === Segmento.ATACADO ? v : null;
}

// Campos opcionais de endereco aceitos no cadastro (mesmo shape do endpoint de
// enderecos). Cria um Endereco (principal) quando ao menos um vier preenchido.
type EnderecoEntrada = {
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
};

function limparEndereco(
  e: EnderecoEntrada | undefined,
): Record<string, string> | null {
  if (!e || typeof e !== "object") return null;
  const campos = [
    "cep",
    "logradouro",
    "numero",
    "complemento",
    "bairro",
    "cidade",
    "uf",
  ] as const;
  const dados: Record<string, string> = {};
  for (const c of campos) {
    const v = e[c];
    const s = v == null ? "" : String(v).trim();
    if (s) dados[c] = c === "uf" ? s.toUpperCase().slice(0, 2) : s;
  }
  return Object.keys(dados).length > 0 ? dados : null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const admin = ehAdmin(agente.papel);

  let body: {
    nome?: string;
    telefone?: string;
    finalidade?: string;
    donoId?: string | null;
    email?: string | null;
    cpf?: string | null;
    cnpj?: string | null;
    segmento?: string | null;
    dataNascimento?: string | null;
    endereco?: EnderecoEntrada;
    assumir?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  // Campos opcionais: data de nascimento (mesma validacao do PATCH) e endereco.
  const nascParsed = parseDataNascimento(body.dataNascimento);
  if (!nascParsed.ok) {
    return NextResponse.json(
      { erro: "data de nascimento invalida" },
      { status: 400 },
    );
  }
  const dataNascimento = nascParsed.valor;
  const enderecoDados = limparEndereco(body.endereco);

  const telefone = normalizarTelefoneBR(body.telefone ?? "");
  if (telefone.length < 12) {
    return NextResponse.json(
      { erro: "telefone invalido (informe DDD + numero)" },
      { status: 400 },
    );
  }
  const finalidade =
    body.finalidade === Finalidade.POS_VENDA
      ? Finalidade.POS_VENDA
      : Finalidade.VENDA;

  // Dono: admin pode escolher; demais sao sempre o proprio usuario.
  const donoId = admin && body.donoId ? body.donoId : agente.id;
  const dono = await prisma.agente.findUnique({
    where: { id: donoId },
    select: { id: true, nome: true, acessoVenda: true, acessoPosVenda: true },
  });
  if (!dono) {
    return NextResponse.json({ erro: "dono nao encontrado" }, { status: 404 });
  }
  if (!temAcesso(dono, finalidade)) {
    return NextResponse.json(
      { erro: "o dono escolhido nao tem acesso a essa finalidade" },
      { status: 403 },
    );
  }

  const campo = campoDono(finalidade);

  // Telefone ja cadastrado: sem assumir -> 409; com assumir -> vincula o dono.
  const existente = await prisma.lead.findUnique({
    where: { telefone },
    select: {
      id: true,
      nome: true,
      pushName: true,
      nomeManual: true,
      telefone: true,
      donoId: true,
      donoPosVendaId: true,
    },
  });
  if (existente) {
    if (!body.assumir) {
      return NextResponse.json(
        {
          erro: "telefone ja cadastrado",
          duplicado: true,
          leadId: existente.id,
          nome: nomeEfetivo(existente),
        },
        { status: 409 },
      );
    }
    // Assumir/vincular: define o dono da finalidade no lead existente.
    await prisma.lead.update({
      where: { id: existente.id },
      data: { [campo]: donoId, aceitaContato: true },
    });
    await espelharDonoNasConversas(prisma, existente.id, finalidade, donoId);
    // Garante um negocio ABERTO na finalidade (idempotente) para o painel ficar
    // completo tambem ao vincular. Fatia 2.86.
    await garantirNegocioParaLead(existente.id, finalidade);
    await registrarAtividade({
      leadId: existente.id,
      agenteId: agente.id,
      tipo: AtividadeTipo.ATRIBUICAO,
      descricao: `Cliente vinculado a ${dono.nome ?? "colaborador"} (${finalidade === Finalidade.VENDA ? "venda" : "pos-venda"}) via cadastro manual`,
    });
    return NextResponse.json({ leadId: existente.id, vinculado: true });
  }

  // Cria o lead manual ja com dono. Sem conversa/negocio (nascem no 1o contato).
  // Endereco (principal) so quando algum campo veio preenchido — tudo opcional.
  const nomeManualNovo = body.nome?.trim() || null;
  const lead = await prisma.lead.create({
    data: {
      telefone,
      nomeManual: nomeManualNovo,
      // nomeBusca normalizado (Fatia P): inline no cadastro manual.
      nomeBusca: nomeBuscaDe({ nome: null, pushName: null, nomeManual: nomeManualNovo, telefone }),
      email: body.email?.trim() || null,
      cpf: body.cpf?.trim() || null,
      cnpj: body.cnpj?.trim() || null,
      segmento: lerSegmento(body.segmento),
      dataNascimento,
      origem: "manual",
      aceitaContato: true,
      [campo]: donoId,
      ...(enderecoDados
        ? { enderecos: { create: { ...enderecoDados, principal: true } } }
        : {}),
    },
  });

  // Garante um negocio ABERTO na finalidade escolhida (idempotente): assim o
  // painel do Inbox ja nasce completo ao abrir a conversa do cliente manual, sem
  // depender do 1o contato real. Nao duplica. Fatia 2.86.
  await garantirNegocioParaLead(lead.id, finalidade);

  await registrarAtividade({
    leadId: lead.id,
    agenteId: agente.id,
    tipo: AtividadeTipo.CRIACAO,
    descricao: `Cliente cadastrado manualmente e atribuido a ${dono.nome ?? "colaborador"} (${finalidade === Finalidade.VENDA ? "venda" : "pos-venda"})`,
  });

  return NextResponse.json({ leadId: lead.id, criado: true });
}
