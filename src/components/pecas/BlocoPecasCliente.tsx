"use client";

// Bloco "Pecas do cliente" (Fatia 3.02) na ficha do cliente / painel de negocio.
// Lista, em somente leitura, as pecas de pedidos PoS-VENDA (ganhos) do cliente:
// data, peca, quantidade, valor e selo de Garantia. So aparece para quem tem
// acesso pos-venda e quando ha pecas (senao some). O historico da CONVERSA em si
// nao e duplicado aqui — isto e so o consumo de pecas.
import { useCallback, useEffect, useState } from "react";
import { Wrench, Loader2, ShieldCheck } from "lucide-react";
import { useAgente } from "@/components/shell/AgenteContext";
import { formatarBRL } from "@/lib/format";

type PecaCliente = {
  id: string;
  negocioId: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  subtotal: number;
  garantia: boolean;
  data: string | null;
};

function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function BlocoPecasCliente({ leadId }: { leadId: string }) {
  const agente = useAgente();
  const podePosVenda =
    !!agente &&
    (agente.papel === "ADMIN" ||
      agente.papel === "POS_VENDA" ||
      agente.acessoPosVenda);

  const [pecas, setPecas] = useState<PecaCliente[] | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/pecas`);
      if (r.ok) {
        const d = await r.json();
        setPecas(d.pecas ?? []);
      } else {
        setPecas([]);
      }
    } catch {
      setPecas([]);
    } finally {
      setCarregando(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (podePosVenda) void carregar();
  }, [podePosVenda, carregar]);

  if (!podePosVenda) return null;
  // Some quando nao ha pecas (secao de historico, sem valor quando vazia).
  if (!carregando && (!pecas || pecas.length === 0)) return null;

  return (
    <section className="space-y-3 rounded-xl border border-black/5 bg-white p-4">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
        <Wrench className="h-3.5 w-3.5" /> Pecas do cliente
        {carregando && <Loader2 className="h-3 w-3 animate-spin text-tiffany" />}
      </h4>

      {pecas && pecas.length > 0 && (
        <ul className="space-y-1.5">
          {pecas.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-lg border border-black/5 bg-fundo px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-escuro">
                  {p.quantidade > 1 && (
                    <span className="text-medio/60">{p.quantidade}x </span>
                  )}
                  {p.descricao}
                </p>
                <p className="text-[11px] text-medio/50">{dataCurta(p.data)}</p>
              </div>
              {p.garantia ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-tiffany/10 px-2 py-0.5 text-[10px] font-semibold text-tiffany">
                  <ShieldCheck className="h-3 w-3" /> Garantia
                </span>
              ) : (
                <span className="shrink-0 whitespace-nowrap text-sm font-medium text-escuro">
                  {formatarBRL(p.subtotal)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
