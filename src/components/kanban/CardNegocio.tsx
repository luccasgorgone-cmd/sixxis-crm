"use client";

// Card do Kanban (negocio). Arrastavel via @dnd-kit. Mostra cliente (avatar),
// valor, etiquetas, temperatura, dono (avatar) e tempo na etapa. Acento lateral
// pela finalidade; badge de finalidade para o admin.
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Clock, UserPlus, BellRing, ShieldCheck, ShieldOff } from "lucide-react";
import type { CardNegocio as Card } from "./tipos";
import { AvatarCliente } from "@/components/AvatarCliente";
import { BadgeTemperatura } from "@/components/BadgeTemperatura";
import { BadgeFinalidade, corFinalidade } from "@/components/BadgeFinalidade";
import { BadgePendente } from "@/components/badges";
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
  // Pos-venda nao usa temperatura; usa garantia (marcador colorido). Venda mantem
  // a temperatura como sempre.
  const ehPosVenda = card.finalidade === "POS_VENDA";

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
      {/* cabecalho */}
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
        {ehPosVenda ? (
          <GarantiaMarcador garantia={card.garantia} />
        ) : (
          <BadgeTemperatura
            temperatura={card.temperatura}
            variante="ponto"
            className="mt-1.5"
          />
        )}
      </div>

      {card.valor != null && (
        <p className="mb-2 text-sm font-semibold text-tiffany-escuro">
          {formatarBRL(card.valor)}
        </p>
      )}

      {card.pendente && (
        <div className="mb-2">
          <BadgePendente motivo={card.motivoPendenciaLabel ?? card.motivoPendencia} />
        </div>
      )}

      {(card.alertasSla ?? 0) > 0 && (
        <div className="mb-2">
          <span
            title="Negocio parado alem do tempo (SLA)"
            className="inline-flex animate-pulse items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700"
          >
            <BellRing className="h-3 w-3" /> Alerta de tempo
            {(card.alertasSla ?? 0) > 1 ? ` (${card.alertasSla})` : ""}
          </span>
        </div>
      )}

      {card.status === "PERDIDO" && card.motivoPerdaLabel && (
        <p
          title={card.motivoPerdaObs ?? undefined}
          className="mb-2 truncate rounded-md bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700"
        >
          Perdido: {card.motivoPerdaLabel}
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

// Marcador de garantia no card de pos-venda: verde (com), ambar (sem), cinza
// (a definir). Compacto (so o icone com cor + tooltip).
function GarantiaMarcador({ garantia }: { garantia: boolean | null }) {
  if (garantia === true) {
    return (
      <span title="Com garantia" className="mt-1 shrink-0 text-green-600">
        <ShieldCheck className="h-4 w-4" />
      </span>
    );
  }
  if (garantia === false) {
    return (
      <span title="Sem garantia" className="mt-1 shrink-0 text-amber-600">
        <ShieldOff className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span title="Garantia a definir" className="mt-1 shrink-0 text-medio/40">
      <ShieldOff className="h-4 w-4" />
    </span>
  );
}
