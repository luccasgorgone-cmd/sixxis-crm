"use client";

// Bloco "Pedidos" da ficha: lista os pedidos GANHOS do cliente (venda e pecas)
// com itens, quantidades, valores, frete, total e data. Permite "Repetir pedido"
// (pre-carrega o compositor de ganho com os itens). Historico nunca e apagado.
import { useCallback, useEffect, useState } from "react";
import { ShoppingBag, ChevronDown, RefreshCw, Loader2 } from "lucide-react";
import { formatarBRL } from "@/lib/format";

export type ItemPedidoSeed = {
  produtoCatalogoId: string | null;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
};

type Pedido = {
  negocioId: string;
  finalidade: string;
  data: string | null;
  total: number | null;
  valorProdutos: number | null;
  frete: number | null;
  itens: (ItemPedidoSeed & { subtotal: number })[];
};

function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function BlocoPedidos({
  leadId,
  onRepetir,
}: {
  leadId: string;
  onRepetir?: (itens: ItemPedidoSeed[]) => void;
}) {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/leads/${leadId}/pedidos`);
      if (r.ok) setPedidos((await r.json()).pedidos ?? []);
      else setPedidos([]);
    } catch {
      setPedidos([]);
    }
  }, [leadId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (pedidos === null) {
    return (
      <section>
        <Cabec />
        <div className="flex items-center justify-center py-4 text-medio/40">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      </section>
    );
  }

  return (
    <section>
      <Cabec quantidade={pedidos.length} />
      {pedidos.length === 0 ? (
        <p className="text-sm text-medio/50">Nenhum pedido fechado ainda.</p>
      ) : (
        <div className="space-y-1.5">
          {pedidos.map((p) => {
            const expandido = aberto === p.negocioId;
            return (
              <div key={p.negocioId} className="rounded-lg border border-black/5 bg-white">
                <button
                  onClick={() => setAberto(expandido ? null : p.negocioId)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="whitespace-nowrap text-sm font-semibold text-escuro">
                        {p.total != null ? formatarBRL(p.total) : "—"}
                      </span>
                      <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-medium text-medio/60">
                        {p.finalidade === "POS_VENDA" ? "Pecas" : "Venda"}
                      </span>
                    </div>
                    <p className="text-xs text-medio/50">
                      {dataCurta(p.data)}
                      {p.itens.length > 0 && ` · ${p.itens.length} ${p.itens.length === 1 ? "item" : "itens"}`}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-medio/40 transition-transform ${expandido ? "rotate-180" : ""}`}
                  />
                </button>
                {expandido && (
                  <div className="border-t border-black/5 px-3 py-2">
                    {p.itens.length > 0 ? (
                      <div className="space-y-1">
                        {p.itens.map((it, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-xs">
                            <span className="min-w-0 truncate text-escuro">
                              {it.quantidade}x {it.descricao}
                            </span>
                            <span className="shrink-0 whitespace-nowrap text-medio/60">
                              {formatarBRL(it.subtotal)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-medio/50">Pedido sem itens detalhados.</p>
                    )}
                    <div className="mt-2 space-y-0.5 border-t border-black/5 pt-2 text-xs text-medio/60">
                      {p.valorProdutos != null && (
                        <div className="flex justify-between">
                          <span>Produtos</span>
                          <span>{formatarBRL(p.valorProdutos)}</span>
                        </div>
                      )}
                      {p.frete != null && p.frete > 0 && (
                        <div className="flex justify-between">
                          <span>Frete</span>
                          <span>{formatarBRL(p.frete)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-escuro">
                        <span>Total</span>
                        <span>{p.total != null ? formatarBRL(p.total) : "—"}</span>
                      </div>
                    </div>
                    {onRepetir && p.itens.length > 0 && (
                      <button
                        onClick={() =>
                          onRepetir(
                            p.itens.map((it) => ({
                              produtoCatalogoId: it.produtoCatalogoId,
                              descricao: it.descricao,
                              quantidade: it.quantidade,
                              valorUnitario: it.valorUnitario,
                            })),
                          )
                        }
                        className="mt-2 flex items-center gap-1.5 rounded-lg border border-tiffany/30 px-2.5 py-1.5 text-xs font-medium text-tiffany transition-colors hover:bg-tiffany/10"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Repetir pedido
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Cabec({ quantidade }: { quantidade?: number }) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <ShoppingBag className="h-4 w-4 text-tiffany" />
      <h3 className="text-sm font-semibold text-escuro">Pedidos</h3>
      {quantidade != null && quantidade > 0 && (
        <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold text-medio/60">
          {quantidade}
        </span>
      )}
    </div>
  );
}
