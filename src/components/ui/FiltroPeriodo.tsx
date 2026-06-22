"use client";

// Filtro de periodo reutilizavel: Diario / Semanal / 15 dias / 30 dias /
// Personalizado (intervalo). Os presets usam as mesmas chaves do backend
// (resolverPeriodo): hoje | semana | 15d | mes | custom.
import { CalendarRange } from "lucide-react";

export type PresetPeriodo = "hoje" | "semana" | "15d" | "mes" | "custom";

export type ValorPeriodo = {
  preset: PresetPeriodo;
  inicio?: string; // YYYY-MM-DD (apenas custom)
  fim?: string;
};

const PRESETS: { valor: PresetPeriodo; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Diario" },
  { valor: "semana", rotulo: "Semanal" },
  { valor: "15d", rotulo: "15 dias" },
  { valor: "mes", rotulo: "30 dias" },
  { valor: "custom", rotulo: "Personalizado" },
];

export function FiltroPeriodo({
  valor,
  onChange,
}: {
  valor: ValorPeriodo;
  onChange: (v: ValorPeriodo) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-lg border border-black/10 bg-white p-0.5">
        {PRESETS.map((p) => {
          const ativo = valor.preset === p.valor;
          return (
            <button
              key={p.valor}
              onClick={() => onChange({ ...valor, preset: p.valor })}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                ativo
                  ? "bg-tiffany text-white"
                  : "text-medio/70 hover:bg-black/5"
              }`}
            >
              {p.rotulo}
            </button>
          );
        })}
      </div>
      {valor.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <CalendarRange className="h-4 w-4 text-medio/50" />
          <input
            type="date"
            value={valor.inicio ?? ""}
            onChange={(e) => onChange({ ...valor, inicio: e.target.value })}
            aria-label="Data inicial"
            className="campo py-1.5 text-xs"
          />
          <span className="text-xs text-medio/50">ate</span>
          <input
            type="date"
            value={valor.fim ?? ""}
            onChange={(e) => onChange({ ...valor, fim: e.target.value })}
            aria-label="Data final"
            className="campo py-1.5 text-xs"
          />
        </div>
      )}
    </div>
  );
}
