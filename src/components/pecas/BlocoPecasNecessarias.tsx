"use client";

// Bloco de pecas no ATENDIMENTO (Fatia 3.06). Nucleo reutilizavel PecasEditor:
// - modo NEGOCIO ("Pecas necessarias"): planejamento; nao move estoque; select do
//   modelo do produto do cliente (salvo no negocio).
// - modo LOCAL ("Pecas aplicadas", Bloco 5): move estoque na hora; modelo fixo do
//   ItemLocal.
// Ambos: adicionar peca (filtrada pelo modelo, com preco+estoque), qtd, garantia,
// lista com total das cobraveis, remover. Padrao visual dos blocos do painel.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Wrench, Loader2, Plus, X, ShieldCheck, Search, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { formatarBRL } from "@/lib/format";

type PecaCatalogo = {
  id: string;
  nome: string;
  categoria: string | null;
  modelo: string | null;
  precoSugerido: number | null;
  estoque: number;
  estoqueMinimo: number | null;
  ativo: boolean;
};

type Uso = {
  id: string;
  quantidade: number;
  garantia: boolean;
  pecaId: string;
  nome: string;
  modelo: string | null;
  precoSugerido: number | null;
  estoque: number;
};

export type PecasEditorProps = {
  titulo: string;
  listUrl: string;
  addUrl: string;
  removeUrl: (usoId: string) => string;
  // Modelo: editavel (negocio, com select + salvar) ou fixo (local, do ItemLocal).
  modeloEditavel: boolean;
  modeloFixo?: string | null;
  salvarModelo?: (modelo: string | null) => Promise<boolean>;
  // Local move estoque na hora -> mostra aviso e refaz a leitura apos mutacao.
  movimentaEstoque: boolean;
  onMudou?: () => void;
};

const SEM_MODELO = "";

export function PecasEditor({
  titulo,
  listUrl,
  addUrl,
  removeUrl,
  modeloEditavel,
  modeloFixo = null,
  salvarModelo,
  movimentaEstoque,
  onMudou,
}: PecasEditorProps) {
  const toast = useToast();
  const [catalogo, setCatalogo] = useState<PecaCatalogo[]>([]);
  const [usos, setUsos] = useState<Uso[] | null>(null);
  const [modelo, setModelo] = useState<string>(modeloFixo ?? SEM_MODELO);
  const [salvandoModelo, setSalvandoModelo] = useState(false);

  // Formulario de adicao.
  const [buscaAdd, setBuscaAdd] = useState("");
  const [pecaSel, setPecaSel] = useState<PecaCatalogo | null>(null);
  const [qtd, setQtd] = useState(1);
  const [garantia, setGarantia] = useState(false);
  const [salvandoAdd, setSalvandoAdd] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  // Catalogo de pecas ativas (para o typeahead e os modelos distintos).
  useEffect(() => {
    let vivo = true;
    fetch("/api/pecas")
      .then((r) => (r.ok ? r.json() : { itens: [] }))
      .then((d) => {
        if (vivo) setCatalogo(d.itens ?? []);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  const carregarLista = useCallback(async () => {
    try {
      const r = await fetch(listUrl);
      if (r.ok) {
        const d = await r.json();
        setUsos(d.pecas ?? []);
        if (modeloEditavel && typeof d.modeloProdutoCliente !== "undefined") {
          setModelo(d.modeloProdutoCliente ?? SEM_MODELO);
        }
      } else {
        setUsos([]);
      }
    } catch {
      setUsos([]);
    }
  }, [listUrl, modeloEditavel]);

  useEffect(() => {
    void carregarLista();
  }, [carregarLista]);

  // Modelos distintos do catalogo (nao-vazios, ordenados) para o select.
  const modelos = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalogo) if (p.modelo && p.modelo.trim()) set.add(p.modelo.trim());
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [catalogo]);

  // Modelo efetivo do filtro: no negocio e o selecionado; no local, o fixo do item.
  const modeloFiltro = modeloEditavel ? modelo : (modeloFixo ?? SEM_MODELO);

  // Pecas compativeis: sem modelo selecionado -> todas; senao as do modelo + as
  // genericas (sem modelo). Filtradas tambem pela busca (nome/modelo).
  const compativeis = useMemo(() => {
    const termo = buscaAdd.trim().toLowerCase();
    return catalogo
      .filter((p) => p.ativo)
      .filter((p) => {
        if (!modeloFiltro) return true;
        return !p.modelo || p.modelo.trim() === modeloFiltro;
      })
      .filter((p) => {
        if (!termo) return true;
        return (
          p.nome.toLowerCase().includes(termo) ||
          (p.modelo ?? "").toLowerCase().includes(termo)
        );
      })
      .slice(0, 40);
  }, [catalogo, modeloFiltro, buscaAdd]);

  async function aoSalvarModelo(novo: string) {
    if (!salvarModelo) return;
    setModelo(novo);
    setSalvandoModelo(true);
    const ok = await salvarModelo(novo || null);
    setSalvandoModelo(false);
    if (!ok) toast.erro("Nao foi possivel salvar o modelo.");
  }

  async function adicionar() {
    if (!pecaSel) return;
    setSalvandoAdd(true);
    try {
      const r = await fetch(addUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pecaId: pecaSel.id, quantidade: qtd, garantia }),
      });
      if (!r.ok) {
        toast.erro("Nao foi possivel adicionar a peca.");
        return;
      }
      setPecaSel(null);
      setBuscaAdd("");
      setQtd(1);
      setGarantia(false);
      await carregarLista();
      onMudou?.();
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setSalvandoAdd(false);
    }
  }

  async function remover(usoId: string) {
    setRemovendo(usoId);
    // Otimista na lista; se falhar, recarrega.
    setUsos((prev) => (prev ? prev.filter((u) => u.id !== usoId) : prev));
    try {
      const r = await fetch(removeUrl(usoId), { method: "DELETE" });
      if (!r.ok) throw new Error();
      onMudou?.();
      if (movimentaEstoque) await carregarLista();
    } catch {
      toast.erro("Nao foi possivel remover.");
      await carregarLista();
    } finally {
      setRemovendo(null);
    }
  }

  const totalCobraveis = (usos ?? [])
    .filter((u) => !u.garantia)
    .reduce((acc, u) => acc + u.quantidade * (u.precoSugerido ?? 0), 0);

  return (
    <section className="space-y-3 rounded-xl border border-black/5 bg-white p-4">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
        <Wrench className="h-3.5 w-3.5" /> {titulo}
        {usos === null && <Loader2 className="h-3 w-3 animate-spin text-tiffany" />}
      </h4>

      {/* Modelo do produto do cliente */}
      {modeloEditavel ? (
        <label className="flex items-center gap-2 text-xs text-medio/70">
          <span className="shrink-0">Modelo do produto do cliente</span>
          <select
            value={modelo}
            onChange={(e) => void aoSalvarModelo(e.target.value)}
            className="campo min-w-0 flex-1"
          >
            <option value="">Nao informado</option>
            {modelos.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          {salvandoModelo && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-tiffany" />}
        </label>
      ) : (
        modeloFixo && (
          <p className="text-xs text-medio/60">
            Modelo do item: <span className="text-escuro">{modeloFixo}</span>
          </p>
        )
      )}

      {movimentaEstoque && (
        <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-500/10">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          Adicionar uma peca aqui da baixa no estoque na hora; remover devolve.
        </p>
      )}

      {/* Lista das pecas */}
      {usos && usos.length > 0 && (
        <ul className="space-y-1.5">
          {usos.map((u) => {
            const insuf = u.quantidade > u.estoque;
            return (
              <li
                key={u.id}
                className="flex items-center gap-2 rounded-lg border border-black/5 bg-fundo px-2.5 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-escuro">
                    <span className="text-medio/60">{u.quantidade}x </span>
                    {u.nome}
                    {u.modelo && <span className="text-medio/50"> {u.modelo}</span>}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {u.garantia ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-tiffany">
                        <ShieldCheck className="h-3 w-3" /> Garantia
                      </span>
                    ) : (
                      <span className="text-[11px] text-medio/50">
                        {u.precoSugerido != null
                          ? formatarBRL(u.quantidade * u.precoSugerido)
                          : "—"}
                      </span>
                    )}
                    {insuf && (
                      <span className="rounded bg-erro/10 px-1.5 py-0.5 text-[10px] font-semibold text-erro">
                        estoque insuficiente
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => void remover(u.id)}
                  disabled={removendo === u.id}
                  title="Remover"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-medio/50 hover:bg-black/5 hover:text-erro disabled:opacity-50"
                >
                  {removendo === u.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {usos && usos.length === 0 && (
        <p className="text-xs text-medio/50">Nenhuma peca adicionada ainda.</p>
      )}

      {usos && usos.length > 0 && totalCobraveis > 0 && (
        <div className="flex items-center justify-between border-t border-black/5 pt-2 text-xs">
          <span className="text-medio/60">Total (cobraveis)</span>
          <span className="font-semibold text-escuro">{formatarBRL(totalCobraveis)}</span>
        </div>
      )}

      {/* Adicionar peca */}
      {pecaSel ? (
        <div className="space-y-2 rounded-lg border border-tiffany/30 bg-tiffany/[0.03] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-escuro">
              {[pecaSel.nome, pecaSel.modelo].filter(Boolean).join(" ")}
            </p>
            <span className="shrink-0 text-[11px] text-medio/50">
              estoque {pecaSel.estoque}
            </span>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex shrink-0 flex-col gap-0.5 text-[11px] text-medio/60">
              Qtd
              <input
                type="number"
                min="1"
                max="99"
                value={qtd}
                onChange={(e) => setQtd(Math.min(99, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
                className="campo w-14"
              />
            </label>
            <button
              type="button"
              onClick={() => setGarantia((g) => !g)}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                garantia ? "bg-tiffany/10 text-tiffany" : "text-medio/60 hover:bg-black/5"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Garantia
            </button>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                onClick={() => {
                  setPecaSel(null);
                  setGarantia(false);
                  setQtd(1);
                }}
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-medio hover:bg-black/5"
              >
                Cancelar
              </button>
              <button
                onClick={() => void adicionar()}
                disabled={salvandoAdd}
                className="flex items-center gap-1 rounded-lg bg-tiffany px-3 py-1.5 text-xs font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
              >
                {salvandoAdd ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Adicionar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-medio/40" />
            <input
              value={buscaAdd}
              onChange={(e) => setBuscaAdd(e.target.value)}
              placeholder="Adicionar peca (nome ou modelo)"
              className="campo w-full pl-8"
            />
          </div>
          {buscaAdd.trim() && (
            <div className="scroll-fino max-h-44 overflow-y-auto rounded-lg border border-black/5">
              {compativeis.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-medio/50">Nenhuma peca compativel.</p>
              ) : (
                compativeis.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPecaSel(p);
                      setBuscaAdd("");
                    }}
                    className="flex w-full items-center gap-2 border-b border-black/5 px-2.5 py-1.5 text-left last:border-0 hover:bg-black/[0.02]"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-escuro">
                      {p.nome}
                      {p.modelo && <span className="text-medio/50"> {p.modelo}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-medio/60">
                      {p.precoSugerido != null ? formatarBRL(p.precoSugerido) : "—"}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        p.estoque <= 0 ? "bg-erro/10 text-erro" : "bg-black/5 text-medio/70"
                      }`}
                    >
                      {p.estoque}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Wrapper NEGOCIO (Bloco 3): "Pecas necessarias" — planejamento, sem baixa.
export function BlocoPecasNecessarias({ negocioId }: { negocioId: string }) {
  const salvarModelo = useCallback(
    async (modelo: string | null): Promise<boolean> => {
      try {
        const r = await fetch(`/api/negocios/${negocioId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modeloProdutoCliente: modelo }),
        });
        return r.ok;
      } catch {
        return false;
      }
    },
    [negocioId],
  );

  return (
    <PecasEditor
      titulo="Pecas necessarias"
      listUrl={`/api/negocios/${negocioId}/pecas-necessarias`}
      addUrl={`/api/negocios/${negocioId}/pecas-necessarias`}
      removeUrl={(usoId) => `/api/negocios/${negocioId}/pecas-necessarias/${usoId}`}
      modeloEditavel
      salvarModelo={salvarModelo}
      movimentaEstoque={false}
    />
  );
}
