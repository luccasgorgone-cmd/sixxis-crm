"use client";

// Card do Kanban (negocio). Arrastavel via @dnd-kit. Mostra cliente (avatar),
// valor, etiquetas, temperatura, dono (avatar) e tempo na etapa. Acento lateral
// pela finalidade; badge de finalidade para o admin.
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Clock, UserPlus } from "lucide-react";
import type { CardNegocio as Card } from "./tipos";
import { AvatarCliente } from "@/components/AvatarCliente";
import { BadgeTemperatura } from "@/components/BadgeTemperatura";
import { BadgeFinalidade, corFinalidade } from "@/components/BadgeFinalidade";
import { formatarBRL, tempoDesde } from "@/lib/format";

export function CardNegocio({
  card,
  onAbrir,
  arrastando = false,
  mostrarFinalidade = false,
  ehAdmin = false,
  onAssumir,
  onAtribuir,
}: {
  card: Card;
  onAbrir?: (id: string) => void;
  arrastando?: boolean;
  mostrarFinalidade?: boolean;
  ehAdmin?: boolean;
  onAssumir?: (negocioId: string) => void;
  onAtribuir?: (card: Card) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: card.id, data: { etapaId: card.etapaId } });

  const nome = card.leadNome?.trim() || card.leadTelefone;
  const cor = corFinalidade(card.finalidade);

  const style = {
    borderLeftColor: cor.hex,
    ...(transform ? { transform: CSS.Translate.toString(transform) } : {}),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onAbrir?.(card.id)}
      className={`group cursor-grab touch-none rounded-xl border border-l-[3px] border-black/5 bg-white p-3 shadow-sm transition-all active:cursor-grabbing ${
        arrastando ? "rotate-1 shadow-lg" : "hover:-translate-y-0.5 hover:shadow-md"
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
        <BadgeTemperatura
          temperatura={card.temperatura}
          variante="ponto"
          className="mt-1.5"
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
          {mostrarFinalidade && <BadgeFinalidade finalidade={card.finalidade} />}
          {card.origem && (
            <span className="rounded bg-fundo px-1.5 py-0.5">{card.origem}</span>
          )}
          {card.agente ? (
            <span title={`Dono: ${card.agente.nome}`}>
              <AvatarCliente
                nome={card.agente.nome}
                telefone=""
                fotoUrl={card.agente.avatarUrl}
                tamanho={22}
              />
            </span>
          ) : ehAdmin && onAtribuir ? (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onAtribuir(card);
              }}
              title="Atribuir a um colaborador"
              className="flex items-center gap-1 rounded-full border border-dashed border-medio/30 px-2 py-0.5 text-[10px] font-medium text-medio/70 transition-colors hover:border-tiffany hover:text-tiffany"
            >
              <UserPlus className="h-3 w-3" /> Atribuir
            </button>
          ) : onAssumir ? (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onAssumir(card.id);
              }}
              title="Assumir este cliente"
              className="flex items-center gap-1 rounded-full bg-tiffany/10 px-2 py-0.5 text-[10px] font-semibold text-tiffany transition-colors hover:bg-tiffany/20"
            >
              <UserPlus className="h-3 w-3" /> Assumir
            </button>
          ) : (
            <span
              title="Sem dono"
              className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-dashed border-medio/30 text-medio/40"
            >
              <UserPlus className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
