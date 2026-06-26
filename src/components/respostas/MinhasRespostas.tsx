"use client";

// "Minhas mensagens rapidas": o atendente cria/edita/exclui e REORDENA (drag) as
// proprias respostas rapidas. As de sistema (do admin) nao aparecem aqui — sao
// somente para uso, geridas em /admin/respostas.
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
import { Cabecalho, SkeletonTabela, CampoTexto } from "@/components/admin/VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";
import { BadgeFinalidade } from "@/components/BadgeFinalidade";

type Resposta = {
  id: string;
  titulo: string;
  atalho: string | null;
  texto: string;
  ativo: boolean;
  ordem: number;
  finalidade: "VENDA" | "POS_VENDA" | null;
};

export function MinhasRespostas() {
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [editando, setEditando] = useState<Resposta | null>(null);
  const [criando, setCriando] = useState(false);
  const toast = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/minhas-respostas");
      if (r.ok) {
        setRespostas((await r.json()).respostas);
        setErro(false);
      } else {
        setErro(true);
      }
    } catch {
      setErro(true);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function patch(id: string, body: Record<string, unknown>) {
    const r = await fetch(`/api/minhas-respostas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) toast.sucesso("Resposta atualizada");
    else toast.erro("Nao foi possivel salvar.");
    await carregar();
  }

  async function remover(id: string) {
    const r = await fetch(`/api/minhas-respostas/${id}`, { method: "DELETE" });
    if (r.ok) toast.sucesso("Resposta removida");
    else toast.erro("Nao foi possivel remover.");
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
    const r = await fetch("/api/minhas-respostas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordem: novo.map((x) => x.id) }),
    });
    if (r.ok) toast.sucesso("Ordem atualizada");
    else toast.erro("Nao foi possivel reordenar.");
  }

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Minhas mensagens rapidas"
        subtitulo="Suas respostas pessoais (use / no inbox). Arraste para reordenar; aparecem antes das de sistema."
        acao={
          <button
            onClick={() => setCriando(true)}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro"
          >
            <Plus className="h-4 w-4" /> Nova
          </button>
        }
      />

      {carregando ? (
        <SkeletonTabela />
      ) : erro ? (
        <EstadoErro mensagem="Nao foi possivel carregar." onRetry={() => void carregar()} />
      ) : respostas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/10 p-8 text-center text-sm text-medio/60">
          Voce ainda nao tem mensagens rapidas pessoais. Crie a primeira.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={aoFinalizar}>
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
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: resposta.id,
  });
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
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-escuro">{resposta.titulo}</p>
          {resposta.finalidade ? (
            <BadgeFinalidade finalidade={resposta.finalidade} />
          ) : (
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-medio/60">
              Ambas
            </span>
          )}
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
          resposta.ativo ? "bg-green-100 text-green-700" : "bg-black/10 text-medio/60"
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
  const [finalidade, setFinalidade] = useState<string>(resposta?.finalidade ?? "AMBAS");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const toast = useToast();

  async function salvar() {
    setErro(null);
    if (!titulo.trim() || !texto.trim()) {
      setErro("Preencha titulo e texto.");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch(
        edicao ? `/api/minhas-respostas/${resposta!.id}` : "/api/minhas-respostas",
        {
          method: edicao ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo,
            atalho,
            texto,
            finalidade: finalidade === "AMBAS" ? null : finalidade,
          }),
        },
      );
      if (!r.ok) {
        setErro("Nao foi possivel salvar.");
        setSalvando(false);
        return;
      }
      toast.sucesso("Mensagem salva");
      onSalvo();
    } catch {
      setErro("Falha ao salvar.");
      setSalvando(false);
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in scroll-fino max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-escuro">
            {edicao ? "Editar mensagem" : "Nova mensagem"}
          </h3>
          <button onClick={onFechar} className="rounded-lg p-1 text-medio/60 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <CampoTexto rotulo="Titulo" valor={titulo} onChange={setTitulo} />
          <div>
            <label className="mb-1 block text-sm font-medium text-escuro">Finalidade</label>
            <select
              value={finalidade}
              onChange={(e) => setFinalidade(e.target.value)}
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            >
              <option value="VENDA">Venda</option>
              <option value="POS_VENDA">Pos-venda</option>
              <option value="AMBAS">Ambas</option>
            </select>
          </div>
          <CampoTexto rotulo="Atalho (ex.: /saudacao)" valor={atalho} onChange={setAtalho} />
          <div>
            <label className="mb-1 block text-sm font-medium text-escuro">Texto</label>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={5}
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
