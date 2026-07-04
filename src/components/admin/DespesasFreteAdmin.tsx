"use client";

// Admin > Despesas de frete: fretes pagos PELA EMPRESA (despesa rastreavel),
// fora do total cobrado do cliente. Mostra de onde veio cada despesa (pedido,
// cliente, vendedor, finalidade, data) e o TOTAL do periodo. Fatia 2.76.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Truck, Loader2, ExternalLink } from "lucide-react";
import { Cabecalho } from "./VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatarBRL } from "@/lib/format";

type Despesa = {
  negocioId: string;
  leadId: string | null;
  cliente: string;
  valor: number;
  data: string | null;
  finalidade: string;
  vendedor: string | null;
};

const PERIODOS = [
  { v: "", r: "Todo o periodo" },
  { v: "hoje", r: "Hoje" },
  { v: "semana", r: "7 dias" },
  { v: "15d", r: "15 dias" },
  { v: "mes", r: "30 dias" },
];

function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function DespesasFreteAdmin() {
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [total, setTotal] = useState(0);
  const [quantidade, setQuantidade] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [periodo, setPeriodo] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const p = new URLSearchParams();
      if (periodo) p.set("periodo", periodo);
      const r = await fetch(`/api/despesas-frete?${p.toString()}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setDespesas(d.despesas ?? []);
      setTotal(d.total ?? 0);
      setQuantidade(d.quantidade ?? 0);
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Cabecalho
        titulo="Despesas de frete"
        subtitulo="Fretes pagos pela empresa (despesa) — fora do total cobrado do cliente."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="campo"
        >
          {PERIODOS.map((f) => (
            <option key={f.v} value={f.v}>
              {f.r}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 rounded-xl border border-black/5 bg-white px-4 py-2">
          <Truck className="h-4 w-4 text-tiffany" />
          <div>
            <p className="text-[11px] uppercase tracking-wide text-medio/50">
              Total no periodo ({quantidade})
            </p>
            <p className="text-lg font-bold text-escuro">{formatarBRL(total)}</p>
          </div>
        </div>
      </div>

      {erro ? (
        <EstadoErro mensagem="Nao foi possivel carregar as despesas." onRetry={carregar} />
      ) : carregando ? (
        <div className="flex items-center justify-center py-16 text-medio/50">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : despesas.length === 0 ? (
        <EmptyState
          icone={Truck}
          titulo="Nenhuma despesa de frete"
          texto="Fretes marcados como 'pago pela empresa' no fechamento aparecem aqui."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/5 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-[11px] uppercase tracking-wide text-medio/50">
                <th className="px-3 py-2 font-semibold">Cliente</th>
                <th className="px-3 py-2 font-semibold">Vendedor</th>
                <th className="px-3 py-2 font-semibold">Finalidade</th>
                <th className="px-3 py-2 font-semibold">Data</th>
                <th className="px-3 py-2 text-right font-semibold">Frete (despesa)</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {despesas.map((d) => (
                <tr key={d.negocioId} className="border-b border-black/5 last:border-0">
                  <td className="px-3 py-2 text-escuro">{d.cliente}</td>
                  <td className="px-3 py-2 text-medio/70">{d.vendedor ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[11px] font-medium text-medio/70">
                      {d.finalidade === "POS_VENDA" ? "Pos-venda" : "Venda"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-medio/70">{dataCurta(d.data)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-escuro">
                    {formatarBRL(d.valor)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {d.leadId && (
                      <Link
                        href={`/inbox?lead=${d.leadId}`}
                        title="Abrir conversa do cliente"
                        className="inline-flex rounded p-1 text-medio/50 transition-colors hover:bg-black/5 hover:text-tiffany"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
