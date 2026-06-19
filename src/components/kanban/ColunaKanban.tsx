"use client";

// Coluna do Kanban = uma etapa. Area de soltar (droppable) com header colorido,
// contagem e soma de valor.
import { useDroppable } from "@dnd-kit/core";
import type { Etapa, CardNegocio as Card } from "./tipos";
import { CardNegocio } from "./CardNegocio";
import { formatarBRL } from "@/lib/format";

export function ColunaKanban({
  etapa,
  cards,
  onAbrir,
}: {
  etapa: Etapa;
  cards: Card[];
  onAbrir: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  const soma = cards.reduce((acc, c) => acc + (c.valor ?? 0), 0);

  return (
    <div className="flex h-full w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: etapa.cor }}
          />
          <h2 className="truncate text-sm font-semibold text-escuro">
            {etapa.nome}
          </h2>
          <span className="shrink-0 rounded-full bg-black/5 px-1.5 text-xs text-medio/70">
            {cards.length}
          </span>
        </div>
        {soma > 0 && (
          <span className="shrink-0 text-xs font-medium text-medio/60">
            {formatarBRL(soma)}
          </span>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={`scroll-fino flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl p-2 transition-colors ${
          isOver ? "bg-tiffany/10 ring-2 ring-tiffany/30" : "bg-black/[0.02]"
        }`}
      >
        {cards.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-medio/40">
            Vazio
          </p>
        ) : (
          cards.map((c) => (
            <CardNegocio key={c.id} card={c} onAbrir={onAbrir} />
          ))
        )}
      </div>
    </div>
  );
}
