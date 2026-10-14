// Admin: CONFIG editável do Supervisor (limiares de métrica + varredura).
//   GET  → config resolvida atual (para a aba Configurações e o Explicativo).
//   PUT  → aplica um patch parcial { limiares?, varredura? } vindo do FORMULÁRIO
//          do gestor. Valida faixas no ponto único (aplicarPatchConfig); grava e
//          registra uma SupervisorAcao(EXECUTADO, definir_config) com antes/depois
//          para auditoria e desfazer. Não chama IA, não gasta token.
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import {
  carregarConfigEditavel,
  salvarConfigEditavel,
} from "@/lib/supervisor/config";
import { aplicarPatchConfig, type PatchConfig } from "@/lib/supervisor/tipos";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  const config = await carregarConfigEditavel();
  return NextResponse.json(config);
}

function lerBloco(bruto: unknown): Record<string, unknown> | undefined {
  return bruto && typeof bruto === "object" && !Array.isArray(bruto)
    ? (bruto as Record<string, unknown>)
    : undefined;
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) return NextResponse.json({ erro: "sem permissao" }, { status: 403 });

  let corpo: Record<string, unknown> | null = null;
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erro: "json invalido" }, { status: 400 });
  }

  const patch: PatchConfig = {};
  const lim = lerBloco(corpo?.limiares);
  const varr = lerBloco(corpo?.varredura);
  if (lim) patch.limiares = lim;
  if (varr) patch.varredura = varr;
  if (!patch.limiares && !patch.varredura) {
    return NextResponse.json({ erro: "nada para alterar" }, { status: 400 });
  }

  const base = await carregarConfigEditavel();
  const r = aplicarPatchConfig(base, patch);
  if (!r.ok) {
    return NextResponse.json({ erro: r.erro }, { status: 422 });
  }

  // Config + trilha de auditoria/undo gravadas ATOMICAMENTE (se a auditoria
  // falhar, a config não muda sem rastro).
  const salvo = await prisma.$transaction(async (tx) => {
    const s = await salvarConfigEditavel(r.valor, tx);
    await tx.supervisorAcao.create({
      data: {
        adminId: admin.id,
        ferramenta: "definir_config",
        argsJson: patch as Prisma.InputJsonValue,
        preview: "Configuração alterada pelo gestor (formulário).",
        status: "EXECUTADO",
        executadoEm: new Date(),
        antesJson: base as unknown as Prisma.InputJsonValue,
        depoisJson: s as unknown as Prisma.InputJsonValue,
      },
    });
    return s;
  });

  return NextResponse.json({ ok: true, config: salvo });
}
