"use client";

// Exclusao de cliente(s) — SOMENTE ADMIN. Regra de seguranca: cliente SEM
// historico e apagado; cliente COM historico e ARQUIVADO (protege o rastro de
// vendas). Opcao forte "apagar mesmo com historico" (irreversivel). Reusado para
// exclusao individual (1 id) e em massa. Fatia 2.81.
import { useState } from "react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

export function ModalExcluirClientes({
  leadIds,
  onFechar,
  onConcluido,
}: {
  leadIds: string[];
  onFechar: () => void;
  onConcluido: () => void;
}) {
  const toast = useToast();
  const [force, setForce] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const n = leadIds.length;

  async function confirmar() {
    setExcluindo(true);
    try {
      const r = await fetch("/api/leads/excluir-massa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds, force }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        toast.erro(d?.erro ?? "Nao foi possivel excluir.");
        return;
      }
      const partes: string[] = [];
      if (d.excluidos) partes.push(`${d.excluidos} excluido(s)`);
      if (d.arquivados) partes.push(`${d.arquivados} arquivado(s) (tinham historico)`);
      toast.sucesso(partes.length ? partes.join(" · ") : "Nada a excluir.");
      onConcluido();
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
            <Trash2 className="h-4 w-4 text-erro" />
            Excluir {n} cliente{n > 1 ? "s" : ""}
          </h3>
          <button onClick={onFechar} className="rounded-lg p-1 text-medio/60 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-medio/80">
          Clientes <strong className="text-escuro">sem histórico</strong> (sem
          conversa ou negócio) sao apagados. Clientes{" "}
          <strong className="text-escuro">com histórico</strong> sao{" "}
          <strong className="text-escuro">arquivados</strong> (somem das listas,
          mas o rastro de vendas e preservado).
        </p>

        <label className="mt-3 flex items-start gap-2 rounded-lg border border-erro/30 bg-erro/5 p-3 text-xs text-erro">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-red-600"
          />
          <span className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Apagar de vez, mesmo com histórico. Isso remove o cliente e TODO o
            histórico (conversas, mensagens, negócios). Irreversível.
          </span>
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onFechar}
            disabled={excluindo}
            className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={() => void confirmar()}
            disabled={excluindo}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
              force ? "bg-erro hover:brightness-95" : "bg-tiffany hover:bg-tiffany-escuro"
            }`}
          >
            {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {force ? "Apagar de vez" : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  );
}
