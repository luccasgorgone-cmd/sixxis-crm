// Edicao dos dados do CLIENTE (Lead): nomeManual, email, empresa, cpf,
// anotacoes (EDICAO); acompanhamento pos-venda — nota fiscal e empresa faturada
// (ACOMPANHAMENTO). Dono (venda/pos-venda/atendente da conversa) ou ADMIN.
// Registra Atividade com o que mudou.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAgente, ehAdmin } from "@/lib/autorizacao";
import { registrarAtividade } from "@/lib/atividade";
import { nomeEfetivo } from "@/lib/cliente";
import { getIO } from "@/lib/socket";
import { AtividadeTipo } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Campos editaveis e seus rotulos para a descricao da atividade.
const CAMPOS: { chave: "nomeManual" | "email" | "empresa" | "cpf" | "cnpj" | "anotacoes"; rotulo: string }[] = [
  { chave: "nomeManual", rotulo: "nome" },
  { chave: "email", rotulo: "email" },
  { chave: "empresa", rotulo: "empresa" },
  { chave: "cpf", rotulo: "CPF" },
  { chave: "cnpj", rotulo: "CNPJ" },
  { chave: "anotacoes", rotulo: "anotacoes" },
];

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const agente = await obterAgente();
  if (!agente) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      pushName: true,
      nomeManual: true,
      telefone: true,
      email: true,
      empresa: true,
      cpf: true,
      cnpj: true,
      dataNascimento: true,
      anotacoes: true,
      aceitaContato: true,
      notaFiscal: true,
      garantia: true,
      empresaFaturadaId: true,
      donoId: true,
      donoPosVendaId: true,
      conversas: { select: { agenteId: true } },
    },
  });
  if (!lead) {
    return NextResponse.json({ erro: "nao encontrado" }, { status: 404 });
  }
  const ehDono =
    lead.donoId === agente.id ||
    lead.donoPosVendaId === agente.id ||
    lead.conversas.some((c) => c.agenteId === agente.id);
  // Edicao base (dados/NF/empresa): dono do cliente ou admin (vendedor inclui).
  const podeEditarBase = ehAdmin(agente.papel) || ehDono;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const data: Prisma.LeadUncheckedUpdateInput = {};
  const mudancas: string[] = []; // Atividade(EDICAO)
  const mudAcomp: string[] = []; // Atividade(ACOMPANHAMENTO)

  // Quais grupos de campos o corpo tenta editar.
  const tentaBase =
    CAMPOS.some(({ chave }) => body[chave] !== undefined) ||
    body.dataNascimento !== undefined ||
    typeof body.aceitaContato === "boolean";
  const tentaAcomp =
    body.notaFiscal !== undefined || body.empresaFaturadaId !== undefined;

  if ((tentaBase || tentaAcomp) && !podeEditarBase) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  for (const { chave, rotulo } of CAMPOS) {
    if (body[chave] === undefined) continue;
    const bruto = body[chave];
    const novo =
      bruto === null || String(bruto).trim() === "" ? null : String(bruto).trim();
    const atual = (lead[chave] as string | null) ?? null;
    if (novo !== atual) {
      (data as Record<string, unknown>)[chave] = novo;
      mudancas.push(rotulo);
    }
  }

  // Data de nascimento (apenas a data, em UTC meia-noite). "" / null = limpar.
  if (body.dataNascimento !== undefined) {
    const bruto = body.dataNascimento;
    let nova: Date | null = null;
    if (bruto !== null && String(bruto).trim() !== "") {
      // Espera "YYYY-MM-DD" (input date). Fixa meia-noite UTC para evitar
      // deslocamento de fuso ao exibir.
      const m = String(bruto).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) {
        return NextResponse.json(
          { erro: "data de nascimento invalida" },
          { status: 400 },
        );
      }
      nova = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
      if (Number.isNaN(nova.getTime())) {
        return NextResponse.json(
          { erro: "data de nascimento invalida" },
          { status: 400 },
        );
      }
    }
    const atualMs = lead.dataNascimento
      ? new Date(lead.dataNascimento).getTime()
      : null;
    if ((nova ? nova.getTime() : null) !== atualMs) {
      data.dataNascimento = nova;
      mudancas.push("data de nascimento");
    }
  }

  // Opt-out de comunicacoes em massa (boolean a parte dos campos de texto).
  if (typeof body.aceitaContato === "boolean" && body.aceitaContato !== lead.aceitaContato) {
    data.aceitaContato = body.aceitaContato;
    mudancas.push(body.aceitaContato ? "aceita contato" : "opt-out de contato");
  }

  // ---- Acompanhamento: nota fiscal ----
  if (body.notaFiscal !== undefined) {
    const novo =
      body.notaFiscal === null || String(body.notaFiscal).trim() === ""
        ? null
        : String(body.notaFiscal).trim();
    if (novo !== (lead.notaFiscal ?? null)) {
      data.notaFiscal = novo;
      mudAcomp.push(novo ? `Nota fiscal definida: ${novo}` : "Nota fiscal removida");
    }
  }

  // ---- Acompanhamento: empresa faturada ----
  if (body.empresaFaturadaId !== undefined) {
    const novoId =
      body.empresaFaturadaId === null || String(body.empresaFaturadaId).trim() === ""
        ? null
        : String(body.empresaFaturadaId).trim();
    if (novoId !== (lead.empresaFaturadaId ?? null)) {
      let nomeEmpresa: string | null = null;
      if (novoId) {
        const emp = await prisma.empresaFaturada.findUnique({
          where: { id: novoId },
          select: { nome: true },
        });
        if (!emp) {
          return NextResponse.json(
            { erro: "empresa faturada nao encontrada" },
            { status: 404 },
          );
        }
        nomeEmpresa = emp.nome;
      }
      data.empresaFaturadaId = novoId;
      mudAcomp.push(
        nomeEmpresa
          ? `Empresa faturada definida: ${nomeEmpresa}`
          : "Empresa faturada removida",
      );
    }
  }

  // ---- Garantia (pos-venda): donoPosVenda, acesso pos-venda ou admin ----
  if (body.garantia !== undefined) {
    let podeGarantia =
      ehAdmin(agente.papel) || lead.donoPosVendaId === agente.id;
    if (!podeGarantia) {
      const eu = await prisma.agente.findUnique({
        where: { id: agente.id },
        select: { acessoPosVenda: true },
      });
      podeGarantia = !!eu?.acessoPosVenda;
    }
    if (!podeGarantia) {
      return NextResponse.json(
        { erro: "sem permissao para alterar a garantia" },
        { status: 403 },
      );
    }
    const novo =
      body.garantia === null ? null : Boolean(body.garantia);
    if (novo !== (lead.garantia ?? null)) {
      data.garantia = novo;
      const rotulo =
        novo === true ? "Com garantia" : novo === false ? "Sem garantia" : "Nao definido";
      mudAcomp.push(`Garantia definida como ${rotulo}`);
    }
  }

  if (mudancas.length === 0 && mudAcomp.length === 0) {
    return NextResponse.json({ erro: "nada a atualizar" }, { status: 400 });
  }

  const atualizado = await prisma.lead.update({
    where: { id },
    data,
    select: {
      id: true,
      nome: true,
      pushName: true,
      nomeManual: true,
      telefone: true,
      email: true,
      empresa: true,
      cpf: true,
      cnpj: true,
      dataNascimento: true,
      anotacoes: true,
      notaFiscal: true,
      garantia: true,
      empresaFaturadaId: true,
      fotoUrl: true,
    },
  });

  if (mudancas.length > 0) {
    await registrarAtividade({
      leadId: id,
      agenteId: agente.id,
      tipo: AtividadeTipo.EDICAO,
      descricao: `Dados do cliente atualizados: ${mudancas.join(", ")}`,
    });
  }
  if (mudAcomp.length > 0) {
    await registrarAtividade({
      leadId: id,
      agenteId: agente.id,
      tipo: AtividadeTipo.ACOMPANHAMENTO,
      descricao: `${mudAcomp.join("; ")} (por ${agente.nome ?? "colaborador"})`,
    });
  }

  getIO()?.emit("cliente:atualizado", {
    leadId: id,
    nome: nomeEfetivo(atualizado),
  });

  return NextResponse.json({
    lead: { ...atualizado, nomeEfetivo: nomeEfetivo(atualizado) },
  });
}
