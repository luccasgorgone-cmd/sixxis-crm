// Cartao de metrica: numero grande, rotulo e detalhe opcional.
import type { LucideIcon } from "lucide-react";

export function Cartao({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  destaque = false,
}: {
  rotulo: string;
  valor: string | number;
  detalhe?: string;
  icone?: LucideIcon;
  destaque?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border p-4 ${
        destaque
          ? "border-tiffany/30 bg-tiffany/5"
          : "border-black/5 bg-white"
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-medio/50" title={rotulo}>
          {rotulo}
        </p>
        {Icone && <Icone className="h-4 w-4 shrink-0 text-tiffany" />}
      </div>
      <p className="truncate text-2xl font-semibold text-escuro" title={String(valor)}>{valor}</p>
      {detalhe && <p className="mt-0.5 truncate text-xs text-medio/60" title={detalhe}>{detalhe}</p>}
    </div>
  );
}

export function CartaoSkeleton() {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-4">
      <div className="skeleton mb-2 h-3 w-20" />
      <div className="skeleton h-7 w-16" />
    </div>
  );
}
