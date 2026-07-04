"use client";

// Move o ATENDIMENTO entre finalidades (Venda <-> Pos-venda). Corrige o canal
// quando o cliente entrou pelo funil errado. O cliente CONTINUA no mesmo chat/
// numero — muda so o funil e o responsavel. Fatia 2.84.
import { useEffect, useState } from "react";
import { ArrowLeftRight, Loader2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

type Finalidade = "VENDA" | "POS_VENDA";

const ROTULO: Record<Finalidade, string> = {
  VENDA: "Vendas",
  POS_VENDA: "Pos-venda",
};

export function ModalMoverFinalidade({
  leadId,
  finalidadeOrigem,
  onFechar,
  onConcluido,
}: {
  leadId: string;
  finalidadeOrigem: Finalidade;
  onFechar: () => void;
  onConcluido: () => void;
}) {
  const toast = useToast();
  const destino: Finalidade = finalidadeOrigem === "VENDA" ? "POS_VENDA" : "VENDA";
  const [agentes, setAgentes] = useState<{ id: string; nome: string }[]>([]);
  const [agenteDestinoId, setAgenteDestinoId] = useState(""); // "" = automatico
  const [movendo, setMovendo] = useState(false);

  useEffect(() => {
    fetch(`/api/vendedores?finalidade=${destino}`)
      .then((r) => (r.ok ? r.json() : { vendedores: [] }))
      .then((d) => setAgentes(d.vendedores ?? []))
      .catch(() => undefined);
  }, [destino]);

  async function mover() {
    setMovendo(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/mover-finalidade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finalidadeDestino: destino,
          agenteDestinoId: agenteDestinoId || null,
        }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        toast.erro(d?.erro ?? "Nao foi possivel mover o atendimento.");
        return;
      }
      toast.sucesso(
        d?.jaNaFinalidade
          ? `O atendimento ja estava em ${ROTULO[destino]}.`
          : `Atendimento movido para ${ROTULO[destino]}.`,
      );
      onConcluido();
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setMovendo(false);
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
            <ArrowLeftRight className="h-4 w-4 text-tiffany" /> Mover atendimento
          </h3>
          <button onClick={onFechar} className="rounded-lg p-1 text-medio/60 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-medio/80">
          Mover este atendimento de{" "}
          <strong className="text-escuro">{ROTULO[finalidadeOrigem]}</strong> para{" "}
          <strong className="text-escuro">{ROTULO[destino]}</strong>?
        </p>
        <p className="mt-2 rounded-lg bg-tiffany/[0.06] px-2.5 py-1.5 text-[11px] text-medio/70">
          O cliente continua no mesmo chat/numero. Muda apenas o funil e o
          responsavel.
        </p>

        <label className="mb-1 mt-4 block text-xs font-medium text-medio/70">
          Responsavel em {ROTULO[destino]}
        </label>
        <select
          value={agenteDestinoId}
          onChange={(e) => setAgenteDestinoId(e.target.value)}
          className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
        >
          <option value="">Distribuir automaticamente</option>
          {agentes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onFechar}
            disabled={movendo}
            className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={() => void mover()}
            disabled={movendo}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {movendo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowLeftRight className="h-4 w-4" />
            )}
            Mover para {ROTULO[destino]}
          </button>
        </div>
      </div>
    </div>
  );
}
