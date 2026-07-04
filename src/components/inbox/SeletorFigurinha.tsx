"use client";

// Painel de figurinhas do compositor: grade de miniaturas das figurinhas ativas.
// Favoritas no topo (acesso rapido). Clicar envia; a estrela favorita/desfavorita.
// Presentacional (envio e favoritar ficam no Compositor).
import { useRef, type RefObject } from "react";
import { X, Loader2, Sticker, Star } from "lucide-react";
import { useClickFora } from "@/lib/useClickFora";

type Figurinha = { id: string; nome: string; url: string; favorita?: boolean };

function Grade({
  itens,
  enviando,
  onEscolher,
  onFavoritar,
}: {
  itens: Figurinha[];
  enviando: boolean;
  onEscolher: (id: string) => void;
  onFavoritar: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {itens.map((f) => (
        <div
          key={f.id}
          className="group relative flex aspect-square items-center justify-center rounded-lg border border-black/5 bg-fundo p-1"
        >
          <button
            type="button"
            disabled={enviando}
            onClick={() => onEscolher(f.id)}
            title={f.nome}
            className="flex h-full w-full items-center justify-center transition-transform hover:scale-105 disabled:opacity-50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.url}
              alt={f.nome}
              className="max-h-full max-w-full object-contain"
              loading="lazy"
            />
          </button>
          <button
            type="button"
            onClick={() => onFavoritar(f.id)}
            title={f.favorita ? "Desfavoritar" : "Favoritar"}
            aria-label={f.favorita ? "Desfavoritar" : "Favoritar"}
            className={`absolute right-0.5 top-0.5 rounded-full p-0.5 transition-opacity ${
              f.favorita
                ? "text-tiffany opacity-100"
                : "text-medio/50 opacity-0 hover:text-tiffany group-hover:opacity-100"
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${f.favorita ? "fill-tiffany" : ""}`} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function SeletorFigurinha({
  figurinhas,
  carregando,
  enviando,
  onEscolher,
  onFavoritar,
  onFechar,
  anchorRef,
}: {
  figurinhas: Figurinha[];
  carregando: boolean;
  enviando: boolean;
  onEscolher: (id: string) => void;
  onFavoritar: (id: string) => void;
  onFechar: () => void;
  // Botao-gatilho: ignorado no clique-fora para permitir alternar sem reabrir.
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useClickFora(onFechar, true, anchorRef ? [rootRef, anchorRef] : [rootRef]);

  const favoritas = figurinhas.filter((f) => f.favorita);
  const demais = figurinhas.filter((f) => !f.favorita);
  return (
    <div
      ref={rootRef}
      className="absolute bottom-full left-3 z-20 mb-1 w-72 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg"
    >
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
          <div className="space-y-2">
            {favoritas.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-medio/40">
                  <Star className="h-3 w-3 fill-tiffany text-tiffany" /> Favoritas
                </p>
                <Grade
                  itens={favoritas}
                  enviando={enviando}
                  onEscolher={onEscolher}
                  onFavoritar={onFavoritar}
                />
              </div>
            )}
            {demais.length > 0 && (
              <div>
                {favoritas.length > 0 && (
                  <p className="mb-1 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-medio/40">
                    Todas
                  </p>
                )}
                <Grade
                  itens={demais}
                  enviando={enviando}
                  onEscolher={onEscolher}
                  onFavoritar={onFavoritar}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
