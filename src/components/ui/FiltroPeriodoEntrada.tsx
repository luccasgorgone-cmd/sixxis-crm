"use client";

// Filtro de periodo por ENTRADA do atendimento (quando entrou). Dropdown compacto
// (uma linha, cabe em paineis estreitos ~383px), dark mode. Mapeia 1:1 aos params
// da API (?periodo=hoje|7d|15d|30d|custom + ?de=&ate=). Usado no Inbox e no Kanban.
import { useEffect, useRef, useState } from "react";
import { CalendarRange, ChevronDown, Check } from "lucide-react";
import { useClickFora } from "@/lib/useClickFora";

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
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickFora(() => setAberto(false), aberto, [ref]);

  useEffect(() => {
    if (!aberto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aberto]);

  const ativo = valor.periodo !== "";
  const rotulo = OPCOES.find((o) => o.v === valor.periodo)?.r ?? "Todos";

  function escolher(v: PeriodoEntrada["periodo"]) {
    if (v === "custom") {
      // Mantem aberto para revelar os campos de data; aplica com as duas datas.
      onChange({ ...valor, periodo: "custom" });
    } else {
      onChange({ periodo: v });
      setAberto(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((a) => !a)}
        className={`flex w-full items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
          ativo
            ? "border-tiffany/40 bg-tiffany/10 text-tiffany"
            : "border-black/10 bg-white text-medio/80 hover:bg-black/5 dark:bg-white/5"
        }`}
      >
        <CalendarRange className="h-4 w-4 shrink-0" />
        <span className="truncate">{rotulo}</span>
        {ativo && contador != null && (
          <span className="shrink-0 opacity-70">· {contador}</span>
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 transition-transform ${
            aberto ? "rotate-180" : ""
          }`}
        />
      </button>

      {aberto && (
        <div className="fade-in absolute left-0 top-full z-30 mt-1 min-w-[210px] overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-escuro">
          {OPCOES.map((o) => {
            const sel = valor.periodo === o.v;
            return (
              <button
                key={o.v || "todos"}
                onClick={() => escolher(o.v)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium transition-colors ${
                  sel
                    ? "bg-tiffany/10 text-tiffany"
                    : "text-medio/80 hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                {o.r}
                {sel && <Check className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}

          {valor.periodo === "custom" && (
            <div className="space-y-1.5 border-t border-black/5 p-2 dark:border-white/10">
              <label className="flex items-center gap-1.5">
                <span className="w-8 shrink-0 text-[11px] text-medio/50">De</span>
                <input
                  type="date"
                  value={valor.de ?? ""}
                  onChange={(e) => onChange({ ...valor, de: e.target.value })}
                  aria-label="Data inicial"
                  className="w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-xs text-escuro outline-none focus:border-tiffany dark:bg-white/5 dark:text-fundo"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="w-8 shrink-0 text-[11px] text-medio/50">Ate</span>
                <input
                  type="date"
                  value={valor.ate ?? ""}
                  onChange={(e) => onChange({ ...valor, ate: e.target.value })}
                  aria-label="Data final"
                  className="w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-xs text-escuro outline-none focus:border-tiffany dark:bg-white/5 dark:text-fundo"
                />
              </label>
            </div>
          )}

          {ativo && contador != null && (
            <div className="border-t border-black/5 px-3 py-1.5 text-[11px] text-medio/50 dark:border-white/10">
              {contador} {contador === 1 ? "atendimento" : "atendimentos"} no periodo
            </div>
          )}
        </div>
      )}
    </div>
  );
}
