"use client";

// Link de pagamento Mercado Pago do orcamento (Fase 3 — Bloco 3). Gera o link
// (Checkout Pro) via /gerar-cobranca, deixa copiar e enviar no WhatsApp, e mostra
// o STATUS (Pendente ambar / Pago verde). Se o valor mudou apos gerar, permite
// gerar um novo link. Padrao da casa (dark, tiffany, Lucide).
import { useCallback, useEffect, useState } from "react";
import { Loader2, Link2, Copy, Check, Send, CreditCard } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { formatarBRL } from "@/lib/format";
import type { MensagemItem } from "@/components/inbox/tipos";

type Pagamento = {
  status: string; // pendente | pago | cancelado | erro
  initPoint: string | null;
  referencia: string | null;
  valor: number | null;
  pagoEm: string | null;
};

function SeloStatus({ status }: { status: string }) {
  const pago = status === "pago";
  const cor = pago
    ? "bg-green-600/10 text-green-600"
    : status === "pendente"
      ? "bg-amber-500/10 text-amber-600"
      : "bg-black/5 text-medio/60";
  const rotulo =
    status === "pago"
      ? "Pago"
      : status === "pendente"
        ? "Pendente"
        : status === "cancelado"
          ? "Cancelado"
          : "Erro";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cor}`}>
      {rotulo}
    </span>
  );
}

export function SecaoLinkPagamento({
  negocioId,
  totalFinal,
  temItens,
  onMensagemEnviada,
}: {
  negocioId: string;
  totalFinal: number;
  temItens: boolean;
  onMensagemEnviada?: (msg: MensagemItem) => void;
}) {
  const toast = useToast();
  const [pag, setPag] = useState<Pagamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/negocios/${negocioId}/gerar-cobranca`);
      if (r.ok) {
        const d = await r.json();
        setPag(d.pagamento ?? null);
      }
    } catch {
      // silencioso — pagamento nunca quebra o painel
    } finally {
      setCarregando(false);
    }
  }, [negocioId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function gerar() {
    if (gerando) return;
    setGerando(true);
    try {
      const r = await fetch(`/api/negocios/${negocioId}/gerar-cobranca`, { method: "POST" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) {
        toast.erro(d?.erro ?? "Não foi possível gerar o link de pagamento.");
        return;
      }
      await carregar();
      toast.sucesso(d.reaproveitado ? "Link de pagamento pronto." : "Link de pagamento gerado.");
    } catch {
      toast.erro("Falha de conexão ao gerar o link.");
    } finally {
      setGerando(false);
    }
  }

  async function copiar() {
    if (!pag?.initPoint) return;
    try {
      await navigator.clipboard.writeText(pag.initPoint);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.erro("Não foi possível copiar.");
    }
  }

  async function enviarWhatsApp() {
    if (enviando || !pag?.initPoint) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/negocios/${negocioId}/enviar-cobranca`, { method: "POST" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) {
        toast.erro(d?.erro ?? "Não foi possível enviar o link.");
        return;
      }
      if (d.mensagem) onMensagemEnviada?.(d.mensagem as MensagemItem);
      toast.sucesso("Link enviado ao cliente.");
    } catch {
      toast.erro("Falha de conexão ao enviar.");
    } finally {
      setEnviando(false);
    }
  }

  const podeGerar = temItens && totalFinal > 0;
  // Valor mudou apos gerar? Oferece regenerar (sem sobrescrever silenciosamente).
  const valorMudou =
    pag != null &&
    pag.status !== "pago" &&
    pag.valor != null &&
    Math.abs(pag.valor - totalFinal) > 0.005;

  return (
    <div className="space-y-2 rounded-lg border border-black/5 bg-fundo/50 p-2.5">
      <div className="flex items-center gap-2">
        <p className="flex flex-1 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-medio/50">
          <CreditCard className="h-3.5 w-3.5" /> Link de pagamento
        </p>
        {carregando ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-tiffany" />
        ) : (
          pag && <SeloStatus status={pag.status} />
        )}
      </div>

      {/* Sem cobranca ainda: botao gerar. */}
      {!carregando && !pag && (
        <button
          type="button"
          onClick={() => void gerar()}
          disabled={!podeGerar || gerando}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-tiffany bg-tiffany/5 px-3 py-2 text-sm font-semibold text-tiffany transition-colors hover:bg-tiffany/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Gerar link de pagamento
        </button>
      )}

      {/* Cobranca existente. */}
      {pag && (
        <div className="space-y-2">
          {pag.valor != null && (
            <p className="text-[11px] text-medio/60">
              {pag.referencia ? <span className="font-mono">{pag.referencia}</span> : null}
              {pag.referencia ? " · " : ""}
              {formatarBRL(pag.valor)}
              {pag.status === "pago" && pag.pagoEm
                ? ` · pago em ${new Date(pag.pagoEm).toLocaleDateString("pt-BR")}`
                : ""}
            </p>
          )}

          {pag.initPoint && (
            <div className="flex items-center gap-1.5">
              <input
                readOnly
                value={pag.initPoint}
                onFocus={(e) => e.currentTarget.select()}
                className="campo w-full min-w-0 flex-1 text-[11px] text-medio/70"
              />
              <button
                type="button"
                onClick={() => void copiar()}
                title="Copiar link"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/10 text-medio/70 hover:bg-black/5"
              >
                {copiado ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}

          {pag.status !== "pago" && pag.initPoint && (
            <button
              type="button"
              onClick={() => void enviarWhatsApp()}
              disabled={enviando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-60"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar link no WhatsApp
            </button>
          )}

          {/* Valor mudou -> permite gerar novo link (nao sobrescreve sozinho). */}
          {valorMudou && (
            <button
              type="button"
              onClick={() => void gerar()}
              disabled={gerando || !podeGerar}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
            >
              {gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              O total mudou — gerar novo link ({formatarBRL(totalFinal)})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
