"use client";

// Secao "Pedidos" da ficha (Fatia E): PEDIDO = ORCAMENTO com decisao GANHO (PED-
// 000000, imutavel). Lista os pedidos do cliente com PED, data, valor, selo de
// pagamento, NF (numero + data) e rastreio(s). Colapsada por padrao. Permite
// "Repetir pedido" (pre-carrega o compositor de ganho com os itens). Nivel lead:
// vale para venda e pos-venda. Padrao da casa: dark, tiffany, Lucide, sem emoji.
import { useCallback, useEffect, useState } from "react";
import {
  ShoppingBag,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Loader2,
  FileText,
  Truck,
} from "lucide-react";
import { formatarBRL } from "@/lib/format";

export type ItemPedidoSeed = {
  produtoCatalogoId: string | null;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
};

type Pedido = {
  id: string;
  negocioId: string;
  numeroFormatado: string;
  finalidade: string;
  data: string | null;
  total: number | null;
  frete: number | null;
  fretePagoPelaEmpresa?: boolean;
  itens: (ItemPedidoSeed & { garantia: boolean; subtotal: number })[];
  notasFiscais: { id: string; numero: string; dataNF: string }[];
  rastreios: { id: string; codigo: string; transportadora: string | null }[];
  pagamento: { status: string; valor: number; pagoEm: string | null } | null;
};

function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

// Selo compacto da situacao de pagamento do pedido (cobranca vinculada).
function SeloPagamento({ status }: { status: string | null | undefined }) {
  if (status === "pago") {
    return (
      <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold bg-green-600/10 text-green-700">
        Pago
      </span>
    );
  }
  if (status === "pendente") {
    return (
      <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold bg-amber-500/10 text-amber-600">
        A pagar
      </span>
    );
  }
  if (status) {
    return (
      <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold bg-black/5 text-medio/60">
        {status}
      </span>
    );
  }
  return <span className="shrink-0 text-[9px] font-semibold text-medio/30">—</span>;
}

export function BlocoPedidos({
  leadId,
  onRepetir,
}: {
  leadId: string;
  onRepetir?: (itens: ItemPedidoSeed[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/leads/${leadId}/pedidos`);
      setPedidos(r.ok ? (await r.json()).pedidos ?? [] : []);
    } catch {
      setPedidos([]);
    }
  }, [leadId]);

  // Colapsada por padrao: busca ao abrir (e ao reabrir/trocar de lead).
  useEffect(() => {
    if (aberto) void carregar();
  }, [aberto, carregar]);

  return (
    <section className="rounded-xl border border-black/5 bg-white">
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <ShoppingBag className="h-3.5 w-3.5 text-medio/50" />
        <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-medio/50">
          Pedidos
        </span>
        {pedidos != null && pedidos.length > 0 && (
          <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold text-medio/60">
            {pedidos.length}
          </span>
        )}
        <ChevronRight
          className={`h-4 w-4 text-medio/40 transition-transform ${aberto ? "rotate-90" : ""}`}
        />
      </button>

      {aberto && (
        <div className="px-4 pb-4">
          {pedidos === null ? (
            <div className="flex justify-center py-4 text-medio/40">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : pedidos.length === 0 ? (
            <p className="py-2 text-xs text-medio/50">Nenhum pedido fechado ainda.</p>
          ) : (
            <div className="space-y-1.5">
              {pedidos.map((p) => {
                const exp = expandido === p.id;
                return (
                  <div key={p.id} className="overflow-hidden rounded-lg border border-black/5 bg-fundo">
                    <button
                      onClick={() => setExpandido(exp ? null : p.id)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-medio/40 transition-transform ${exp ? "rotate-180" : ""}`}
                      />
                      <span className="shrink-0 font-mono text-xs font-semibold text-escuro">
                        {p.numeroFormatado}
                      </span>
                      <span className="shrink-0 text-[11px] text-medio/50">{dataCurta(p.data)}</span>
                      <span className="shrink-0 rounded-full bg-black/5 px-1.5 py-0.5 text-[9px] font-medium text-medio/60">
                        {p.finalidade === "POS_VENDA" ? "Pecas" : "Venda"}
                      </span>
                      <SeloPagamento status={p.pagamento?.status} />
                      <span className="ml-auto shrink-0 text-xs font-semibold text-escuro">
                        {p.total != null ? formatarBRL(p.total) : "—"}
                      </span>
                    </button>

                    {exp && (
                      <div className="border-t border-black/5 px-2.5 py-2">
                        {/* Itens */}
                        {p.itens.length > 0 ? (
                          <ul className="space-y-1">
                            {p.itens.map((it, i) => (
                              <li key={i} className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="min-w-0 truncate text-medio/70">
                                  <span className="text-medio/50">{it.quantidade}x </span>
                                  {it.descricao}
                                </span>
                                {it.garantia ? (
                                  <span className="shrink-0 text-tiffany">Garantia</span>
                                ) : (
                                  <span className="shrink-0 text-medio/60">
                                    {formatarBRL(it.subtotal)}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-medio/50">Pedido sem itens detalhados.</p>
                        )}

                        <div className="mt-2 flex justify-between border-t border-black/5 pt-2 text-[11px] font-semibold text-escuro">
                          <span>Total</span>
                          <span>{p.total != null ? formatarBRL(p.total) : "—"}</span>
                        </div>

                        {/* Notas fiscais vinculadas (numero + data) */}
                        {p.notasFiscais.length > 0 && (
                          <div className="mt-2 border-t border-black/5 pt-2">
                            <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-medio/40">
                              <FileText className="h-3 w-3" /> Notas fiscais
                            </p>
                            <ul className="space-y-0.5 text-[11px] text-medio/60">
                              {p.notasFiscais.map((n) => (
                                <li key={n.id}>
                                  <span className="font-mono font-semibold text-medio/80">{n.numero}</span>
                                  {" · "}
                                  {dataBR(n.dataNF)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Rastreio(s) do negocio de origem */}
                        {p.rastreios.length > 0 && (
                          <div className="mt-2 border-t border-black/5 pt-2">
                            <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-medio/40">
                              <Truck className="h-3 w-3" /> Rastreio
                            </p>
                            <ul className="space-y-0.5 text-[11px] text-medio/60">
                              {p.rastreios.map((r) => (
                                <li key={r.id}>
                                  <span className="font-mono text-medio/80">{r.codigo}</span>
                                  {r.transportadora ? ` · ${r.transportadora}` : ""}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

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
        </div>
      )}
    </section>
  );
}
