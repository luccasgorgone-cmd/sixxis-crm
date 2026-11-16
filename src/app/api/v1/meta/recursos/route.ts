// GET /api/v1/meta/recursos  -> catalogo legivel por maquina: quais recursos
// existem, qual escopo exigem, campos expostos (com tipo) e filtros/expansoes.
// So METADADOS (nenhum dado de negocio). Exige autenticacao (qualquer chave).
import type { NextRequest } from "next/server";
import { handlerTransversal, handlerMetodoNaoPermitido, handlerOptions } from "@/lib/api-v1/handler";
import { listarRecursos } from "@/lib/api-v1/registro";
import { TODOS_ESCOPOS, ESCOPO_PII, ESCOPO_MENSAGENS } from "@/lib/api-v1/escopos";
import { listarMetricas } from "@/lib/api-v1/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return handlerTransversal(req, () => ({
    apiVersion: "v1",
    base: "/api/v1",
    escopos: {
      especiais: { "read:all": "Le todos os recursos de dominio", [ESCOPO_PII]: "Valores sensiveis sem mascara", [ESCOPO_MENSAGENS]: "Conteudo de mensagens/conversas" },
      conhecidos: [...TODOS_ESCOPOS],
    },
    recursos: listarRecursos().map((r) => ({
      nome: r.nome,
      caminho: `/api/v1/${r.nome}`,
      escopo: r.escopo,
      descricao: r.descricao ?? null,
      grande: r.grande ?? false,
      softDelete: r.softDelete ?? null,
      ordenacao: r.campoOrdenacao ?? "criadoEm",
      campos: Object.entries(r.campos).map(([nome, c]) => ({
        nome,
        tipo: c.tipo,
        descricao: c.descricao ?? null,
        enum: c.enum ? [...c.enum] : undefined,
      })),
      filtros: r.filtros ? Object.keys(r.filtros) : [],
      busca: r.busca ? [...r.busca] : [],
      expand: r.expand ? Object.keys(r.expand) : [],
    })),
    metricas: {
      caminho: "/api/v1/metricas/<nome>",
      escopo: "read:analytics",
      parametros: ["de", "ate", "agrupar=dia|semana|mes"],
      disponiveis: listarMetricas(),
    },
  }));
}

export const POST = handlerMetodoNaoPermitido;
export const PUT = handlerMetodoNaoPermitido;
export const PATCH = handlerMetodoNaoPermitido;
export const DELETE = handlerMetodoNaoPermitido;
export const OPTIONS = handlerOptions;
