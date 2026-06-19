"use client";

// Seletor de produto da loja (modal): busca por nome/categoria, lista com
// imagem/nome/preco. Ao escolher, devolve o produto ao chamador.
import { useState, useEffect } from "react";
import { Search, X, Package, WifiOff } from "lucide-react";
import { formatarBRL } from "@/lib/format";
import type { ProdutoLoja } from "./tipos";

export function SeletorProduto({
  onEscolher,
  onFechar,
}: {
  onEscolher: (p: ProdutoLoja) => void;
  onFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [produtos, setProdutos] = useState<ProdutoLoja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    fetch(`/api/loja/produtos?busca=${encodeURIComponent(buscaAplicada)}`)
      .then((r) => (r.ok ? r.json() : { produtos: [], offline: true }))
      .then((d) => {
        if (!vivo) return;
        setProdutos(d.produtos ?? []);
        setOffline(Boolean(d.offline));
      })
      .catch(() => vivo && setOffline(true))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [buscaAplicada]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-black/5 p-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-escuro">
            <Package className="h-5 w-5 text-tiffany" /> Enviar produto
          </h3>
          <button
            onClick={onFechar}
            className="rounded-lg p-1 text-medio/60 hover:bg-black/5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-black/5 p-3">
          <div className="flex items-center gap-2 rounded-lg border border-black/10 bg-fundo px-3 focus-within:border-tiffany">
            <Search className="h-4 w-4 text-medio/50" />
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou categoria"
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </div>
        </div>

        <div className="scroll-fino min-h-0 flex-1 overflow-y-auto p-3">
          {offline ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-medio/50">
              <WifiOff className="h-7 w-7" />
              <p className="text-sm">Loja indisponivel no momento.</p>
            </div>
          ) : carregando ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-40 w-full rounded-xl" />
              ))}
            </div>
          ) : produtos.length === 0 ? (
            <p className="py-10 text-center text-sm text-medio/50">
              Nenhum produto encontrado.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {produtos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onEscolher(p)}
                  className="group flex flex-col overflow-hidden rounded-xl border border-black/5 bg-white text-left transition-shadow hover:shadow-md"
                >
                  <div className="flex h-28 items-center justify-center bg-fundo">
                    {p.imagem ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imagem}
                        alt={p.nome}
                        className="h-full w-full object-contain p-2"
                      />
                    ) : (
                      <Package className="h-8 w-8 text-medio/30" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-2">
                    <p className="line-clamp-2 text-xs font-medium text-escuro">
                      {p.nome}
                    </p>
                    <div className="mt-auto pt-1">
                      <span className="text-sm font-semibold text-tiffany-escuro">
                        {formatarBRL(p.precoPromo ?? p.preco)}
                      </span>
                      {p.precoPromo != null && (
                        <span className="ml-1 text-[11px] text-medio/40 line-through">
                          {formatarBRL(p.preco)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Monta a mensagem pronta com nome + preco + URL do produto.
export function mensagemProduto(p: ProdutoLoja): string {
  const preco = formatarBRL(p.precoPromo ?? p.preco);
  return `${p.nome} - ${preco}\n${p.url}`;
}
