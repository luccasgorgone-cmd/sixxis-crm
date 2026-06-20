"use client";

// Admin > Observacoes pre-definidas: CRUD (texto, ordem, ativo).
import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Cabecalho, SkeletonTabela } from "./VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";

type Preset = {
  id: string;
  texto: string;
  ordem: number;
  ativo: boolean;
};

export function ObservacoesAdmin() {
  const [itens, setItens] = useState<Preset[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const toast = useToast();

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/observacoes");
      if (r.ok) {
        setItens((await r.json()).observacoes);
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
    const r = await fetch(`/api/admin/observacoes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      toast.sucesso("Observacao atualizada");
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel salvar.");
    }
  }

  async function criar() {
    const r = await fetch("/api/admin/observacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: "Nova observacao", ordem: itens.length + 1 }),
    });
    if (r.ok) {
      toast.sucesso("Observacao criada");
      await carregar();
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel criar.");
    }
  }

  async function remover(id: string) {
    const r = await fetch(`/api/admin/observacoes/${id}`, { method: "DELETE" });
    if (r.ok) {
      toast.sucesso("Observacao removida");
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel remover.");
    }
    await carregar();
  }

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Observacoes pre-definidas"
        subtitulo="Textos aplicaveis em 1 clique no painel do cliente"
        acao={
          <button
            onClick={() => void criar()}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro"
          >
            <Plus className="h-4 w-4" /> Nova observacao
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
        <div className="space-y-2">
          {itens.map((p) => (
            <LinhaPreset
              key={p.id}
              preset={p}
              onCampo={(c) => void patch(p.id, c)}
              onRemover={() => void remover(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LinhaPreset({
  preset,
  onCampo,
  onRemover,
}: {
  preset: Preset;
  onCampo: (c: Record<string, unknown>) => void;
  onRemover: () => void;
}) {
  const [texto, setTexto] = useState(preset.texto);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (texto.trim() && texto !== preset.texto) {
            onCampo({ texto: texto.trim() });
          }
        }}
        className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1.5 text-sm text-escuro outline-none hover:border-black/10 focus:border-tiffany"
      />
      <button
        onClick={() => onCampo({ ativo: !preset.ativo })}
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          preset.ativo
            ? "bg-green-100 text-green-700"
            : "bg-black/10 text-medio/60"
        }`}
      >
        {preset.ativo ? "Ativa" : "Inativa"}
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
