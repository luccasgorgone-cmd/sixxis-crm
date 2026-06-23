"use client";

// Admin > Empresas faturadas: CRUD + reordenar (drag). Edicao inline do nome,
// ativar/desativar. Remocao so quando nenhum cliente usa a empresa (senao
// sugere desativar). Espelha o padrao de Etapas/Etiquetas.
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
import { Plus, GripVertical, Trash2, Building2 } from "lucide-react";
import { Cabecalho, SkeletonTabela } from "./VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";

type Empresa = {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
  usos: number;
};

export function EmpresasFaturadasAdmin() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [criando, setCriando] = useState(false);
  const toast = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/empresas-faturadas");
      if (r.ok) {
        setEmpresas((await r.json()).empresas);
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
    const r = await fetch(`/api/admin/empresas-faturadas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      toast.sucesso("Empresa atualizada");
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel salvar.");
      await carregar();
    }
  }

  function atualizarLocal(id: string, campos: Partial<Empresa>) {
    setEmpresas((prev) => prev.map((e) => (e.id === id ? { ...e, ...campos } : e)));
  }

  async function criar() {
    setCriando(true);
    try {
      const r = await fetch("/api/admin/empresas-faturadas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: "Nova empresa" }),
      });
      if (r.ok) {
        toast.sucesso("Empresa criada");
        await carregar();
      } else {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel criar.");
      }
    } finally {
      setCriando(false);
    }
  }

  async function remover(id: string) {
    const r = await fetch(`/api/admin/empresas-faturadas/${id}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel remover.");
      return;
    }
    toast.sucesso("Empresa removida");
    await carregar();
  }

  async function aoFinalizar(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = empresas.map((x) => x.id);
    const novo = arrayMove(
      empresas,
      ids.indexOf(String(active.id)),
      ids.indexOf(String(over.id)),
    );
    setEmpresas(novo);
    const r = await fetch("/api/admin/empresas-faturadas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordem: novo.map((x) => x.id) }),
    });
    if (r.ok) {
      toast.sucesso("Ordem atualizada");
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel reordenar.");
      await carregar();
    }
  }

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Empresas faturadas"
        subtitulo="Empresas que emitem a nota fiscal. Arraste para reordenar; desative as que nao usar mais."
        acao={
          <button
            onClick={() => void criar()}
            disabled={criando}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            <Plus className="h-4 w-4" /> Nova empresa
          </button>
        }
      />

      {carregando ? (
        <SkeletonTabela />
      ) : erro ? (
        <EstadoErro
          mensagem="Nao foi possivel carregar."
          onRetry={() => void carregar()}
        />
      ) : empresas.length === 0 ? (
        <EmptyState
          icone={Building2}
          titulo="Nenhuma empresa faturada"
          texto="Crie a primeira empresa para usar no acompanhamento dos clientes."
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={aoFinalizar}
        >
          <SortableContext
            items={empresas.map((e) => e.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {empresas.map((empresa) => (
                <LinhaEmpresa
                  key={empresa.id}
                  empresa={empresa}
                  onCampo={(campos) => {
                    atualizarLocal(empresa.id, campos);
                    void patch(empresa.id, campos);
                  }}
                  onRemover={() => void remover(empresa.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function LinhaEmpresa({
  empresa,
  onCampo,
  onRemover,
}: {
  empresa: Empresa;
  onCampo: (campos: Partial<Empresa>) => void;
  onRemover: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: empresa.id });
  const [nome, setNome] = useState(empresa.nome);
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
        aria-label="Reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-tiffany/10 text-tiffany">
        <Building2 className="h-4 w-4" />
      </span>

      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onBlur={() => {
          if (nome.trim() && nome !== empresa.nome) onCampo({ nome: nome.trim() });
          else if (!nome.trim()) setNome(empresa.nome);
        }}
        className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1.5 text-sm font-medium text-escuro outline-none hover:border-black/10 focus:border-tiffany"
      />

      <button
        onClick={() => onCampo({ ativo: !empresa.ativo })}
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          empresa.ativo
            ? "bg-green-100 text-green-700"
            : "bg-black/10 text-medio/60"
        }`}
      >
        {empresa.ativo ? "Ativa" : "Inativa"}
      </button>

      <span className="hidden w-20 text-right text-xs text-medio/50 sm:inline">
        {empresa.usos} cliente{empresa.usos === 1 ? "" : "s"}
      </span>

      <button
        onClick={onRemover}
        className="rounded-lg p-1.5 text-medio/50 hover:bg-black/5 hover:text-erro"
        aria-label="Remover"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
