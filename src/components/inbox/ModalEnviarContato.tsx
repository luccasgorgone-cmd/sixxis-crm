"use client";

// Enviar um CONTATO ao cliente: nome + telefone. Via Evolution sendContact (com
// fallback texto no servidor). Fatia 2.85.
import { useState } from "react";
import { Contact, Loader2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { MensagemItem } from "./tipos";

export function ModalEnviarContato({
  conversaId,
  instanciaId,
  onEnviada,
  onFechar,
}: {
  conversaId: string;
  instanciaId?: string | null;
  onEnviada: (msg: MensagemItem) => void;
  onFechar: () => void;
}) {
  const toast = useToast();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!nome.trim() || !telefone.trim()) {
      toast.erro("Informe nome e telefone.");
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch("/api/mensagens/enviar-contato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversaId,
          nome: nome.trim(),
          telefone: telefone.trim(),
          ...(instanciaId ? { instanciaId } : {}),
        }),
      });
      const d = await r.json().catch(() => null);
      // ERRO (ex.: 502 do fallback): NAO adiciona ao thread aqui (o card com erro
      // ja chega pelo socket) e mantem o modal aberto com um erro claro. Fatia 3.07.
      if (!r.ok) {
        toast.erro(d?.erro ?? "Nao foi possivel enviar o contato.");
        return;
      }
      // SUCESSO: fecha SEMPRE. O onEnviada e protegido para nunca bloquear o
      // fechamento (antes, um erro nele deixava o modal preso aberto).
      try {
        if (d?.mensagem) onEnviada(d.mensagem as MensagemItem);
      } catch {
        // ignora: a mensagem tambem chega pelo socket
      }
      toast.sucesso("Contato enviado.");
      onFechar();
    } catch {
      toast.erro("Falha de conexão.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
            <Contact className="h-4 w-4 text-tiffany" /> Enviar contato
          </h3>
          <button onClick={onFechar} className="rounded-lg p-1 text-medio/60 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-medio/70">Nome</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
              placeholder="Nome do contato"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-medio/70">Telefone</label>
            <input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(00) 00000-0000"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onFechar}
            disabled={enviando}
            className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={() => void enviar()}
            disabled={enviando || !nome.trim() || !telefone.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Contact className="h-4 w-4" />}
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
