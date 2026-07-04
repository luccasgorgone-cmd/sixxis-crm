"use client";

// Aplica/remove uma ETIQUETA em massa nos clientes selecionados. Reusa a mesma
// selecao da lista. Escopo garantido no servidor (nao-admin so nos proprios).
import { useState } from "react";
import { X, Loader2, Tag } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { EtiquetaChip } from "@/components/kanban/tipos";

export function ModalEtiquetasMassa({
  leadIds,
  etiquetas,
  onFechar,
  onConcluido,
}: {
  leadIds: string[];
  etiquetas: EtiquetaChip[];
  onFechar: () => void;
  onConcluido: () => void;
}) {
  const toast = useToast();
  const [etiquetaId, setEtiquetaId] = useState("");
  const [acao, setAcao] = useState<"adicionar" | "remover">("adicionar");
  const [salvando, setSalvando] = useState(false);

  async function aplicar() {
    if (!etiquetaId) {
      toast.erro("Escolha uma etiqueta.");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch("/api/leads/etiquetas-massa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds, etiquetaId, acao }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        toast.erro(d?.erro ?? "Nao foi possivel aplicar as etiquetas.");
        return;
      }
      const verbo = acao === "adicionar" ? "aplicada em" : "removida de";
      toast.sucesso(
        `Etiqueta ${verbo} ${d.afetados} cliente(s).` +
          (d.ignorados ? ` ${d.ignorados} fora do seu escopo.` : ""),
      );
      onConcluido();
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
            <Tag className="h-4 w-4 text-tiffany" /> Etiquetar {leadIds.length} cliente(s)
          </h3>
          <button onClick={onFechar} className="rounded-lg p-1 text-medio/60 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Acao: adicionar ou remover */}
        <div className="mb-3 flex gap-1 rounded-lg bg-fundo p-1">
          {(["adicionar", "remover"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAcao(a)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                acao === a
                  ? "bg-white text-escuro shadow-sm"
                  : "text-medio/60 hover:text-escuro"
              }`}
            >
              {a === "adicionar" ? "Adicionar" : "Remover"}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-xs font-medium text-medio/70">Etiqueta</label>
        <select
          value={etiquetaId}
          onChange={(e) => setEtiquetaId(e.target.value)}
          className="campo w-full"
        >
          <option value="">Escolha uma etiqueta...</option>
          {etiquetas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onFechar}
            disabled={salvando}
            className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={() => void aplicar()}
            disabled={salvando || !etiquetaId}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {acao === "adicionar" ? "Aplicar" : "Remover"}
          </button>
        </div>
      </div>
    </div>
  );
}
