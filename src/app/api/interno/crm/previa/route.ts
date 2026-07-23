// Fatia AB — rota INTERNA de PREVIA (dry-run). A Loja manda os dados de um
// pedido e o CRM devolve a comparacao campo a campo (preencher/conflito/igual),
// SEM gravar nada. Idempotencia visivel: NF ja existente / rastreio ja existente
// saem como "igual". Auth por x-internal-key.
//
// Body: { leadId, dados: { nome?, cpf?, email?, empresa?, endereco?: {cep,
//   logradouro, numero, complemento, bairro, cidade, uf}, notaFiscal?: {numero,
//   data}, rastreio?: {codigo, transportadora} }, negocioId? }
import { type NextRequest } from "next/server";
import {
  autorizarInterno,
  jsonInterno,
  naoAutorizadoInterno,
} from "@/lib/internoAuth";
import { montarEstadoLead } from "@/lib/estadoLeadSync";
import { analisarValores, type ValoresExternos } from "@/lib/sincronizarLoja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!autorizarInterno(req)) return naoAutorizadoInterno();

  let body: { leadId?: unknown; dados?: ValoresExternos; negocioId?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonInterno({ erro: "corpo invalido" }, 400);
  }

  const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
  if (!leadId) return jsonInterno({ erro: "leadId obrigatorio" }, 400);
  const dados: ValoresExternos =
    body.dados && typeof body.dados === "object" ? body.dados : {};
  const negocioId =
    typeof body.negocioId === "string" && body.negocioId.trim()
      ? body.negocioId.trim()
      : null;

  const base = await montarEstadoLead(leadId, negocioId);
  if (!base) return jsonInterno({ erro: "lead nao encontrado" }, 404);

  const analise = analisarValores(base.estado, dados);
  return jsonInterno({
    ok: true,
    leadId,
    campos: analise.campos,
    avisos: analise.avisos,
  });
}
