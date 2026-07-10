"use client";

// Secao de FRETE do orcamento (Fase 2). Cota o frete na Loja (por transportadora)
// e aplica no rascunho. Dois modos:
//  - VENDA: itens do proprio orcamento (produtos do site). Calcula e aplica
//    AUTOMATICAMENTE a transportadora MAIS BARATA.
//  - POS_VENDA: o atendente informa peso+dimensoes da CAIXA; MOSTRA as duas
//    cotacoes (Braspress e Melhor Envio) e ELE CLICA na escolhida.
// TRAVA: frete nunca quebra o orcamento — falha/timeout mantem o campo manual.
import { useState } from "react";
import { Loader2, Truck, Calculator } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { formatarBRL } from "@/lib/format";

type Cotacao = {
  carrierId: string;
  transportadora: string;
  ok: boolean;
  preco: number | null;
  prazoDias: number | null;
  erro?: string;
};

type RespCotacao = {
  ok: boolean;
  precisaCep?: boolean;
  uf?: string | null;
  cotacoes?: Cotacao[];
  maisBarata?: { transportadora: string; preco: number; prazoDias: number | null } | null;
  mensagem?: string;
  cepDestino?: string;
};

function mascararCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

function prazoTxt(dias: number | null): string {
  if (!dias || dias <= 0) return "";
  return dias === 1 ? "1 dia útil" : `${dias} dias úteis`;
}

export function SecaoFrete({
  negocioId,
  modo,
  cepInicial,
  freteTransportadora,
  onAplicar,
}: {
  negocioId: string;
  modo: "VENDA" | "POS_VENDA";
  cepInicial?: string | null;
  // Transportadora atualmente aplicada no rascunho (para exibir o estado atual).
  freteTransportadora?: string | null;
  // Aplica a cotacao escolhida no rascunho (preco + nome). Persiste via o pai.
  onAplicar: (preco: number, transportadora: string) => void;
}) {
  const toast = useToast();
  const [cep, setCep] = useState(mascararCep(cepInicial ?? ""));
  // Dimensoes da caixa (so POS_VENDA).
  const [pesoKg, setPesoKg] = useState("");
  const [alturaCm, setAlturaCm] = useState("");
  const [larguraCm, setLarguraCm] = useState("");
  const [comprimentoCm, setComprimentoCm] = useState("");

  const [calculando, setCalculando] = useState(false);
  const [cotacoes, setCotacoes] = useState<Cotacao[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const ehPos = modo === "POS_VENDA";

  async function cotar() {
    if (calculando) return;
    setCalculando(true);
    setAviso(null);
    try {
      const cepDigits = cep.replace(/\D/g, "");
      const body: Record<string, unknown> = {};
      if (cepDigits.length === 8) body.cep = cepDigits;
      if (ehPos) {
        body.dimensoes = {
          pesoKg: Number(pesoKg),
          alturaCm: Number(alturaCm),
          larguraCm: Number(larguraCm),
          comprimentoCm: Number(comprimentoCm),
        };
      }
      const r = await fetch(`/api/negocios/${negocioId}/cotar-frete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d: RespCotacao = await r.json().catch(() => ({ ok: false }));

      if (d.cepDestino && cepDigits.length !== 8) setCep(mascararCep(d.cepDestino));

      if (!d.ok) {
        // Sem CEP / sem itens / loja off / falha — aviso e mantem o frete manual.
        setCotacoes(null);
        setAviso(d.mensagem || "Não foi possível cotar. Use o frete manual.");
        return;
      }

      const lista = (d.cotacoes ?? []).filter((c) => c);
      setCotacoes(lista);

      if (!ehPos) {
        // VENDA: aplica AUTOMATICO a mais barata.
        if (d.maisBarata) {
          onAplicar(d.maisBarata.preco, d.maisBarata.transportadora);
          toast.sucesso(
            `Frete: ${formatarBRL(d.maisBarata.preco)} via ${d.maisBarata.transportadora}`,
          );
        } else {
          setAviso("Nenhuma transportadora cotou este envio. Use o frete manual.");
        }
      }
      // POS_VENDA: nao aplica — o atendente clica na escolhida (abaixo).
    } catch {
      setCotacoes(null);
      setAviso("Falha ao cotar o frete. Use o frete manual.");
    } finally {
      setCalculando(false);
    }
  }

  function escolher(c: Cotacao) {
    if (!c.ok || c.preco == null) return;
    onAplicar(c.preco, c.transportadora);
    toast.sucesso(`Frete ${c.transportadora} aplicado: ${formatarBRL(c.preco)}`);
  }

  return (
    <div className="space-y-2 rounded-lg border border-tiffany/20 bg-tiffany/[0.03] p-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-tiffany/80">
        <Truck className="h-3.5 w-3.5" />
        {ehPos ? "Frete da caixa" : "Frete automático"}
      </p>

      {/* Dimensoes da caixa (POS_VENDA). */}
      {ehPos && (
        <div className="grid grid-cols-4 gap-1.5">
          <label className="col-span-1">
            <span className="mb-0.5 block text-[10px] text-medio/60">Peso kg</span>
            <input
              type="number" min="0" step="0.1" value={pesoKg}
              onChange={(e) => setPesoKg(e.target.value)}
              placeholder="0" className="campo w-full text-right text-xs"
            />
          </label>
          <label className="col-span-1">
            <span className="mb-0.5 block text-[10px] text-medio/60">Alt cm</span>
            <input
              type="number" min="0" step="1" value={alturaCm}
              onChange={(e) => setAlturaCm(e.target.value)}
              placeholder="0" className="campo w-full text-right text-xs"
            />
          </label>
          <label className="col-span-1">
            <span className="mb-0.5 block text-[10px] text-medio/60">Larg cm</span>
            <input
              type="number" min="0" step="1" value={larguraCm}
              onChange={(e) => setLarguraCm(e.target.value)}
              placeholder="0" className="campo w-full text-right text-xs"
            />
          </label>
          <label className="col-span-1">
            <span className="mb-0.5 block text-[10px] text-medio/60">Comp cm</span>
            <input
              type="number" min="0" step="1" value={comprimentoCm}
              onChange={(e) => setComprimentoCm(e.target.value)}
              placeholder="0" className="campo w-full text-right text-xs"
            />
          </label>
        </div>
      )}

      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-0.5 block text-[10px] text-medio/60">CEP destino</span>
          <input
            value={cep}
            onChange={(e) => setCep(mascararCep(e.target.value))}
            placeholder="00000-000"
            inputMode="numeric"
            className="campo w-full text-xs"
          />
        </label>
        <button
          type="button"
          onClick={() => void cotar()}
          disabled={calculando}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-60"
        >
          {calculando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Calculator className="h-3.5 w-3.5" />
          )}
          {ehPos ? "Cotar frete" : "Calcular frete"}
        </button>
      </div>

      {/* Estado atual aplicado (transportadora do rascunho). */}
      {freteTransportadora && (
        <p className="text-[11px] text-medio/70">
          Aplicado: <span className="font-semibold text-escuro">{freteTransportadora}</span>
        </p>
      )}

      {aviso && <p className="text-[11px] text-amber-600">{aviso}</p>}

      {/* POS_VENDA: lista das cotacoes por transportadora — clicar escolhe. */}
      {ehPos && cotacoes && cotacoes.length > 0 && (
        <ul className="space-y-1">
          {cotacoes.map((c) => {
            const aplicada = c.ok && c.transportadora === freteTransportadora;
            return (
              <li key={c.carrierId}>
                <button
                  type="button"
                  onClick={() => escolher(c)}
                  disabled={!c.ok || c.preco == null}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed ${
                    aplicada
                      ? "border-tiffany bg-tiffany/10"
                      : c.ok
                        ? "border-black/10 hover:border-tiffany/40 hover:bg-tiffany/[0.05]"
                        : "border-black/5 opacity-60"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-escuro">
                    {c.transportadora}
                    {aplicada && <span className="ml-1 text-tiffany">✓</span>}
                  </span>
                  {c.ok && c.preco != null ? (
                    <span className="shrink-0 text-right text-xs">
                      <span className="font-semibold text-escuro">{formatarBRL(c.preco)}</span>
                      {c.prazoDias ? (
                        <span className="ml-1 text-medio/50">{prazoTxt(c.prazoDias)}</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] text-erro/70">
                      {c.erro ? "indisponível" : "sem cotação"}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
