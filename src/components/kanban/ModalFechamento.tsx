"use client";

// Modal exibido ao soltar um card em "Vendido" (pede VALOR) ou "Perdido"
// (pede MOTIVO). Confirma ou cancela o movimento.
import { useState } from "react";
import { X, Loader2 } from "lucide-react";

export function ModalFechamento({
  tipo,
  valorInicial,
  onConfirmar,
  onCancelar,
}: {
  tipo: "ganho" | "perdido";
  valorInicial?: number | null;
  onConfirmar: (dados: { valor?: number; motivoPerda?: string }) => Promise<void>;
  onCancelar: () => void;
}) {
  const ehGanho = tipo === "ganho";
  const [valor, setValor] = useState(
    valorInicial != null ? String(valorInicial) : "",
  );
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setErro(null);
    if (ehGanho) {
      const v = Number(valor.replace(",", "."));
      if (!v || v <= 0) {
        setErro("Informe um valor valido.");
        return;
      }
      setSalvando(true);
      try {
        await onConfirmar({ valor: v });
      } catch {
        setErro("Nao foi possivel concluir.");
        setSalvando(false);
      }
    } else {
      if (!motivo.trim()) {
        setErro("Informe o motivo da perda.");
        return;
      }
      setSalvando(true);
      try {
        await onConfirmar({ motivoPerda: motivo.trim() });
      } catch {
        setErro("Nao foi possivel concluir.");
        setSalvando(false);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-escuro">
            {ehGanho ? "Marcar como vendido" : "Marcar como perdido"}
          </h3>
          <button
            onClick={onCancelar}
            className="rounded-lg p-1 text-medio/60 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {ehGanho ? (
          <>
            <label className="mb-1 block text-sm font-medium text-escuro">
              Valor da venda (R$)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-lg border border-black/10 bg-fundo px-3 py-2.5 text-sm outline-none focus:border-tiffany"
            />
          </>
        ) : (
          <>
            <label className="mb-1 block text-sm font-medium text-escuro">
              Motivo da perda
            </label>
            <textarea
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ex.: comprou com concorrente, sem orcamento..."
              className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-fundo px-3 py-2.5 text-sm outline-none focus:border-tiffany"
            />
          </>
        )}

        {erro && <p className="mt-2 text-xs text-erro">{erro}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancelar}
            disabled={salvando}
            className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={salvando}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
              ehGanho
                ? "bg-green-600 hover:bg-green-700"
                : "bg-erro hover:bg-red-700"
            }`}
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
