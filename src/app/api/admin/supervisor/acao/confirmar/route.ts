// Admin: resolve uma ação do Supervisor — CONFIRMAR, DESCARTAR ou DESFAZER.
// A lógica atômica (revalida, reivindica status, executa/reverte, grava
// snapshots) vive em src/lib/supervisor/executarAcao.ts, compartilhada com o
// caminho "executa no comando do chat". Aqui só traduz decisão → função e
// código → HTTP.
//
// POST /api/admin/supervisor/acao/confirmar
//   body: { acaoId: string, decisao?: "confirmar" | "descartar" | "reverter" }
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import {
  confirmarAcao,
  descartarAcao,
  reverterAcao,
  type CodigoAcao,
  type ResultadoAcao,
} from "@/lib/supervisor/executarAcao";
import type { AdminCtx } from "@/lib/supervisor/acoes/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Código de domínio → status HTTP (mantém os contratos que a UI já espera).
function httpDe(codigo: CodigoAcao): number {
  switch (codigo) {
    case "ok":
      return 200;
    case "nao_encontrada":
      return 404;
    case "ja_tratada":
      return 409;
    case "revalidou_falhou":
    case "exec_falhou":
    case "ferramenta_desconhecida":
      return 422;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sessao = await obterAdmin();
  if (!sessao) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const admin: AdminCtx = { id: sessao.id, nome: sessao.nome ?? "Admin" };

  let corpo: Record<string, unknown> | null = null;
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erro: "json invalido" }, { status: 400 });
  }
  const acaoId = typeof corpo?.acaoId === "string" ? corpo.acaoId.trim() : "";
  if (!acaoId) {
    return NextResponse.json({ erro: "acaoId obrigatorio" }, { status: 400 });
  }
  const decisao =
    corpo?.decisao === "descartar"
      ? "descartar"
      : corpo?.decisao === "reverter"
        ? "reverter"
        : "confirmar";

  let r: ResultadoAcao;
  if (decisao === "descartar") r = await descartarAcao(acaoId);
  else if (decisao === "reverter") r = await reverterAcao(acaoId, admin);
  else r = await confirmarAcao(acaoId, admin);

  if (!r.ok) {
    return NextResponse.json(
      { erro: r.erro ?? `acao ${r.status ? r.status.toLowerCase() : "nao pôde ser resolvida"}`, status: r.status },
      { status: httpDe(r.codigo) },
    );
  }
  return NextResponse.json({ ok: true, status: r.status, negocioId: r.negocioId ?? null });
}
