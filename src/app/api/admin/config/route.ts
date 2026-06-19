// Admin: configuracao geral do CRM (nome, fuso, horario comercial). GET/PUT.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { Prisma } from "@/generated/prisma/client";
import {
  estaAbertoAgora,
  normalizarHorarios,
  type DiaHorario,
} from "@/lib/horario";
import { HORARIOS_PADRAO } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function pegarConfig() {
  const existente = await prisma.configuracaoCRM.findFirst();
  if (existente) return existente;
  return prisma.configuracaoCRM.create({
    data: {
      nomeEmpresa: "Sixxis",
      fuso: "America/Sao_Paulo",
      horarios: HORARIOS_PADRAO,
    },
  });
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const config = await pegarConfig();
  const horarios = normalizarHorarios(config.horarios) ?? HORARIOS_PADRAO;
  return NextResponse.json({
    config: {
      nomeEmpresa: config.nomeEmpresa,
      fuso: config.fuso,
      horarios,
      mensagemForaHorario: config.mensagemForaHorario,
    },
    abertoAgora: estaAbertoAgora(horarios as DiaHorario[], config.fuso),
  });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  let body: {
    nomeEmpresa?: string;
    fuso?: string;
    horarios?: unknown;
    mensagemForaHorario?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const config = await pegarConfig();
  const horarios =
    body.horarios !== undefined
      ? normalizarHorarios(body.horarios)
      : undefined;

  const atualizada = await prisma.configuracaoCRM.update({
    where: { id: config.id },
    data: {
      ...(body.nomeEmpresa !== undefined
        ? { nomeEmpresa: body.nomeEmpresa.trim() || null }
        : {}),
      ...(body.fuso !== undefined ? { fuso: body.fuso.trim() } : {}),
      ...(horarios !== undefined
        ? { horarios: horarios as unknown as Prisma.InputJsonValue }
        : {}),
      ...(body.mensagemForaHorario !== undefined
        ? { mensagemForaHorario: body.mensagemForaHorario.trim() || null }
        : {}),
    },
  });

  const horariosNorm =
    normalizarHorarios(atualizada.horarios) ?? HORARIOS_PADRAO;
  return NextResponse.json({
    config: {
      nomeEmpresa: atualizada.nomeEmpresa,
      fuso: atualizada.fuso,
      horarios: horariosNorm,
      mensagemForaHorario: atualizada.mensagemForaHorario,
    },
    abertoAgora: estaAbertoAgora(horariosNorm as DiaHorario[], atualizada.fuso),
  });
}
