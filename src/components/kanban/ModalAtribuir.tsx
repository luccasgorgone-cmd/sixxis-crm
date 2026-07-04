"use client";

// Modal de atribuicao de negocio(s) a um colaborador. Reutiliza o mesmo endpoint
// do seletor "Vendedor" do painel (PATCH /api/negocios/[id] { agenteId }).
// Serve para atribuir 1 card (admin) ou em massa (coluna "Novo"). O 403 de
// finalidade sem acesso e tratado com toast, sem quebrar a UI.
import { useState } from "react";
import { Loader2, UserCheck, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { AgenteResumo } from "./tipos";

export function ModalAtribuir({
  negocioIds,
  titulo,
  agenteIdAtual,
  elegiveis,
  onConcluido,
  onFechar,
}: {
  negocioIds: string[];
  titulo: string;
  agenteIdAtual: string;
  // Colaboradores ja filtrados por acesso a finalidade.
  elegiveis: AgenteResumo[];
  onConcluido: () => void;
  onFechar: () => void;
}) {
  const toast = useToast();
  const [destino, setDestino] = useState(agenteIdAtual);
  const [salvando, setSalvando] = useState(false);

  const quantos = negocioIds.length;

  async function atribuir() {
    if (!destino || quantos === 0) return;
    setSalvando(true);
    let ok = 0;
    let negado = false;
    for (const id of negocioIds) {
      try {
        const r = await fetch(`/api/negocios/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agenteId: destino }),
        });
        if (r.ok) ok += 1;
        else if (r.status === 403) negado = true;
      } catch {
        // segue para os proximos
      }
    }
    setSalvando(false);
    if (ok > 0) {
      toast.sucesso(
        ok === 1 ? "Cliente atribuido." : `${ok} clientes atribuidos.`,
      );
      onConcluido();
    }
    if (negado && ok === 0) {
      toast.erro("Colaborador sem acesso a essa finalidade.");
    } else if (ok === 0) {
      toast.erro("Nao foi possivel atribuir.");
    } else {
      onFechar();
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in scroll-fino max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-escuro">
            <UserCheck className="h-5 w-5 text-tiffany" /> {titulo}
          </h3>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-lg p-1 text-medio/60 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-sm text-medio/70">
          {quantos === 1
            ? "Escolha o colaborador para este cliente."
            : `Escolha o colaborador para ${quantos} clientes sem dono.`}
        </p>

        <label className="mb-1 block text-xs font-medium text-medio/70">
          Colaborador
        </label>
        <select
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          className="mb-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
        >
          {!elegiveis.some((a) => a.id === agenteIdAtual) && (
            <option value={agenteIdAtual}>Eu</option>
          )}
          {elegiveis.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
              {a.id === agenteIdAtual ? " (eu)" : ""}
            </option>
          ))}
        </select>
        {elegiveis.length === 0 && (
          <p className="text-xs text-amber-700">
            Nenhum colaborador com acesso a essa finalidade.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onFechar}
            className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={() => void atribuir()}
            disabled={salvando || !destino || quantos === 0}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Atribuir
          </button>
        </div>
      </div>
    </div>
  );
}
