// Admin: CHAT do Supervisor Comercial (Camada 2, IA). Recebe o histórico do chat
// e devolve a resposta do consultor interno. A IA NUNCA executa escrita: quando
// ela sugere uma ação no CRM, esta rota PERSISTE a sugestão como
// SupervisorAcao(PROPOSTO) e devolve o id — a execução só acontece depois, no
// /acao/confirmar, com clique do admin (human-in-the-loop, §6).
//
// Toda chamada paga passa pelo teto mensal dentro de gerarRespostaSupervisor
// (HARD STOP antes da rede). O gasto é gravado em SolEvento (mesmo teto da Sol).
//
// POST /api/admin/supervisor/chat
//   body: { historico: [{ autor: "gestor"|"assistente", texto: string }] }
import { NextResponse, type NextRequest } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import {
  gerarRespostaSupervisor,
  type SupervisorMensagem,
} from "@/lib/supervisor/ia";
import { ehReversivel, lerId } from "@/lib/supervisor/acoes/tipos";
import { acharFerramenta } from "@/lib/supervisor/acoes/registro";
import { confirmarAcao } from "@/lib/supervisor/executarAcao";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizarHistorico(bruto: unknown): SupervisorMensagem[] {
  if (!Array.isArray(bruto)) return [];
  const out: SupervisorMensagem[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const texto = typeof o.texto === "string" ? o.texto : "";
    const autor = o.autor === "assistente" ? "assistente" : "gestor";
    if (texto.trim()) out.push({ autor, texto });
  }
  // Teto defensivo: as últimas N trocas bastam (evita prompt gigante/custo).
  return out.slice(-40);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "json invalido" }, { status: 400 });
  }
  const historico = normalizarHistorico(
    (corpo as Record<string, unknown> | null)?.historico,
  );
  if (historico.length === 0) {
    return NextResponse.json({ erro: "historico vazio" }, { status: 400 });
  }

  const resultado = await gerarRespostaSupervisor({
    historico,
    admin: { id: admin.id, nome: admin.nome ?? "Admin" },
  });

  // Se a IA sugeriu uma ação, materializa como PROPOSTO. Se o GESTOR COMANDOU
  // (acaoSolicitada) e a ação é REVERSÍVEL, executa direto pelo caminho único
  // (confirmarAcao) — o comando é a autorização; fica com undo. Ações
  // irreversíveis NUNCA executam direto: continuam PROPOSTO (exigem confirmação).
  let acao:
    | { id: string; ferramenta: string; preview: string; status: string; erro?: string }
    | null = null;
  if (resultado.proposta) {
    const { ferramenta, args, preview } = resultado.proposta;
    const negocioId = lerId(args, "negocioId");
    const registro = await prisma.supervisorAcao.create({
      data: {
        adminId: admin.id,
        ferramenta,
        // args já é JSON (veio de JSON.parse no orquestrador); cast seguro.
        argsJson: args as Prisma.InputJsonValue,
        preview,
        status: "PROPOSTO",
        negocioId: negocioId ?? null,
      },
      select: { id: true, ferramenta: true, preview: true },
    });

    let status = "PROPOSTO";
    let erro: string | undefined;
    const ferr = acharFerramenta(registro.ferramenta);
    if (resultado.acaoSolicitada && ferr && ehReversivel(ferr)) {
      const r = await confirmarAcao(registro.id, { id: admin.id, nome: admin.nome ?? "Admin" });
      if (r.ok) status = "EXECUTADO";
      else if (r.codigo === "revalidou_falhou") {
        status = "PROPOSTO"; // estado mudou; cai no card de confirmação manual
        erro = r.erro;
      } else {
        status = "FALHOU";
        erro = r.erro;
      }
    }
    acao = { ...registro, status, ...(erro ? { erro } : {}) };
  }

  return NextResponse.json({
    resposta: resultado.resposta,
    acao,
    // Quando a IA tentou propor algo que não passou na validação do servidor.
    propostaRejeitada: resultado.propostaRejeitada ?? null,
  });
}
