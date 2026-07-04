"use client";

// Filtro de periodo por ENTRADA do atendimento (quando entrou). Opcional: inclui
// "Todos" (sem filtro). Mapeia 1:1 aos params da API (?periodo=hoje|7d|15d|30d|
// custom + ?de=&ate=). Usado no Inbox e no Kanban (mesma UX). Compacto, dark mode.
import { CalendarRange } from "lucide-react";

export type PeriodoEntrada = {
  periodo: "" | "hoje" | "7d" | "15d" | "30d" | "custom";
  de?: string; // YYYY-MM-DD (apenas custom)
  ate?: string;
};

export const PERIODO_TODOS: PeriodoEntrada = { periodo: "" };

const OPCOES: { v: PeriodoEntrada["periodo"]; r: string }[] = [
  { v: "", r: "Todos" },
  { v: "hoje", r: "Hoje" },
  { v: "7d", r: "7 dias" },
  { v: "15d", r: "15 dias" },
  { v: "30d", r: "30 dias" },
  { v: "custom", r: "Personalizado" },
];

// Params de query (periodo/de/ate) para a API. Vazio quando "Todos" (ou custom
// incompleto) — o backend nao filtra.
export function paramsPeriodo(v: PeriodoEntrada): Record<string, string> {
  if (!v.periodo) return {};
  if (v.periodo === "custom") {
    if (!v.de || !v.ate) return {};
    return { periodo: "custom", de: v.de, ate: v.ate };
  }
  return { periodo: v.periodo };
}

export function FiltroPeriodoEntrada({
  valor,
  onChange,
  contador,
}: {
  valor: PeriodoEntrada;
  onChange: (v: PeriodoEntrada) => void;
  contador?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center rounded-lg border border-black/10 bg-white p-0.5 dark:bg-white/5">
        {OPCOES.map((o) => {
          const ativo = valor.periodo === o.v;
          return (
            <button
              key={o.v || "todos"}
              onClick={() => onChange({ ...valor, periodo: o.v })}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                ativo
                  ? "bg-tiffany text-white"
                  : "text-medio/70 hover:bg-black/5"
              }`}
            >
              {o.r}
            </button>
          );
        })}
      </div>

      {valor.periodo === "custom" && (
        <div className="flex items-center gap-1.5">
          <CalendarRange className="h-4 w-4 shrink-0 text-medio/50" />
          <input
            type="date"
            value={valor.de ?? ""}
            onChange={(e) => onChange({ ...valor, de: e.target.value })}
            aria-label="Data inicial"
            className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-escuro outline-none focus:border-tiffany"
          />
          <span className="text-xs text-medio/50">ate</span>
          <input
            type="date"
            value={valor.ate ?? ""}
            onChange={(e) => onChange({ ...valor, ate: e.target.value })}
            aria-label="Data final"
            className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-escuro outline-none focus:border-tiffany"
          />
        </div>
      )}

      {valor.periodo !== "" && contador != null && (
        <span className="text-xs text-medio/50">
          {contador} {contador === 1 ? "atendimento" : "atendimentos"} no periodo
        </span>
      )}
    </div>
  );
}
