"use client";

// Seccao ORCAMENTO do atendimento (Fatia 3.07). Um so componente monta o
// orcamento na conversa: PECAS no pos-venda (com modelo do produto do cliente,
// garantia e estoque) e PRODUTOS na venda (busca simples, sem garantia/estoque).
// Reutilizado como "Pecas aplicadas" na aba Local (movimenta estoque na hora).
// Abaixo, "Orçamentos anteriores" lista o historico numerado do cliente.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wrench,
  ShoppingCart,
  Loader2,
  Plus,
  X,
  ShieldCheck,
  Search,
  AlertTriangle,
  ChevronRight,
  ReceiptText,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { formatarBRL } from "@/lib/format";

type ItemCatalogo = {
  id: string;
  nome: string;
  categoria: string | null;
  modelo: string | null;
  precoSugerido: number | null;
  estoque?: number;
  ativo?: boolean;
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

type EditorProps = {
  titulo: string;
  icone: "peca" | "carrinho";
  listUrl: string;
  addUrl: string;
  removeUrl: (usoId: string) => string;
  catalogoUrl: string; // /api/pecas (PECA+estoque) ou /api/catalogo?tipo=PRODUTO
  modeloEditavel: boolean;
  modeloFixo?: string | null;
  salvarModelo?: (modelo: string | null) => Promise<boolean>;
  mostrarGarantia: boolean;
  mostrarEstoque: boolean;
  movimentaEstoque: boolean;
  onMudou?: () => void;
};

const SEM_MODELO = "";

function EditorOrcamento({
  titulo,
  icone,
  listUrl,
  addUrl,
  removeUrl,
  catalogoUrl,
  modeloEditavel,
  modeloFixo = null,
  salvarModelo,
  mostrarGarantia,
  mostrarEstoque,
  movimentaEstoque,
  onMudou,
}: EditorProps) {
  const toast = useToast();
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [usos, setUsos] = useState<Uso[] | null>(null);
  const [modelo, setModelo] = useState<string>(modeloFixo ?? SEM_MODELO);
  const [salvandoModelo, setSalvandoModelo] = useState(false);

  const [buscaAdd, setBuscaAdd] = useState("");
  const [sel, setSel] = useState<ItemCatalogo | null>(null);
  const [qtd, setQtd] = useState(1);
  const [garantia, setGarantia] = useState(false);
  const [salvandoAdd, setSalvandoAdd] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(catalogoUrl)
      .then((r) => (r.ok ? r.json() : { itens: [] }))
      .then((d) => {
        if (vivo) setCatalogo(d.itens ?? []);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [catalogoUrl]);

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

  const modelos = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalogo) if (p.modelo && p.modelo.trim()) set.add(p.modelo.trim());
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [catalogo]);

  const modeloFiltro = modeloEditavel ? modelo : (modeloFixo ?? SEM_MODELO);

  // Compativeis: com filtro de modelo (pos-venda) mostra os do modelo + genericas;
  // sem filtro (venda) mostra todos. Sempre aplica a busca por nome/modelo.
  const compativeis = useMemo(() => {
    const termo = buscaAdd.trim().toLowerCase();
    return catalogo
      .filter((p) => p.ativo !== false)
      .filter((p) => {
        if (!modeloEditavel && !modeloFixo) return true; // venda: todos
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
  }, [catalogo, modeloEditavel, modeloFixo, modeloFiltro, buscaAdd]);

  async function aoSalvarModelo(novo: string) {
    if (!salvarModelo) return;
    setModelo(novo);
    setSalvandoModelo(true);
    const ok = await salvarModelo(novo || null);
    setSalvandoModelo(false);
    if (ok) toast.sucesso("Modelo salvo.");
    else toast.erro("Não foi possível salvar o modelo.");
  }

  async function adicionar() {
    if (!sel) return;
    setSalvandoAdd(true);
    try {
      const r = await fetch(addUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pecaId: sel.id, quantidade: qtd, garantia: mostrarGarantia && garantia }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Não foi possível adicionar o item.");
        return;
      }
      setSel(null);
      setBuscaAdd("");
      setQtd(1);
      setGarantia(false);
      await carregarLista();
      onMudou?.();
      toast.sucesso(mostrarGarantia ? "Peça adicionada ao orçamento." : "Produto adicionado ao orçamento.");
    } catch {
      toast.erro("Falha de conexão.");
    } finally {
      setSalvandoAdd(false);
    }
  }

  async function remover(usoId: string) {
    setRemovendo(usoId);
    setUsos((prev) => (prev ? prev.filter((u) => u.id !== usoId) : prev));
    try {
      const r = await fetch(removeUrl(usoId), { method: "DELETE" });
      if (!r.ok) throw new Error();
      onMudou?.();
      if (movimentaEstoque) await carregarLista();
      toast.sucesso("Item removido do orçamento.");
    } catch {
      toast.erro("Não foi possível remover.");
      await carregarLista();
    } finally {
      setRemovendo(null);
    }
  }

  const totalCobravel = (usos ?? [])
    .filter((u) => !u.garantia)
    .reduce((acc, u) => acc + u.quantidade * (u.precoSugerido ?? 0), 0);
  const totalGarantia = (usos ?? [])
    .filter((u) => u.garantia)
    .reduce((acc, u) => acc + u.quantidade * (u.precoSugerido ?? 0), 0);

  const Icone = icone === "peca" ? Wrench : ShoppingCart;

  return (
    <section className="space-y-3 rounded-xl border border-black/5 bg-white p-4">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
        <Icone className="h-3.5 w-3.5" /> {titulo}
        {usos === null && <Loader2 className="h-3 w-3 animate-spin text-tiffany" />}
      </h4>

      {modeloEditavel ? (
        <label className="flex items-center gap-2 text-xs text-medio/70">
          <span className="shrink-0">Produto do cliente</span>
          <select
            value={modelo}
            onChange={(e) => void aoSalvarModelo(e.target.value)}
            className="campo min-w-0 flex-1"
          >
            <option value="">Não informado</option>
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
          Adicionar aqui dá baixa no estoque na hora; remover devolve.
        </p>
      )}

      {usos && usos.length > 0 && (
        <ul className="space-y-1.5">
          {usos.map((u) => {
            const insuf = mostrarEstoque && u.quantidade > u.estoque;
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
                    {mostrarGarantia && u.garantia ? (
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
        <p className="text-xs text-medio/50">Nenhum item no orçamento ainda.</p>
      )}

      {usos && usos.length > 0 && (totalCobravel > 0 || totalGarantia > 0) && (
        <div className="space-y-0.5 border-t border-black/5 pt-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-medio/60">Total (cobrável)</span>
            <span className="font-semibold text-escuro">{formatarBRL(totalCobravel)}</span>
          </div>
          {mostrarGarantia && totalGarantia > 0 && (
            <div className="flex items-center justify-between text-medio/50">
              <span>Garantia (não cobrado)</span>
              <span className="line-through">{formatarBRL(totalGarantia)}</span>
            </div>
          )}
        </div>
      )}

      {/* Adicionar item */}
      {sel ? (
        <div className="space-y-2 rounded-lg border border-tiffany/30 bg-tiffany/[0.03] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-escuro">
              {[sel.nome, sel.modelo].filter(Boolean).join(" ")}
            </p>
            {mostrarEstoque && sel.estoque != null && (
              <span className="shrink-0 text-[11px] text-medio/50">estoque {sel.estoque}</span>
            )}
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
            {mostrarGarantia && (
              <button
                type="button"
                onClick={() => setGarantia((g) => !g)}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                  garantia ? "bg-tiffany/10 text-tiffany" : "text-medio/60 hover:bg-black/5"
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Garantia
              </button>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                onClick={() => {
                  setSel(null);
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
              placeholder={mostrarGarantia ? "Adicionar peça (nome ou modelo)" : "Adicionar produto"}
              className="campo w-full pl-8"
            />
          </div>
          {buscaAdd.trim() && (
            <div className="scroll-fino max-h-44 overflow-y-auto rounded-lg border border-black/5">
              {compativeis.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-medio/50">Nenhum item compatível.</p>
              ) : (
                compativeis.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSel(p);
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
                    {mostrarEstoque && p.estoque != null && (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          p.estoque <= 0 ? "bg-erro/10 text-erro" : "bg-black/5 text-medio/70"
                        }`}
                      >
                        {p.estoque}
                      </span>
                    )}
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

// Bloco ORCAMENTO no atendimento (negocio). PECAS (pos-venda) ou PRODUTOS (venda).
export function BlocoOrcamento({
  negocioId,
  finalidade,
}: {
  negocioId: string;
  finalidade: "VENDA" | "POS_VENDA";
}) {
  const ehPos = finalidade === "POS_VENDA";
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
    <EditorOrcamento
      titulo="Orçamento"
      icone={ehPos ? "peca" : "carrinho"}
      listUrl={`/api/negocios/${negocioId}/pecas-necessarias`}
      addUrl={`/api/negocios/${negocioId}/pecas-necessarias`}
      removeUrl={(usoId) => `/api/negocios/${negocioId}/pecas-necessarias/${usoId}`}
      catalogoUrl={ehPos ? "/api/pecas" : "/api/catalogo?tipo=PRODUTO"}
      modeloEditavel={ehPos}
      salvarModelo={ehPos ? salvarModelo : undefined}
      mostrarGarantia={ehPos}
      mostrarEstoque={ehPos}
      movimentaEstoque={false}
    />
  );
}

// Wrapper LOCAL (aba assistencia): "Pecas aplicadas" — move estoque na hora.
export function BlocoPecasLocal({
  itemLocalId,
  modelo,
  onMudou,
}: {
  itemLocalId: string;
  modelo?: string | null;
  onMudou?: () => void;
}) {
  return (
    <EditorOrcamento
      titulo="Peças aplicadas"
      icone="peca"
      listUrl={`/api/local/${itemLocalId}/pecas`}
      addUrl={`/api/local/${itemLocalId}/pecas`}
      removeUrl={(usoId) => `/api/local/${itemLocalId}/pecas/${usoId}`}
      catalogoUrl="/api/pecas"
      modeloEditavel={false}
      modeloFixo={modelo ?? null}
      mostrarGarantia
      mostrarEstoque
      movimentaEstoque
      onMudou={onMudou}
    />
  );
}

// ---------------------------------------------------------------------------
// "Orçamentos anteriores" (historico numerado do cliente). Colapsado por padrao.
// ---------------------------------------------------------------------------
type OrcamentoHist = {
  id: string;
  numeroFormatado: string;
  finalidade: string;
  decisao: string;
  total: number;
  totalGarantia: number | null;
  qtdItens: number;
  criadoEm: string;
  itens: {
    id: string;
    descricao: string;
    quantidade: number;
    valorUnitario: number;
    garantia: boolean;
  }[];
};

const DECISAO_META: Record<string, { rotulo: string; classe: string }> = {
  GANHO: { rotulo: "Ganho", classe: "text-green-600" },
  PENDENTE: { rotulo: "Pendente", classe: "text-amber-600" },
  PERDIDO: { rotulo: "Perdido", classe: "text-erro" },
};

export function OrcamentosAnteriores({ leadId }: { leadId: string }) {
  const [aberto, setAberto] = useState(false);
  const [orcs, setOrcs] = useState<OrcamentoHist[] | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto || orcs !== null) return;
    fetch(`/api/leads/${leadId}/orcamentos`)
      .then((r) => (r.ok ? r.json() : { orcamentos: [] }))
      .then((d) => setOrcs(d.orcamentos ?? []))
      .catch(() => setOrcs([]));
  }, [aberto, orcs, leadId]);

  return (
    <section className="rounded-xl border border-black/5 bg-white">
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <ReceiptText className="h-3.5 w-3.5 text-medio/50" />
        <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-medio/50">
          Orçamentos anteriores
        </span>
        <ChevronRight
          className={`h-4 w-4 text-medio/40 transition-transform ${aberto ? "rotate-90" : ""}`}
        />
      </button>

      {aberto && (
        <div className="px-4 pb-4">
          {orcs === null ? (
            <div className="flex justify-center py-4 text-medio/40">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : orcs.length === 0 ? (
            <p className="py-2 text-xs text-medio/50">Nenhum orçamento registrado ainda.</p>
          ) : (
            <ul className="space-y-1.5">
              {orcs.map((o) => {
                const dec = DECISAO_META[o.decisao] ?? { rotulo: o.decisao, classe: "text-medio" };
                const exp = expandido === o.id;
                return (
                  <li key={o.id} className="overflow-hidden rounded-lg border border-black/5 bg-fundo">
                    <button
                      onClick={() => setExpandido(exp ? null : o.id)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
                    >
                      <ChevronRight
                        className={`h-3.5 w-3.5 shrink-0 text-medio/40 transition-transform ${exp ? "rotate-90" : ""}`}
                      />
                      <span className="shrink-0 font-mono text-xs font-semibold text-escuro">
                        {o.numeroFormatado}
                      </span>
                      <span className="shrink-0 text-[11px] text-medio/50">
                        {new Date(o.criadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </span>
                      <span className={`shrink-0 text-[11px] font-semibold ${dec.classe}`}>
                        {dec.rotulo}
                      </span>
                      <span className="ml-auto shrink-0 text-xs font-medium text-escuro">
                        {formatarBRL(o.total)}
                      </span>
                    </button>
                    {exp && (
                      <ul className="space-y-1 border-t border-black/5 px-2.5 py-2 pl-7">
                        {o.itens.map((it) => (
                          <li key={it.id} className="flex items-center gap-2 text-[11px]">
                            <span className="min-w-0 flex-1 truncate text-medio/70">
                              <span className="text-medio/50">{it.quantidade}x </span>
                              {it.descricao}
                            </span>
                            {it.garantia ? (
                              <span className="flex shrink-0 items-center gap-0.5 text-tiffany">
                                <ShieldCheck className="h-3 w-3" /> Garantia
                              </span>
                            ) : (
                              <span className="shrink-0 text-medio/60">
                                {formatarBRL(it.quantidade * it.valorUnitario)}
                              </span>
                            )}
                          </li>
                        ))}
                        {o.totalGarantia != null && o.totalGarantia > 0 && (
                          <li className="pt-0.5 text-[11px] text-medio/40">
                            Garantia (não cobrado): {formatarBRL(o.totalGarantia)}
                          </li>
                        )}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
