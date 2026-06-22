"use client";

// Admin > Etiquetas: CRUD (nome, cor). Edicao inline; remocao desvincula leads.
import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Cabecalho, SkeletonTabela } from "./VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";

type Finalidade = "VENDA" | "POS_VENDA";
type Etiqueta = {
  id: string;
  nome: string;
  cor: string;
  finalidade: Finalidade | null;
  usos: number;
};

export function EtiquetasAdmin() {
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const toast = useToast();

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/etiquetas");
      if (r.ok) {
        setEtiquetas((await r.json()).etiquetas);
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
    const r = await fetch(`/api/admin/etiquetas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      toast.sucesso("Etiqueta atualizada");
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel salvar.");
    }
  }

  async function criar() {
    const r = await fetch("/api/admin/etiquetas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: "Nova etiqueta" }),
    });
    if (r.ok) {
      toast.sucesso("Etiqueta criada");
      await carregar();
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel criar.");
    }
  }

  async function remover(id: string) {
    const r = await fetch(`/api/admin/etiquetas/${id}`, { method: "DELETE" });
    if (r.ok) {
      toast.sucesso("Etiqueta removida");
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel remover.");
    }
    await carregar();
  }

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Etiquetas"
        subtitulo="Marcadores aplicaveis aos clientes, organizados por finalidade"
        acao={
          <button
            onClick={() => void criar()}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro"
          >
            <Plus className="h-4 w-4" /> Nova etiqueta
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
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {etiquetas.map((e) => (
            <LinhaEtiqueta
              key={e.id}
              etiqueta={e}
              onCampo={(c) => void patch(e.id, c)}
              onRemover={() => void remover(e.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LinhaEtiqueta({
  etiqueta,
  onCampo,
  onRemover,
}: {
  etiqueta: Etiqueta;
  onCampo: (c: Record<string, unknown>) => void;
  onRemover: () => void;
}) {
  const [nome, setNome] = useState(etiqueta.nome);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3">
      <input
        type="color"
        defaultValue={etiqueta.cor}
        onChange={(e) => onCampo({ cor: e.target.value })}
        className="h-7 w-9 shrink-0 cursor-pointer rounded border border-black/10 bg-white"
      />
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onBlur={() => {
          if (nome.trim() && nome !== etiqueta.nome) onCampo({ nome: nome.trim() });
        }}
        className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1.5 text-sm font-medium text-escuro outline-none hover:border-black/10 focus:border-tiffany"
      />
      <select
        value={etiqueta.finalidade ?? "AMBAS"}
        onChange={(e) =>
          onCampo({
            finalidade: e.target.value === "AMBAS" ? null : e.target.value,
          })
        }
        title="Finalidade da etiqueta"
        className="shrink-0 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs font-medium text-medio outline-none focus:border-tiffany"
      >
        <option value="VENDA">Venda</option>
        <option value="POS_VENDA">Pos-venda</option>
        <option value="AMBAS">Ambas</option>
      </select>
      <span className="hidden shrink-0 text-xs text-medio/50 sm:inline">
        {etiqueta.usos} usos
      </span>
      <button
        onClick={onRemover}
        className="shrink-0 rounded-lg p-1.5 text-medio/50 hover:bg-black/5 hover:text-erro"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
