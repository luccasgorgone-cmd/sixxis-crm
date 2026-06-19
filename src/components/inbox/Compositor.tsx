"use client";

// Rodape da thread: textarea de envio. Enter envia, Shift+Enter quebra linha.
import { useState, useRef, type KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import type { MensagemItem } from "./tipos";

export function Compositor({
  conversaId,
  onEnviada,
}: {
  conversaId: string;
  // Recebe a mensagem OUT gravada para anexar otimisticamente na thread.
  onEnviada: (msg: MensagemItem) => void;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  async function enviar() {
    const valor = texto.trim();
    if (!valor || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/mensagens/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversaId, texto: valor }),
      });
      const d = await r.json().catch(() => null);
      if (d?.mensagem) {
        onEnviada(d.mensagem as MensagemItem);
      }
      if (!r.ok) {
        // Mensagem foi gravada como ERRO (ja anexada acima); avisa o usuario.
        setErro("Falha ao enviar. Verifique a conexao com o WhatsApp.");
      }
      setTexto("");
      ref.current?.focus();
    } catch {
      setErro("Nao foi possivel enviar agora.");
    } finally {
      setEnviando(false);
    }
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviar();
    }
  }

  return (
    <div className="border-t border-black/5 bg-white p-3">
      {erro && <p className="mb-2 px-1 text-xs text-erro">{erro}</p>}
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={aoTeclar}
          rows={1}
          placeholder="Escreva uma mensagem..."
          className="scroll-fino max-h-32 min-h-[44px] flex-1 resize-none rounded-lg border border-black/10 bg-fundo px-3 py-2.5 text-sm outline-none transition-colors focus:border-tiffany"
        />
        <button
          onClick={() => void enviar()}
          disabled={enviando || !texto.trim()}
          title="Enviar (Enter)"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-tiffany text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-50"
        >
          {enviando ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}
