"use client";

// Transferencia EM MASSA de clientes selecionados (admin). Escolhe a finalidade
// e o vendedor de destino (carregado de /api/vendedores?finalidade=...), mostra
// o resumo e confirma -> POST /api/leads/transferir-massa.
import { useState, useEffect } from "react";
import { X, Loader2, Repeat } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

type Vendedor = { id: string; nome: string };

export function ModalTransferencia({
  leadIds,
  onFechar,
  onConcluido,
}: {
  leadIds: string[];
  onFechar: () => void;
  onConcluido: () => void;
}) {
  const toast = useToast();
  const [finalidade, setFinalidade] = useState<"VENDA" | "POS_VENDA">("VENDA");
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [destino, setDestino] = useState("");
  const [transferindo, setTransferindo] = useState(false);

  // Recarrega os vendedores da finalidade escolhida.
  useEffect(() => {
    setDestino("");
    fetch(`/api/vendedores?finalidade=${finalidade}`)
      .then((r) => (r.ok ? r.json() : { vendedores: [] }))
      .then((d) => setVendedores(d.vendedores ?? []))
      .catch(() => setVendedores([]));
  }, [finalidade]);

  async function transferir() {
    if (!destino) {
      toast.erro("Escolha o vendedor de destino.");
      return;
    }
    setTransferindo(true);
    try {
      const r = await fetch("/api/leads/transferir-massa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds, agenteId: destino, finalidade }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        toast.sucesso(
          `${d?.transferidos ?? 0} cliente(s) transferido(s)${
            d?.ignorados ? `, ${d.ignorados} ignorado(s)` : ""
          }.`,
        );
        onConcluido();
      } else {
        toast.erro(d?.erro ?? "Nao foi possivel transferir.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setTransferindo(false);
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in scroll-fino max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat className="h-5 w-5 text-tiffany" />
            <h3 className="text-base font-semibold text-escuro">
              Transferir clientes em massa
            </h3>
          </div>
          <button
            onClick={onFechar}
            className="rounded-lg p-1 text-medio/60 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-sm text-medio/70">
          <strong className="text-escuro">{leadIds.length}</strong> cliente(s)
          selecionado(s). Cada um tera o dono, o negocio aberto e as conversas da
          finalidade reatribuidos ao destino.
        </p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-escuro">
              Finalidade
            </label>
            <select
              value={finalidade}
              onChange={(e) => setFinalidade(e.target.value as "VENDA" | "POS_VENDA")}
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            >
              <option value="VENDA">Venda</option>
              <option value="POS_VENDA">Pos-venda</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-escuro">
              Vendedor de destino
            </label>
            <select
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            >
              <option value="">Escolher vendedor...</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
            {vendedores.length === 0 && (
              <p className="mt-1 text-[11px] text-medio/50">
                Nenhum vendedor com acesso a essa finalidade.
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onFechar}
            disabled={transferindo}
            className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={() => void transferir()}
            disabled={transferindo || !destino}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-50"
          >
            {transferindo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Repeat className="h-4 w-4" />
            )}
            Transferir {leadIds.length}
          </button>
        </div>
      </div>
    </div>
  );
}
