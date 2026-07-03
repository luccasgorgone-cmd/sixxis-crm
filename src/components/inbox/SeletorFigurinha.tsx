"use client";

// Painel de figurinhas do compositor: grade de miniaturas das figurinhas ativas.
// Clicar envia (o envio real fica no Compositor). Presentacional.
import { X, Loader2, Sticker } from "lucide-react";

type Figurinha = { id: string; nome: string; url: string };

export function SeletorFigurinha({
  figurinhas,
  carregando,
  enviando,
  onEscolher,
  onFechar,
}: {
  figurinhas: Figurinha[];
  carregando: boolean;
  enviando: boolean;
  onEscolher: (id: string) => void;
  onFechar: () => void;
}) {
  return (
    <div className="absolute bottom-full left-3 z-20 mb-1 w-72 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-medio/50">
          Figurinhas
        </p>
        <button
          onClick={onFechar}
          aria-label="Fechar"
          className="rounded p-0.5 text-medio/50 hover:bg-black/5"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="scroll-fino max-h-60 overflow-y-auto p-2">
        {carregando ? (
          <div className="flex items-center justify-center py-8 text-medio/50">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : figurinhas.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-8 text-center">
            <Sticker className="h-7 w-7 text-medio/30" />
            <p className="text-xs text-medio/60">Nenhuma figurinha disponivel.</p>
            <p className="max-w-[12rem] text-[11px] text-medio/40">
              O admin pode adicionar figurinhas em Admin.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {figurinhas.map((f) => (
              <button
                key={f.id}
                type="button"
                disabled={enviando}
                onClick={() => onEscolher(f.id)}
                title={f.nome}
                className="flex aspect-square items-center justify-center rounded-lg border border-black/5 bg-fundo p-1 transition-colors hover:border-tiffany/40 disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.url}
                  alt={f.nome}
                  className="max-h-full max-w-full object-contain"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
