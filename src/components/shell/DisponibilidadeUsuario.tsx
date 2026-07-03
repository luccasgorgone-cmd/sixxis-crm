"use client";

// Controle de disponibilidade do PROPRIO usuario no topo. Reflete/altera o MESMO
// Agente.ativo do painel do admin (sem duplicar). Ausente = nao recebe novos
// leads; os leads continuam entrando e vao para os colegas disponiveis.
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export function DisponibilidadeUsuario() {
  const [ativo, setAtivo] = useState<boolean | null>(null);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/me/disponibilidade")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.ativo === "boolean") setAtivo(d.ativo);
      })
      .catch(() => undefined);
  }, []);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return;
    function aoClicar(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicar);
    return () => document.removeEventListener("mousedown", aoClicar);
  }, [aberto]);

  const mudar = useCallback(async (v: boolean) => {
    setSalvando(true);
    try {
      const r = await fetch("/api/me/disponibilidade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: v }),
      });
      if (r.ok) {
        const d = await r.json();
        if (typeof d.ativo === "boolean") setAtivo(d.ativo);
      }
    } catch {
      // silencioso: o estado nao muda
    } finally {
      setSalvando(false);
    }
  }, []);

  if (ativo === null) return null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        title={ativo ? "Disponivel para receber leads" : "Ausente — nao recebe leads"}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors ${
          ativo
            ? "border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-300"
            : "border-black/10 bg-black/5 text-medio/70"
        }`}
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            ativo ? "bg-green-500" : "bg-medio/40"
          }`}
        />
        <span className="hidden sm:inline">{ativo ? "Disponivel" : "Ausente"}</span>
      </button>

      {aberto && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-72 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg">
          <div className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-escuro">
                Disponivel para receber leads
              </p>
              <p className="text-xs text-medio/60">
                {ativo ? "Voce esta recebendo novos leads." : "Voce esta ausente."}
              </p>
            </div>
            <button
              onClick={() => void mudar(!ativo)}
              disabled={salvando}
              role="switch"
              aria-checked={ativo}
              aria-label="Disponivel para receber leads"
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                ativo ? "bg-tiffany" : "bg-black/15"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform ${
                  ativo ? "translate-x-5" : "translate-x-0"
                }`}
              >
                {salvando && <Loader2 className="h-3 w-3 animate-spin text-medio" />}
              </span>
            </button>
          </div>
          {!ativo && (
            <div className="border-t border-black/5 bg-fundo px-3 py-2.5 text-xs leading-relaxed text-medio/70">
              Voce nao recebera novos leads enquanto estiver ausente. Os leads
              continuam entrando e vao para os colegas disponiveis.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
