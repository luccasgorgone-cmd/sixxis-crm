"use client";

// Bloqueia/desbloqueia um contato (admin). Quando bloqueado, a ingestao registra
// mas nao notifica/roteia/responde. Reversivel. Fatia 2.81.
import { useState } from "react";
import { Ban, ShieldCheck, Loader2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

export function ModalBloquear({
  leadId,
  nome,
  bloqueado,
  onFechar,
  onConcluido,
}: {
  leadId: string;
  nome: string;
  bloqueado: boolean;
  onFechar: () => void;
  onConcluido: () => void;
}) {
  const toast = useToast();
  const [salvando, setSalvando] = useState(false);
  const desbloquear = bloqueado;

  async function confirmar() {
    setSalvando(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/bloquear`, { method: "POST" });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        toast.erro(d?.erro ?? "Nao foi possivel alterar o bloqueio.");
        return;
      }
      toast.sucesso(d.bloqueado ? "Contato bloqueado." : "Contato desbloqueado.");
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
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
            {desbloquear ? (
              <ShieldCheck className="h-4 w-4 text-tiffany" />
            ) : (
              <Ban className="h-4 w-4 text-erro" />
            )}
            {desbloquear ? "Desbloquear contato" : "Bloquear contato"}
          </h3>
          <button onClick={onFechar} className="rounded-lg p-1 text-medio/60 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-medio/80">
          {desbloquear ? (
            <>
              Voltar a atender <strong className="text-escuro">{nome}</strong>?
              Novas mensagens voltam a notificar e rotear normalmente.
            </>
          ) : (
            <>
              Bloquear <strong className="text-escuro">{nome}</strong>? As novas
              mensagens deste contato serao registradas, mas{" "}
              <strong className="text-escuro">
                nao notificam, nao roteiam e nao recebem resposta automatica
              </strong>
              . Nada e enviado ao cliente. Reversivel.
            </>
          )}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onFechar}
            disabled={salvando}
            className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={() => void confirmar()}
            disabled={salvando}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
              desbloquear ? "bg-tiffany hover:bg-tiffany-escuro" : "bg-erro hover:brightness-95"
            }`}
          >
            {salvando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : desbloquear ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <Ban className="h-4 w-4" />
            )}
            {desbloquear ? "Desbloquear" : "Bloquear"}
          </button>
        </div>
      </div>
    </div>
  );
}
