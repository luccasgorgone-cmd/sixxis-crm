"use client";

// Editor reutilizavel de horario por dia da semana (com faixas inicio/fim).
// Usado no horario comercial e no horario proprio do Agente IA.
import { Plus, Trash2 } from "lucide-react";

export type Faixa = { inicio: string; fim: string };
export type DiaHorario = { dia: number; aberto: boolean; faixas: Faixa[] };

const NOMES = [
  "Domingo",
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sabado",
];

// Garante os 7 dias na ordem 0..6 (completa o que faltar).
export function ordenarDias(horarios: DiaHorario[]): DiaHorario[] {
  return Array.from({ length: 7 }, (_, dia) => {
    const existente = horarios.find((h) => h.dia === dia);
    return existente ?? { dia, aberto: false, faixas: [] };
  });
}

export function EditorHorarios({
  valor,
  onChange,
}: {
  valor: DiaHorario[];
  onChange: (h: DiaHorario[]) => void;
}) {
  const horarios = ordenarDias(valor);

  function setDia(dia: number, patch: Partial<DiaHorario>) {
    onChange(horarios.map((h) => (h.dia === dia ? { ...h, ...patch } : h)));
  }
  function setFaixa(dia: number, i: number, patch: Partial<Faixa>) {
    onChange(
      horarios.map((h) =>
        h.dia === dia
          ? { ...h, faixas: h.faixas.map((f, j) => (j === i ? { ...f, ...patch } : f)) }
          : h,
      ),
    );
  }
  function addFaixa(dia: number) {
    onChange(
      horarios.map((h) =>
        h.dia === dia
          ? { ...h, faixas: [...h.faixas, { inicio: "09:00", fim: "18:00" }] }
          : h,
      ),
    );
  }
  function rmFaixa(dia: number, i: number) {
    onChange(
      horarios.map((h) =>
        h.dia === dia ? { ...h, faixas: h.faixas.filter((_, j) => j !== i) } : h,
      ),
    );
  }

  return (
    <div className="space-y-2">
      {horarios.map((h) => (
        <div key={h.dia} className="rounded-xl border border-black/5 bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-escuro">{NOMES[h.dia]}</span>
            <label className="flex items-center gap-2 text-sm text-medio">
              <input
                type="checkbox"
                checked={h.aberto}
                onChange={(e) => setDia(h.dia, { aberto: e.target.checked })}
                className="h-4 w-4 accent-tiffany"
              />
              Ativo
            </label>
          </div>
          {h.aberto && (
            <div className="mt-2 space-y-2">
              {h.faixas.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={f.inicio}
                    onChange={(e) => setFaixa(h.dia, i, { inicio: e.target.value })}
                    className="rounded-lg border border-black/10 px-2 py-1 text-sm outline-none focus:border-tiffany"
                  />
                  <span className="text-medio/50">ate</span>
                  <input
                    type="time"
                    value={f.fim}
                    onChange={(e) => setFaixa(h.dia, i, { fim: e.target.value })}
                    className="rounded-lg border border-black/10 px-2 py-1 text-sm outline-none focus:border-tiffany"
                  />
                  <button
                    onClick={() => rmFaixa(h.dia, i)}
                    className="rounded-lg p-1 text-medio/50 hover:bg-black/5 hover:text-erro"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => addFaixa(h.dia)}
                className="flex items-center gap-1 text-xs font-medium text-tiffany hover:underline"
              >
                <Plus className="h-3 w-3" /> Adicionar faixa
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
