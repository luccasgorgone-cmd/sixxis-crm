"use client";

// Admin > Catalogo > "Casar com a Loja": grava `modelo` (grafia da Loja) e
// `categoria` padronizada nos 12 produtos vendidos no site. E o que o Ganho usa
// para casar o item do pedido da Loja com o produto do catalogo.
//
// SEMPRE mostra a SIMULACAO primeiro ("de -> para" dos 12). O botao Aplicar so
// habilita quando os 12 casam; faltando algum, a tela diz QUAIS e nao deixa
// gravar (a rota tem a mesma trava — 409 e nao grava nenhum).
import { useCallback, useEffect, useState } from "react";
import { Loader2, Check, AlertTriangle, ArrowRight, Link2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

type Linha = {
  id: string;
  nome: string;
  modeloAtual: string | null;
  modeloNovo: string;
  categoriaAtual: string | null;
  categoriaNova: string;
  muda: boolean;
};

type ItemCatalogo = {
  id: string;
  nome: string;
  modelo: string | null;
  categoria: string | null;
};

type Simulacao = {
  linhas: Linha[];
  faltando: string[];
  duplicados: string[];
  esperados: number;
  casados: number;
  mudariam: number;
  ok: boolean;
  catalogo?: ItemCatalogo[];
};

function De({ valor }: { valor: string | null }) {
  return (
    <span className={valor ? "text-medio/70" : "text-medio/40"}>{valor || "—"}</span>
  );
}

export function CasarLoja({ onAplicado }: { onAplicado?: () => void }) {
  const toast = useToast();
  const [sim, setSim] = useState<Simulacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/admin/catalogo/casar-loja");
      if (r.ok) {
        setSim(await r.json());
        setErro(false);
      } else setErro(true);
    } catch {
      setErro(true);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function aplicar() {
    setAplicando(true);
    try {
      const r = await fetch("/api/admin/catalogo/casar-loja", { method: "POST" });
      const d = (await r.json()) as Simulacao & { erro?: string; aplicados?: number };
      setSim(d);
      if (r.ok) {
        toast.sucesso(`${d.aplicados ?? 0} produtos casados com a Loja.`);
        onAplicado?.();
      } else {
        toast.erro(d.erro ?? "Nada foi gravado.");
      }
    } catch {
      toast.erro("Nao foi possivel aplicar.");
    }
    setAplicando(false);
  }

  const podeAplicar = !!sim?.ok && !aplicando;

  return (
    <div className="mb-5 rounded-xl border border-black/5 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-escuro">
            <Link2 className="h-4 w-4 text-tiffany" /> Casar com a Loja
          </p>
          <p className="mt-0.5 text-xs text-medio/60">
            Grava o modelo e padroniza a categoria dos {sim?.esperados ?? 12} produtos
            vendidos no site. E o que permite o Ganho puxar o pedido da Loja.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {carregando ? (
            <Loader2 className="h-4 w-4 animate-spin text-medio/50" />
          ) : sim ? (
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                sim.ok
                  ? "bg-tiffany/10 text-tiffany"
                  : "bg-amber-50 text-amber-800 dark:bg-amber-500/10"
              }`}
            >
              {sim.ok ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {sim.casados}/{sim.esperados} ok
            </span>
          ) : null}
          <button
            onClick={() => setAberto((a) => !a)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-medio hover:bg-black/5"
          >
            {aberto ? "Ocultar" : "Ver de → para"}
          </button>
          <button
            onClick={() => void aplicar()}
            disabled={!podeAplicar}
            title={
              sim?.ok
                ? sim.mudariam === 0
                  ? "Ja esta tudo como deve ficar (aplicar nao muda nada)"
                  : `Grava ${sim.mudariam} produtos`
                : "Faltam produtos casando; corrija antes de aplicar"
            }
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aplicando && <Loader2 className="h-4 w-4 animate-spin" />}
            Aplicar
          </button>
        </div>
      </div>

      {erro && (
        <p className="mt-3 text-xs text-erro">
          Nao foi possivel carregar a simulacao.{" "}
          <button onClick={() => void carregar()} className="underline">
            Tentar de novo
          </button>
        </p>
      )}

      {/* Faltando / duplicado: nao ha o que aplicar ate resolver. */}
      {sim && !sim.ok && (
        <div className="mt-3 space-y-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10">
          {sim.faltando.length > 0 && (
            <div>
              <p className="font-semibold">
                Nao encontrados no catalogo ({sim.faltando.length}) — nada sera gravado:
              </p>
              <ul className="mt-1 list-inside list-disc">
                {sim.faltando.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {sim.duplicados.length > 0 && (
            <div>
              <p className="font-semibold">Nome duplicado no catalogo (ambiguo):</p>
              <ul className="mt-1 list-inside list-disc">
                {sim.duplicados.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {sim.catalogo && sim.catalogo.length > 0 && (
            <details>
              <summary className="cursor-pointer font-semibold">
                Nomes reais dos produtos no catalogo ({sim.catalogo.length})
              </summary>
              <ul className="mt-1 space-y-0.5">
                {sim.catalogo.map((c) => (
                  <li key={c.id}>
                    {c.nome}
                    <span className="text-amber-900/60">
                      {" "}
                      · modelo: {c.modelo || "—"} · categoria: {c.categoria || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Tabela "de -> para" (a simulacao). */}
      {aberto && sim && sim.linhas.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="text-medio/50">
                <th className="py-1.5 pr-3 font-medium">Produto</th>
                <th className="py-1.5 pr-3 font-medium">Modelo</th>
                <th className="py-1.5 font-medium">Categoria</th>
              </tr>
            </thead>
            <tbody>
              {sim.linhas.map((l) => (
                <tr key={l.id} className="border-t border-black/5">
                  <td className="py-1.5 pr-3 text-escuro">{l.nome}</td>
                  <td className="py-1.5 pr-3">
                    <span className="flex items-center gap-1">
                      <De valor={l.modeloAtual} />
                      <ArrowRight className="h-3 w-3 shrink-0 text-medio/40" />
                      <span className="font-medium text-escuro">{l.modeloNovo}</span>
                    </span>
                  </td>
                  <td className="py-1.5">
                    <span className="flex items-center gap-1">
                      <De valor={l.categoriaAtual} />
                      <ArrowRight className="h-3 w-3 shrink-0 text-medio/40" />
                      <span className="font-medium text-escuro">{l.categoriaNova}</span>
                    </span>
                    {!l.muda && <span className="ml-1 text-medio/40">(ja ok)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-medio/50">
            {sim.mudariam === 0
              ? "Nada a alterar — o catalogo ja esta casado."
              : `${sim.mudariam} produtos seriam alterados ao aplicar.`}
          </p>
        </div>
      )}
    </div>
  );
}
