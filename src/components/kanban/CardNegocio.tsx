"use client";

// Card do Kanban (negocio). Arrastavel via @dnd-kit. Mostra cliente, valor,
// etiquetas, temperatura, vendedor, tempo na etapa e origem.
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Clock } from "lucide-react";
import type { CardNegocio as Card } from "./tipos";
import { TEMPERATURA_INFO } from "./tipos";
import { AvatarCliente } from "@/components/AvatarCliente";
import {
  formatarBRL,
  tempoDesde,
  iniciais,
} from "@/lib/format";

export function CardNegocio({
  card,
  onAbrir,
  arrastando = false,
}: {
  card: Card;
  onAbrir?: (id: string) => void;
  arrastando?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: card.id, data: { etapaId: card.etapaId } });

  const temp = TEMPERATURA_INFO[card.temperatura];
  const nome = card.leadNome?.trim() || card.leadTelefone;

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onAbrir?.(card.id)}
      className={`group cursor-grab touch-none rounded-xl border border-black/5 bg-white p-3 shadow-sm transition-shadow active:cursor-grabbing ${
        arrastando ? "rotate-1 shadow-lg" : "hover:shadow-md"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <AvatarCliente
            nome={card.leadNome}
            telefone={card.leadTelefone}
            fotoUrl={card.leadFoto}
            tamanho={28}
          />
          <p className="min-w-0 truncate text-sm font-semibold text-escuro">
            {nome}
          </p>
        </div>
        <span
          title={temp.rotulo}
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${temp.ponto}`}
        />
      </div>

      {card.valor != null && (
        <p className="mb-2 text-sm font-semibold text-tiffany-escuro">
          {formatarBRL(card.valor)}
        </p>
      )}

      {card.etiquetas.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {card.etiquetas.slice(0, 4).map((e) => (
            <span
              key={e.id}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: e.cor }}
            >
              {e.nome}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-[11px] text-medio/60">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {tempoDesde(card.entrouEtapaEm)}
        </span>
        <div className="flex items-center gap-1.5">
          {card.origem && (
            <span className="rounded bg-fundo px-1.5 py-0.5">{card.origem}</span>
          )}
          {card.agente ? (
            <span
              title={card.agente.nome}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-medio/15 text-[9px] font-semibold text-medio"
            >
              {iniciais(card.agente.nome, "")}
            </span>
          ) : (
            <span
              title="Sem vendedor"
              className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-medio/30 text-[9px] text-medio/40"
            >
              ?
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
