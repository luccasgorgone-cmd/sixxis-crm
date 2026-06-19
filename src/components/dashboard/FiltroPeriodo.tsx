"use client";

// Filtro de periodo reutilizavel: Hoje | Semana | 15 dias | Mes | Customizado.
import { useState } from "react";
import { Calendar } from "lucide-react";
import type { FiltroValor } from "./tipos";

const PRESETS: { chave: string; rotulo: string }[] = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "semana", rotulo: "Semana" },
  { chave: "15d", rotulo: "15 dias" },
  { chave: "mes", rotulo: "Mes" },
];

export function FiltroPeriodo({
  valor,
  onChange,
}: {
  valor: FiltroValor;
  onChange: (v: FiltroValor) => void;
}) {
  const presetAtivo = "periodo" in valor ? valor.periodo : "custom";
  const [inicio, setInicio] = useState(
    "inicio" in valor ? valor.inicio : "",
  );
  const [fim, setFim] = useState("fim" in valor ? valor.fim : "");
  const [mostrarCustom, setMostrarCustom] = useState(presetAtivo === "custom");

  function aplicarCustom() {
    if (inicio && fim) {
      onChange({ inicio: `${inicio}T00:00:00`, fim: `${fim}T23:59:59` });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-lg border border-black/10">
        {PRESETS.map((p) => (
          <button
            key={p.chave}
            onClick={() => {
              setMostrarCustom(false);
              onChange({ periodo: p.chave });
            }}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              presetAtivo === p.chave && !mostrarCustom
                ? "bg-tiffany text-white"
                : "bg-white text-medio hover:bg-black/5"
            }`}
          >
            {p.rotulo}
          </button>
        ))}
        <button
          onClick={() => setMostrarCustom(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
            mostrarCustom
              ? "bg-tiffany text-white"
              : "bg-white text-medio hover:bg-black/5"
          }`}
        >
          <Calendar className="h-3.5 w-3.5" /> Customizado
        </button>
      </div>

      {mostrarCustom && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-tiffany"
          />
          <span className="text-medio/50">ate</span>
          <input
            type="date"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-tiffany"
          />
          <button
            onClick={aplicarCustom}
            disabled={!inicio || !fim}
            className="rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
