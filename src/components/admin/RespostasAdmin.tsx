"use client";

// Admin > Respostas rapidas: CRUD + reordenar (drag). Modal para titulo, atalho,
// texto e ativo.
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
import { Plus, GripVertical, Trash2, Pencil, X, Loader2 } from "lucide-react";
import { Cabecalho, SkeletonTabela, CampoTexto } from "./VendedoresAdmin";

type Resposta = {
  id: string;
  titulo: string;
  atalho: string | null;
  texto: string;
  ativo: boolean;
  ordem: number;
};

export function RespostasAdmin() {
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<Resposta | null>(null);
  const [criando, setCriando] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const carregar = useCallback(async () => {
    const r = await fetch("/api/admin/respostas");
    if (r.ok) setRespostas((await r.json()).respostas);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/admin/respostas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await carregar();
  }

  async function remover(id: string) {
    await fetch(`/api/admin/respostas/${id}`, { method: "DELETE" });
    await carregar();
  }

  async function aoFinalizar(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = respostas.map((x) => x.id);
    const novo = arrayMove(
      respostas,
      ids.indexOf(String(active.id)),
      ids.indexOf(String(over.id)),
    );
    setRespostas(novo);
    await fetch("/api/admin/respostas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordem: novo.map((x) => x.id) }),
    });
  }

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Respostas rapidas"
        subtitulo="Atalhos de mensagem usados no inbox (digite / no compositor)"
        acao={
          <button
            onClick={() => setCriando(true)}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro"
          >
            <Plus className="h-4 w-4" /> Nova resposta
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
            items={respostas.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {respostas.map((r) => (
                <Linha
                  key={r.id}
                  resposta={r}
                  onAtivo={() => void patch(r.id, { ativo: !r.ativo })}
                  onEditar={() => setEditando(r)}
                  onRemover={() => void remover(r.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {(criando || editando) && (
        <Modal
          resposta={editando}
          onFechar={() => {
            setCriando(false);
            setEditando(null);
          }}
          onSalvo={async () => {
            setCriando(false);
            setEditando(null);
            await carregar();
          }}
        />
      )}
    </div>
  );
}

function Linha({
  resposta,
  onAtivo,
  onEditar,
  onRemover,
}: {
  resposta: Resposta;
  onAtivo: () => void;
  onEditar: () => void;
  onRemover: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: resposta.id });
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
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-escuro">{resposta.titulo}</p>
          {resposta.atalho && (
            <span className="rounded bg-tiffany/10 px-1.5 py-0.5 text-[10px] font-medium text-tiffany">
              {resposta.atalho}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-medio/60">{resposta.texto}</p>
      </div>
      <button
        onClick={onAtivo}
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          resposta.ativo
            ? "bg-green-100 text-green-700"
            : "bg-black/10 text-medio/60"
        }`}
      >
        {resposta.ativo ? "Ativa" : "Inativa"}
      </button>
      <button
        onClick={onEditar}
        className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        onClick={onRemover}
        className="rounded-lg p-1.5 text-medio/50 hover:bg-black/5 hover:text-erro"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function Modal({
  resposta,
  onFechar,
  onSalvo,
}: {
  resposta: Resposta | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const edicao = Boolean(resposta);
  const [titulo, setTitulo] = useState(resposta?.titulo ?? "");
  const [atalho, setAtalho] = useState(resposta?.atalho ?? "");
  const [texto, setTexto] = useState(resposta?.texto ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setErro(null);
    if (!titulo.trim() || !texto.trim()) {
      setErro("Preencha titulo e texto.");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch(
        edicao ? `/api/admin/respostas/${resposta!.id}` : "/api/admin/respostas",
        {
          method: edicao ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ titulo, atalho, texto }),
        },
      );
      if (!r.ok) {
        setErro("Nao foi possivel salvar.");
        setSalvando(false);
        return;
      }
      onSalvo();
    } catch {
      setErro("Falha ao salvar.");
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-escuro">
            {edicao ? "Editar resposta" : "Nova resposta"}
          </h3>
          <button
            onClick={onFechar}
            className="rounded-lg p-1 text-medio/60 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <CampoTexto rotulo="Titulo" valor={titulo} onChange={setTitulo} />
          <CampoTexto
            rotulo="Atalho (ex.: /saudacao)"
            valor={atalho}
            onChange={setAtalho}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-escuro">
              Texto
            </label>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </div>
        </div>
        {erro && <p className="mt-3 text-xs text-erro">{erro}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onFechar}
            className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={() => void salvar()}
            disabled={salvando}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
