"use client";

// Rodape da thread: textarea de envio + respostas rapidas (botao e atalho "/").
// Enter envia, Shift+Enter quebra linha. Digitar "/" abre a lista filtravel; ao
// escolher, o texto e inserido no compositor (editavel antes de enviar).
import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Send, Loader2, Zap, X } from "lucide-react";
import type { MensagemItem } from "./tipos";

type Resposta = {
  id: string;
  titulo: string;
  atalho: string | null;
  texto: string;
};

export function Compositor({
  conversaId,
  onEnviada,
}: {
  conversaId: string;
  onEnviada: (msg: MensagemItem) => void;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [mostrar, setMostrar] = useState(false);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    fetch("/api/respostas")
      .then((r) => (r.ok ? r.json() : { respostas: [] }))
      .then((d) => setRespostas(d.respostas ?? []))
      .catch(() => undefined);
  }, []);

  const q = busca.toLowerCase().trim();
  const filtradas = q
    ? respostas.filter(
        (r) =>
          r.titulo.toLowerCase().includes(q) ||
          (r.atalho ?? "").toLowerCase().includes(q) ||
          r.texto.toLowerCase().includes(q),
      )
    : respostas;

  function aoMudar(v: string) {
    setTexto(v);
    if (v.startsWith("/")) {
      setMostrar(true);
      setBusca(v.slice(1));
    } else if (v === "") {
      setMostrar(false);
    }
  }

  function selecionar(r: Resposta) {
    const base = texto.trim();
    const novo = base === "" || base.startsWith("/") ? r.texto : `${base}\n${r.texto}`;
    setTexto(novo);
    setMostrar(false);
    setBusca("");
    setTimeout(() => ref.current?.focus(), 0);
  }

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
      if (d?.mensagem) onEnviada(d.mensagem as MensagemItem);
      if (!r.ok) {
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
    if (e.key === "Escape" && mostrar) {
      setMostrar(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      // Lista aberta via "/": Enter escolhe a primeira opcao.
      if (mostrar && texto.startsWith("/") && filtradas.length > 0) {
        e.preventDefault();
        selecionar(filtradas[0]);
        return;
      }
      e.preventDefault();
      void enviar();
    }
  }

  return (
    <div className="relative border-t border-black/5 bg-white p-3">
      {erro && <p className="mb-2 px-1 text-xs text-erro">{erro}</p>}

      {mostrar && (
        <div className="absolute bottom-full left-3 right-3 mb-1 max-h-72 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-medio/50">
              Respostas rapidas
            </p>
            <button
              onClick={() => setMostrar(false)}
              className="rounded p-0.5 text-medio/50 hover:bg-black/5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="scroll-fino max-h-60 overflow-y-auto">
            {filtradas.length === 0 ? (
              <p className="p-4 text-center text-sm text-medio/50">
                Nenhuma resposta.
              </p>
            ) : (
              filtradas.map((r) => (
                <button
                  key={r.id}
                  onClick={() => selecionar(r)}
                  className="flex w-full flex-col gap-0.5 border-b border-black/5 px-3 py-2 text-left last:border-0 hover:bg-fundo"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-escuro">
                      {r.titulo}
                    </span>
                    {r.atalho && (
                      <span className="rounded bg-tiffany/10 px-1.5 py-0.5 text-[10px] font-medium text-tiffany">
                        {r.atalho}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs text-medio/60">
                    {r.texto}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={() => {
            setMostrar((v) => !v);
            setBusca("");
          }}
          title="Respostas rapidas"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors ${
            mostrar
              ? "border-tiffany bg-tiffany/10 text-tiffany"
              : "border-black/10 text-medio hover:bg-black/5"
          }`}
        >
          <Zap className="h-5 w-5" />
        </button>
        <textarea
          ref={ref}
          value={texto}
          onChange={(e) => aoMudar(e.target.value)}
          onKeyDown={aoTeclar}
          rows={1}
          placeholder='Escreva uma mensagem... ("/" para respostas rapidas)'
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
