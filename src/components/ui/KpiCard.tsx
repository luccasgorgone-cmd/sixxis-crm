"use client";

// Cartao de KPI reutilizavel: rotulo, valor, detalhe/delta, icone e mini-spark
// opcional (recharts). Cores da marca. Clicavel quando onClick e passado.
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import type { LucideIcon } from "lucide-react";

export function KpiCard({
  rotulo,
  valor,
  detalhe,
  delta,
  icone: Icone,
  cor = "text-tiffany-escuro",
  fundo = "bg-tiffany/10",
  spark,
  onClick,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  // delta opcional: positivo verde, negativo vermelho.
  delta?: number;
  icone?: LucideIcon;
  cor?: string;
  fundo?: string;
  spark?: number[];
  onClick?: () => void;
}) {
  const clicavel = Boolean(onClick);
  const sparkData = (spark ?? []).map((v, i) => ({ i, v }));
  return (
    <button
      onClick={onClick}
      disabled={!clicavel}
      aria-label={clicavel ? `${rotulo}: ${valor}` : undefined}
      className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border border-black/5 bg-white p-4 text-left transition-all ${
        clicavel ? "hover:-translate-y-0.5 hover:shadow-md" : "cursor-default"
      }`}
    >
      {Icone && (
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${fundo} ${cor}`}
        >
          <Icone className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-2xl font-semibold leading-none text-escuro" title={valor}>{valor}</p>
        <p className="mt-1 truncate text-xs text-medio/60">{rotulo}</p>
        <div className="flex items-center gap-1.5">
          {detalhe && <p className="truncate text-[11px] text-medio/50">{detalhe}</p>}
          {delta !== undefined && delta !== 0 && (
            <span
              className={`text-[11px] font-semibold ${
                delta > 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {delta > 0 ? "+" : ""}
              {delta}%
            </span>
          )}
        </div>
      </div>
      {sparkData.length > 1 && (
        <div className="h-10 w-16 shrink-0 self-end opacity-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
              <Area
                type="monotone"
                dataKey="v"
                stroke="#3cbfb3"
                strokeWidth={1.5}
                fill="#3cbfb3"
                fillOpacity={0.15}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </button>
  );
}
