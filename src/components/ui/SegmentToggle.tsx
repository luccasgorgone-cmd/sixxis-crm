"use client";

// Alternador segmentado reutilizavel (ex.: grafico/tabela, formato de visao).
// Cores da marca; acessivel (aria-pressed).
import type { LucideIcon } from "lucide-react";

export type OpcaoSegmento<T extends string> = {
  valor: T;
  rotulo?: string;
  icone?: LucideIcon;
  titulo?: string; // aria-label / title quando so icone
};

export function SegmentToggle<T extends string>({
  opcoes,
  valor,
  onChange,
  tamanho = "md",
}: {
  opcoes: OpcaoSegmento<T>[];
  valor: T;
  onChange: (v: T) => void;
  tamanho?: "sm" | "md";
}) {
  const pad = tamanho === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <div className="inline-flex items-center rounded-lg border border-black/10 bg-white p-0.5">
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        const Icone = o.icone;
        return (
          <button
            key={o.valor}
            onClick={() => onChange(o.valor)}
            aria-pressed={ativo}
            aria-label={o.titulo ?? o.rotulo}
            title={o.titulo ?? o.rotulo}
            className={`flex items-center gap-1.5 rounded-md font-medium transition-colors ${pad} ${
              ativo ? "bg-tiffany text-white" : "text-medio/70 hover:bg-black/5"
            }`}
          >
            {Icone && <Icone className="h-4 w-4" />}
            {o.rotulo && <span>{o.rotulo}</span>}
          </button>
        );
      })}
    </div>
  );
}
