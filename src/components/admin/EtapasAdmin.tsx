"use client";

// Admin > Etapas: CRUD + reordenar (drag). Edicao inline (nome, cor, tipo,
// ativo). Remocao so quando a etapa nao tem negocios.
import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, GripVertical, Trash2 } from "lucide-react";
import { Cabecalho, SkeletonTabela } from "./VendedoresAdmin";

type Etapa = {
  id: string;
  nome: string;
  cor: string;
  tipo: string;
  finalidade: string;
  ordem: number;
  ativo: boolean;
  negocios: number;
};

const TIPOS = ["ABERTA", "GANHO", "PERDIDO"];
const FINALIDADES = ["VENDA", "POS_VENDA", "AMBAS"];
const ROTULO_FIN: Record<string, string> = {
  VENDA: "Venda",
  POS_VENDA: "Pos-venda",
  AMBAS: "Ambas",
};

export function EtapasAdmin() {
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const carregar = useCallback(async () => {
    const r = await fetch("/api/admin/etapas");
    if (r.ok) setEtapas((await r.json()).etapas);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/admin/etapas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function atualizarLocal(id: string, campos: Partial<Etapa>) {
    setEtapas((prev) => prev.map((e) => (e.id === id ? { ...e, ...campos } : e)));
  }

  async function criar() {
    const r = await fetch("/api/admin/etapas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: "Nova etapa" }),
    });
    if (r.ok) await carregar();
  }

  async function remover(id: string) {
    const r = await fetch(`/api/admin/etapas/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => null);
      alert(d?.erro ?? "Nao foi possivel remover.");
      return;
    }
    await carregar();
  }

  async function aoFinalizar(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = etapas.map((x) => x.id);
    const novo = arrayMove(
      etapas,
      ids.indexOf(String(active.id)),
      ids.indexOf(String(over.id)),
    );
    setEtapas(novo);
    await fetch("/api/admin/etapas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordem: novo.map((x) => x.id) }),
    });
  }

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Etapas do funil"
        subtitulo="Arraste para reordenar. Cor e tipo definem o comportamento no Kanban."
        acao={
          <button
            onClick={() => void criar()}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro"
          >
            <Plus className="h-4 w-4" /> Nova etapa
          </button>
        }
      />

      {carregando ? (
        <SkeletonTabela />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={aoFinalizar}
        >
          <SortableContext
            items={etapas.map((e) => e.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {etapas.map((etapa) => (
                <LinhaEtapa
                  key={etapa.id}
                  etapa={etapa}
                  onCampo={(campos) => {
                    atualizarLocal(etapa.id, campos);
                    void patch(etapa.id, campos);
                  }}
                  onRemover={() => void remover(etapa.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function LinhaEtapa({
  etapa,
  onCampo,
  onRemover,
}: {
  etapa: Etapa;
  onCampo: (campos: Partial<Etapa>) => void;
  onRemover: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: etapa.id });
  const [nome, setNome] = useState(etapa.nome);
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-medio/40 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <input
        type="color"
        value={etapa.cor}
        onChange={(e) => onCampo({ cor: e.target.value })}
        className="h-7 w-9 shrink-0 cursor-pointer rounded border border-black/10 bg-white"
      />

      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onBlur={() => {
          if (nome.trim() && nome !== etapa.nome) onCampo({ nome: nome.trim() });
        }}
        className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1.5 text-sm font-medium text-escuro outline-none hover:border-black/10 focus:border-tiffany"
      />

      <select
        value={etapa.finalidade}
        onChange={(e) => onCampo({ finalidade: e.target.value })}
        className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-tiffany"
      >
        {FINALIDADES.map((f) => (
          <option key={f} value={f}>
            {ROTULO_FIN[f]}
          </option>
        ))}
      </select>

      <select
        value={etapa.tipo}
        onChange={(e) => onCampo({ tipo: e.target.value })}
        className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-tiffany"
      >
        {TIPOS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <button
        onClick={() => onCampo({ ativo: !etapa.ativo })}
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          etapa.ativo
            ? "bg-green-100 text-green-700"
            : "bg-black/10 text-medio/60"
        }`}
      >
        {etapa.ativo ? "Ativa" : "Inativa"}
      </button>

      <span className="w-16 text-right text-xs text-medio/50">
        {etapa.negocios} neg.
      </span>

      <button
        onClick={onRemover}
        className="rounded-lg p-1.5 text-medio/50 hover:bg-black/5 hover:text-erro"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
