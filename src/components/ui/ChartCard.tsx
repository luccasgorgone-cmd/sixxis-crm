"use client";

// Cartao de grafico: titulo + acoes (slot direito) + corpo. Padroniza o visual
// dos blocos de grafico em todas as telas.
import type { ReactNode } from "react";

export function ChartCard({
  titulo,
  subtitulo,
  acoes,
  children,
  className = "",
}: {
  titulo: string;
  subtitulo?: string;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-black/5 bg-white p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-escuro">{titulo}</h3>
          {subtitulo && <p className="text-xs text-medio/60">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}
