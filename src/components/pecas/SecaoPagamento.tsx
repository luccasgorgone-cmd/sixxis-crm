"use client";

// Subsecao "Forma de pagamento" (Fatia 3.18). Controlada: recebe as linhas e um
// onChange; o PAI persiste (rascunho via PATCH orcPagamentos, ou snapshot no
// GANHO). Permite DIVIDIR (split) em varios metodos, com parcelamento nos
// metodos parcelaveis (Credito/Boleto). NAO altera o total — so descreve como
// paga; o resumo "Pago vs Total" e informativo (nao trava). Compacto (~383px).
import { CreditCard, Plus, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatarBRL } from "@/lib/format";
import {
  METODOS_PAGAMENTO,
  MAX_PARCELAS,
  ehParcelavel,
  somaPagamentos,
  type MetodoPagamentoCode,
  type LinhaPagamento,
} from "@/lib/pagamento";

// Linha na UI: valor pode ficar vazio (null) enquanto o usuario digita.
export type LinhaPagamentoUI = {
  metodo: MetodoPagamentoCode;
  valor: number | null;
  parcelas: number;
};

// Converte linhas persistidas (valor number) para o shape da UI.
export function paraUI(linhas: LinhaPagamento[]): LinhaPagamentoUI[] {
  return linhas.map((l) => ({
    metodo: l.metodo,
    valor: l.valor,
    parcelas: l.parcelas,
  }));
}

// Converte de volta para persistir (descarta linhas sem valor > 0).
export function paraPersistir(linhas: LinhaPagamentoUI[]): LinhaPagamento[] {
  return linhas
    .filter((l) => (l.valor ?? 0) > 0)
    .map((l) => ({
      metodo: l.metodo,
      valor: Math.round((l.valor ?? 0) * 100) / 100,
      parcelas: ehParcelavel(l.metodo) ? Math.max(1, Math.floor(l.parcelas || 1)) : 1,
    }));
}

function linhaVazia(): LinhaPagamentoUI {
  return { metodo: "PIX", valor: null, parcelas: 1 };
}

export function SecaoPagamento({
  linhas,
  onChange,
  totalFinal,
}: {
  linhas: LinhaPagamentoUI[];
  onChange: (linhas: LinhaPagamentoUI[]) => void;
  totalFinal: number;
}) {
  // Sempre exibe ao menos uma linha (a primeira) para editar.
  const visiveis = linhas.length > 0 ? linhas : [linhaVazia()];

  function mudarLinha(i: number, patch: Partial<LinhaPagamentoUI>) {
    const base = linhas.length > 0 ? linhas : visiveis;
    const proximo = base.map((l, idx) => {
      if (idx !== i) return l;
      const m = { ...l, ...patch };
      // Metodo nao-parcelavel forca parcelas=1.
      if (!ehParcelavel(m.metodo)) m.parcelas = 1;
      return m;
    });
    onChange(proximo);
  }

  function adicionar() {
    onChange([...visiveis, linhaVazia()]);
  }

  function remover(i: number) {
    const proximo = visiveis.filter((_, idx) => idx !== i);
    onChange(proximo.length > 0 ? proximo : [linhaVazia()]);
  }

  function preencherComTotal() {
    // So faz sentido com 1 linha: joga o total nela.
    if (visiveis.length !== 1) return;
    mudarLinha(0, { valor: totalFinal });
  }

  const pago = somaPagamentos(
    visiveis.map((l) => ({
      metodo: l.metodo,
      valor: l.valor ?? 0,
      parcelas: l.parcelas,
    })),
  );
  const diff = Math.round((totalFinal - pago) * 100) / 100;
  const bate = Math.abs(diff) < 0.01;
  const temAlgum = pago > 0;

  return (
    <div className="space-y-2 rounded-lg border border-black/5 bg-fundo/50 p-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-medio/50">
        <CreditCard className="h-3.5 w-3.5" /> Forma de pagamento
      </p>

      <div className="space-y-1.5">
        {visiveis.map((l, i) => {
          const parcelavel = ehParcelavel(l.metodo);
          return (
            <div key={i} className="flex items-center gap-1.5">
              <select
                value={l.metodo}
                onChange={(e) =>
                  mudarLinha(i, { metodo: e.target.value as MetodoPagamentoCode })
                }
                className="campo min-w-0 flex-1"
                aria-label="Método de pagamento"
              >
                {METODOS_PAGAMENTO.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={l.valor ?? ""}
                onChange={(e) =>
                  mudarLinha(i, {
                    valor: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                  })
                }
                placeholder="0,00"
                aria-label="Valor"
                className="campo w-20 shrink-0 text-right tabular-nums"
              />
              {parcelavel && (
                <select
                  value={l.parcelas}
                  onChange={(e) => mudarLinha(i, { parcelas: Number(e.target.value) })}
                  className="campo w-28 shrink-0"
                  aria-label="Parcelas"
                >
                  {Array.from({ length: MAX_PARCELAS }, (_, k) => k + 1).map((n) => (
                    <option key={n} value={n}>
                      {n === 1
                        ? "À vista"
                        : `${n}x de ${formatarBRL((l.valor ?? 0) / n)}`}
                    </option>
                  ))}
                </select>
              )}
              {visiveis.length > 1 && (
                <button
                  type="button"
                  onClick={() => remover(i)}
                  title="Remover forma"
                  aria-label="Remover forma de pagamento"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-medio/50 hover:bg-black/5 hover:text-erro"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={adicionar}
          className="flex items-center gap-1 text-[11px] font-medium text-tiffany hover:text-tiffany-escuro"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar forma de pagamento
        </button>
        {visiveis.length === 1 && !bate && totalFinal > 0 && (
          <button
            type="button"
            onClick={preencherComTotal}
            className="text-[11px] font-medium text-medio/60 hover:text-tiffany"
          >
            Preencher com o total
          </button>
        )}
      </div>

      {/* Resumo Pago vs Total — informativo, NAO trava. */}
      {temAlgum && (
        <div className="flex items-center justify-between gap-2 border-t border-black/5 pt-2 text-xs">
          <span className="min-w-0 truncate text-medio/60">
            Pago <span className="font-semibold tabular-nums text-escuro">{formatarBRL(pago)}</span>
            {" / "}Total <span className="tabular-nums">{formatarBRL(totalFinal)}</span>
          </span>
          {bate ? (
            <span className="flex items-center gap-1 font-semibold text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> confere
            </span>
          ) : (
            <span className="flex items-center gap-1 font-semibold text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {diff > 0 ? `faltam ${formatarBRL(diff)}` : `excede ${formatarBRL(-diff)}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
