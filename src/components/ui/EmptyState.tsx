"use client";

// Estado vazio elegante e reutilizavel: icone, titulo, texto e acao opcional.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icone: Icone,
  titulo,
  texto,
  acao,
  className = "",
}: {
  icone: LucideIcon;
  titulo: string;
  texto?: string;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/10 bg-white py-12 text-center ${className}`}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-tiffany/10">
        <Icone className="h-5 w-5 text-tiffany" />
      </div>
      <p className="text-sm font-medium text-escuro">{titulo}</p>
      {texto && <p className="max-w-xs text-xs text-medio/60">{texto}</p>}
      {acao && <div className="mt-1">{acao}</div>}
    </div>
  );
}
