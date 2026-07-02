// Legenda compacta de escala de cor: rotulo + barra de gradiente + rotulos das
// pontas (min/max). Reutilizavel em qualquer mapa/heatmap (Clima e Mapa). O
// gradiente deve bater com a escala usada para colorir (ver gradienteCss).
import type React from "react";

export function LegendaGradiente({
  rotulo,
  min,
  max,
  gradiente,
  icone,
}: {
  rotulo: string;
  min: string;
  max: string;
  gradiente: string;
  icone?: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center gap-1 text-[11px] text-medio/60">
        {icone}
        {rotulo}
      </div>
      <div
        className="h-2.5 w-full rounded-full"
        style={{ background: gradiente }}
        aria-hidden
      />
      <div className="mt-0.5 flex justify-between text-[11px] text-medio/50">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
