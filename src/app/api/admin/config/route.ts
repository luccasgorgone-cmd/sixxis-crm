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

  try {
    // Whitelist dos campos aceitos.
    const data: Prisma.ConfiguracaoCRMUpdateManyMutationInput = {};
    if (body.nomeEmpresa !== undefined) {
      data.nomeEmpresa =
        typeof body.nomeEmpresa === "string" ? body.nomeEmpresa.trim() || null : null;
    }
    if (body.fuso !== undefined && typeof body.fuso === "string" && body.fuso.trim()) {
      data.fuso = body.fuso.trim();
    }
    if (body.horarios !== undefined) {
      const h = normalizarHorarios(body.horarios);
      if (h) data.horarios = h as unknown as Prisma.InputJsonValue;
    }
    if (body.mensagemForaHorario !== undefined) {
      data.mensagemForaHorario =
        typeof body.mensagemForaHorario === "string"
          ? body.mensagemForaHorario.trim() || null
          : null;
    }

    // Singleton: atualiza a linha existente sem depender do id; cria se nao houver.
    if (Object.keys(data).length > 0) {
      const res = await prisma.configuracaoCRM.updateMany({ data });
      if (res.count === 0) {
        await prisma.configuracaoCRM.create({
          data: {
            nomeEmpresa: "Sixxis",
            fuso: "America/Sao_Paulo",
            horarios: HORARIOS_PADRAO as unknown as Prisma.InputJsonValue,
          },
        });
        await prisma.configuracaoCRM.updateMany({ data });
      }
    } else {
      await pegarConfig();
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
  } catch (erro) {
    return NextResponse.json(
      {
        erro: "falha ao salvar configuracao",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      },
      { status: 500 },
    );
  }
}
