// Fatia AB — rota INTERNA de APLICACAO. A Loja manda os dados + as chaves que o
// dono marcou; o CRM RECOMPUTA a classificacao no servidor e aplica SOMENTE as
// chaves listadas (nunca confia em valores "ja resolvidos"). Tudo em transacao
// atomica e idempotente. Auth por x-internal-key.
//
// Body: { leadId, dados: {...igual a previa...}, campos: string[], negocioId? }
// Resposta: { ok, aplicados: [], pulados: [{chave, motivo}], avisos: [] }
import { type NextRequest } from "next/server";
import {
  autorizarInterno,
  jsonInterno,
  naoAutorizadoInterno,
} from "@/lib/internoAuth";
import { montarEstadoLead, resolverNegocioLead } from "@/lib/estadoLeadSync";
import { analisarValores, type ValoresExternos } from "@/lib/sincronizarLoja";
import { aplicarSincronizacao } from "@/lib/aplicarSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!autorizarInterno(req)) return naoAutorizadoInterno();

  let body: {
    leadId?: unknown;
    dados?: ValoresExternos;
    campos?: unknown;
    negocioId?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonInterno({ erro: "corpo invalido" }, 400);
  }

  const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
  if (!leadId) return jsonInterno({ erro: "leadId obrigatorio" }, 400);
  if (!Array.isArray(body.campos)) {
    return jsonInterno({ erro: "campos obrigatorio" }, 400);
  }
  const pedidas = new Set(
    body.campos.filter((c): c is string => typeof c === "string"),
  );
  if (pedidas.size === 0) {
    return jsonInterno({ erro: "nada a aplicar" }, 400);
  }
  const dados: ValoresExternos =
    body.dados && typeof body.dados === "object" ? body.dados : {};
  const negocioIdBody =
    typeof body.negocioId === "string" && body.negocioId.trim()
      ? body.negocioId.trim()
      : null;

  const negocio = await resolverNegocioLead(leadId, negocioIdBody);
  const base = await montarEstadoLead(leadId, negocio.id);
  if (!base) return jsonInterno({ erro: "lead nao encontrado" }, 404);

  const analise = analisarValores(base.estado, dados);
  const resultado = await aplicarSincronizacao({
    leadId,
    analise,
    pedidas,
    negocio,
    nomeEfetivoAtual: base.estado.nomeEfetivo,
    autor: { agenteId: null, rotulo: "sincronizacao da loja" },
  });

  return jsonInterno({
    ok: true,
    negocioVinculado: negocio.id,
    ...resultado,
  });
}
