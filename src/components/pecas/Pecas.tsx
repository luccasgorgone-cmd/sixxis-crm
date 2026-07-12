"use client";

// Aba Pecas (pos-venda): estoque de pecas do catalogo, agrupado por CATEGORIA e,
// dentro dela, por NOME (que expande os modelos). Admin edita/movimenta; usuario
// pos-venda ve tudo em somente leitura. Clique numa linha abre o historico.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wrench,
  Plus,
  Loader2,
  Pencil,
  ArrowLeftRight,
  Power,
  ChevronRight,
  X,
} from "lucide-react";
import { InputBusca } from "@/components/ui/InputBusca";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { EstadoErro } from "@/components/ui/Estado";
import { formatarBRL } from "@/lib/format";
import { invalidarCache } from "@/lib/cacheClient";

type Peca = {
  id: string;
  nome: string;
  categoria: string | null;
  modelo: string | null;
  voltagem: string | null;
  precoSugerido: number | null;
  estoque: number;
  estoqueMinimo: number | null;
  ativo: boolean;
  ordem: number;
};

// Peca abaixo do minimo (quando definido) ou com estoque negativo.
function estoqueBaixo(p: Peca): boolean {
  return p.estoque < 0 || (p.estoqueMinimo != null && p.estoque <= p.estoqueMinimo);
}

const SEM_CATEGORIA = "Sem categoria";

export function Pecas() {
  const toast = useToast();
  const [itens, setItens] = useState<Peca[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [categoria, setCategoria] = useState("");
  const [incluirInativas, setIncluirInativas] = useState(false);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const [editando, setEditando] = useState<Peca | "novo" | null>(null);
  const [movimentando, setMovimentando] = useState<Peca | null>(null);
  const [historico, setHistorico] = useState<Peca | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 250);
    return () => clearTimeout(t);
  }, [busca]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const p = new URLSearchParams();
      if (incluirInativas) p.set("incluirInativas", "1");
      const r = await fetch(`/api/pecas?${p.toString()}`);
      if (r.status === 403) {
        setErro("Você não tem acesso a esta área.");
        return;
      }
      if (!r.ok) throw new Error();
      const d = await r.json();
      setItens(d.itens ?? []);
      setPodeEditar(Boolean(d.podeEditar));
      setErro(null);
    } catch {
      setErro("Não foi possível carregar as pecas.");
    } finally {
      setCarregando(false);
    }
  }, [incluirInativas]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Categorias distintas (para o filtro), na ordem em que aparecem.
  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const i of itens) set.add(i.categoria ?? SEM_CATEGORIA);
    return [...set];
  }, [itens]);

  // Filtro (busca por nome/modelo + categoria) aplicado no cliente.
  const filtrados = useMemo(() => {
    const termo = buscaAplicada.trim().toLowerCase();
    return itens.filter((i) => {
      if (categoria && (i.categoria ?? SEM_CATEGORIA) !== categoria) return false;
      if (!termo) return true;
      return (
        i.nome.toLowerCase().includes(termo) ||
        (i.modelo ?? "").toLowerCase().includes(termo)
      );
    });
  }, [itens, buscaAplicada, categoria]);

  // Agrupa: categoria -> nome -> modelos (ordenado).
  const grupos = useMemo(() => {
    const porCategoria = new Map<string, Map<string, Peca[]>>();
    for (const i of filtrados) {
      const cat = i.categoria ?? SEM_CATEGORIA;
      if (!porCategoria.has(cat)) porCategoria.set(cat, new Map());
      const porNome = porCategoria.get(cat)!;
      if (!porNome.has(i.nome)) porNome.set(i.nome, []);
      porNome.get(i.nome)!.push(i);
    }
    return [...porCategoria.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
      .map(([cat, porNome]) => ({
        categoria: cat,
        nomes: [...porNome.entries()]
          .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
          .map(([nome, modelos]) => ({ nome, modelos })),
      }));
  }, [filtrados]);

  // Com busca ativa, tudo aberto para revelar os modelos que casaram.
  const buscaAtiva = buscaAplicada.trim().length > 0;
  const chaveGrupo = (cat: string, nome: string) => `${cat}|||${nome}`;
  const estaAberto = (cat: string, nome: string) =>
    buscaAtiva || abertos.has(chaveGrupo(cat, nome));
  function alternar(cat: string, nome: string) {
    const k = chaveGrupo(cat, nome);
    setAbertos((prev) => {
      const novo = new Set(prev);
      if (novo.has(k)) novo.delete(k);
      else novo.add(k);
      return novo;
    });
  }

  async function alternarAtivo(p: Peca) {
    setItens((prev) => prev.map((i) => (i.id === p.id ? { ...i, ativo: !i.ativo } : i)));
    try {
      const r = await fetch(`/api/pecas/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !p.ativo }),
      });
      if (!r.ok) throw new Error();
    } catch {
      toast.erro("Não foi possível atualizar.");
      await carregar();
    }
  }

  return (
    <div className="scroll-fino h-full space-y-4 overflow-y-auto p-4 md:p-6">
      {/* Cabecalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tiffany/10 text-tiffany">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-escuro">Peças</h2>
            <p className="text-sm text-medio/60">
              Estoque de peças ({filtrados.length}
              {filtrados.length === 1 ? " item" : " itens"})
            </p>
          </div>
        </div>
        {podeEditar && (
          <button
            onClick={() => setEditando("novo")}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro"
          >
            <Plus className="h-4 w-4" /> Nova peça
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <InputBusca
          valor={busca}
          onChange={setBusca}
          placeholder="Buscar nome ou modelo"
          className="min-w-0 flex-1 sm:w-60 sm:flex-none"
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="campo"
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {podeEditar && (
          <label className="flex items-center gap-1.5 text-xs font-medium text-medio/70">
            <input
              type="checkbox"
              checked={incluirInativas}
              onChange={(e) => setIncluirInativas(e.target.checked)}
              className="h-3.5 w-3.5 accent-tiffany"
            />
            Incluir inativas
          </label>
        )}
      </div>

      {/* Lista */}
      {erro ? (
        <EstadoErro mensagem={erro} onRetry={carregar} />
      ) : carregando ? (
        <div className="flex items-center justify-center py-16 text-medio/50">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : grupos.length === 0 ? (
        <EmptyState icone={Wrench} titulo="Nenhuma peça" texto="Ajuste a busca ou o filtro de categoria." />
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => (
            <div key={g.categoria}>
              <h3 className="mb-1.5 flex items-center gap-2 px-0.5 text-xs font-semibold uppercase tracking-wide text-medio/50">
                {g.categoria}
                <span className="text-medio/30">·</span>
                <span className="font-normal normal-case tracking-normal text-medio/40">
                  {g.nomes.reduce((acc, n) => acc + n.modelos.length, 0)}
                </span>
              </h3>
              <div className="overflow-hidden rounded-lg border border-black/5 bg-white">
                {g.nomes.map(({ nome, modelos }, idx) => {
                  const aberto = estaAberto(g.categoria, nome);
                  const algumBaixo = modelos.some(estoqueBaixo);
                  return (
                    <div
                      key={nome}
                      className={idx > 0 ? "border-t border-black/5" : ""}
                    >
                      {/* Cabecalho do nome (expande os modelos) */}
                      <button
                        onClick={() => alternar(g.categoria, nome)}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-black/[0.02]"
                      >
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 text-medio/40 transition-transform ${aberto ? "rotate-90" : ""}`}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-escuro">
                          {nome}
                        </span>
                        {algumBaixo && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-erro" title="Estoque baixo" />
                        )}
                        <span className="shrink-0 text-xs text-medio/40">
                          {modelos.length}
                        </span>
                      </button>

                      {/* Modelos */}
                      {aberto && (
                        <div className="bg-fundo/40">
                          {modelos.map((p) => (
                            <LinhaModelo
                              key={p.id}
                              peca={p}
                              podeEditar={podeEditar}
                              onHistorico={() => setHistorico(p)}
                              onEditar={() => setEditando(p)}
                              onMovimentar={() => setMovimentando(p)}
                              onAlternarAtivo={() => void alternarAtivo(p)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <ModalPeca
          peca={editando === "novo" ? null : editando}
          categorias={categorias.filter((c) => c !== SEM_CATEGORIA)}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            void carregar();
          }}
          toast={toast}
        />
      )}
      {movimentando && (
        <ModalMovimentar
          peca={movimentando}
          onFechar={() => setMovimentando(null)}
          onSalvo={() => {
            setMovimentando(null);
            void carregar();
          }}
          toast={toast}
        />
      )}
      {historico && (
        <DrawerHistorico peca={historico} onFechar={() => setHistorico(null)} />
      )}
    </div>
  );
}

function LinhaModelo({
  peca,
  podeEditar,
  onHistorico,
  onEditar,
  onMovimentar,
  onAlternarAtivo,
}: {
  peca: Peca;
  podeEditar: boolean;
  onHistorico: () => void;
  onEditar: () => void;
  onMovimentar: () => void;
  onAlternarAtivo: () => void;
}) {
  const baixo = estoqueBaixo(peca);
  return (
    <div
      onClick={onHistorico}
      className={`flex cursor-pointer items-center gap-2 border-t border-black/5 px-3 py-2 pl-9 transition-colors hover:bg-black/[0.02] ${
        peca.ativo ? "" : "opacity-50"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-escuro">
          {peca.modelo || peca.nome}
          {peca.voltagem && (
            <span className="ml-1.5 rounded bg-tiffany/10 px-1 py-0.5 text-[10px] font-semibold text-tiffany">
              {peca.voltagem}
            </span>
          )}
          {!peca.ativo && <span className="ml-1.5 text-[11px] text-medio/50">inativo</span>}
        </p>
      </div>
      <span className="shrink-0 whitespace-nowrap text-sm text-medio/70">
        {peca.precoSugerido != null ? formatarBRL(peca.precoSugerido) : "—"}
      </span>
      <span
        className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold ${
          baixo ? "bg-erro/10 text-erro" : "bg-black/5 text-medio/70"
        }`}
        title={peca.estoqueMinimo != null ? `Minimo: ${peca.estoqueMinimo}` : undefined}
      >
        {peca.estoque}
      </span>
      {podeEditar && (
        <div className="flex shrink-0 items-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMovimentar();
            }}
            title="Movimentar estoque"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-medio/50 hover:bg-black/5 hover:text-tiffany"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditar();
            }}
            title="Editar"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-medio/50 hover:bg-black/5 hover:text-escuro"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAlternarAtivo();
            }}
            title={peca.ativo ? "Desativar" : "Ativar"}
            className={`flex h-7 w-7 items-center justify-center rounded-lg hover:bg-black/5 ${
              peca.ativo ? "text-medio/50 hover:text-erro" : "text-tiffany"
            }`}
          >
            <Power className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function ModalPeca({
  peca,
  categorias,
  onFechar,
  onSalvo,
  toast,
}: {
  peca: Peca | null;
  categorias: string[];
  onFechar: () => void;
  onSalvo: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [nome, setNome] = useState(peca?.nome ?? "");
  const [categoria, setCategoria] = useState(peca?.categoria ?? "");
  const [modelo, setModelo] = useState(peca?.modelo ?? "");
  const [voltagem, setVoltagem] = useState(peca?.voltagem ?? "");
  const [preco, setPreco] = useState(peca?.precoSugerido != null ? String(peca.precoSugerido) : "");
  const [estoqueMinimo, setEstoqueMinimo] = useState(
    peca?.estoqueMinimo != null ? String(peca.estoqueMinimo) : "",
  );
  const [ativo, setAtivo] = useState(peca?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  // Duplicata (409): mensagem e, quando a existente esta inativa, id para reativar.
  const [erroDup, setErroDup] = useState<{ msg: string; inativaId?: string } | null>(null);
  const [reativando, setReativando] = useState(false);

  async function reativar(inativaId: string) {
    setReativando(true);
    try {
      const r = await fetch(`/api/pecas/${inativaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: true }),
      });
      if (!r.ok) throw new Error();
      toast.sucesso("Peca reativada.");
      onSalvo();
    } catch {
      toast.erro("Não foi possível reativar.");
    } finally {
      setReativando(false);
    }
  }

  async function salvar() {
    if (!nome.trim()) {
      toast.erro("Informe o nome.");
      return;
    }
    setErroDup(null);
    setSalvando(true);
    const corpo = {
      nome: nome.trim(),
      categoria: categoria.trim() || null,
      modelo: modelo.trim() || null,
      voltagem: voltagem || null,
      precoSugerido: preco.trim() === "" ? null : Number(preco),
      estoqueMinimo: estoqueMinimo.trim() === "" ? null : Number(estoqueMinimo),
      ...(peca ? { ativo } : {}),
    };
    try {
      const r = peca
        ? await fetch(`/api/pecas/${peca.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpo),
          })
        : await fetch("/api/pecas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpo),
          });
      if (r.status === 409) {
        const d = await r.json().catch(() => null);
        setErroDup({
          msg: d?.erro ?? "Peca ja cadastrada.",
          inativaId: d?.inativaId,
        });
        return;
      }
      if (!r.ok) {
        toast.erro("Não foi possível salvar.");
        return;
      }
      // Catalogo mudou -> invalida o cache do orcamento (Fatia L).
      invalidarCache("/api/pecas");
      onSalvo();
    } catch {
      toast.erro("Falha de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in scroll-fino max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-escuro">
            {peca ? "Editar peça" : "Nova peça"}
          </h3>
          <button onClick={onFechar} className="rounded-lg p-1 text-medio/60 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-medio/70">Nome *</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="campo w-full"
              placeholder="Ex.: Bomba d'agua"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-medio/70">Categoria</span>
              <input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                list="pecas-categorias"
                className="campo w-full"
                placeholder="Ex.: Climatizadores"
              />
              <datalist id="pecas-categorias">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-medio/70">Modelo</span>
              <input
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                className="campo w-full"
                placeholder="Ex.: SX070 Trend"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-medio/70">
              Voltagem (peças elétricas)
            </span>
            <select
              value={voltagem}
              onChange={(e) => setVoltagem(e.target.value)}
              className="campo w-full"
            >
              <option value="">Sem voltagem (serve em ambas)</option>
              <option value="110V">110V</option>
              <option value="220V">220V</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-medio/70">Preco (R$)</span>
              <input
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                className="campo w-full"
                placeholder="0,00"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-medio/70">Estoque minimo</span>
              <input
                value={estoqueMinimo}
                onChange={(e) => setEstoqueMinimo(e.target.value)}
                type="number"
                min="0"
                step="1"
                className="campo w-full"
                placeholder="—"
              />
            </label>
          </div>
          {peca && (
            <label className="flex items-center gap-2 text-sm text-escuro">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
                className="accent-tiffany"
              />
              Ativa
            </label>
          )}
          {!peca && (
            <p className="rounded-md bg-fundo px-2.5 py-1.5 text-[11px] text-medio/60">
              O estoque começa em 0. Use "Movimentar" para dar entrada.
            </p>
          )}
          {erroDup && (
            <div className="space-y-2 rounded-md border border-erro/20 bg-erro/5 px-2.5 py-2 text-xs text-erro">
              <p>{erroDup.msg}</p>
              {erroDup.inativaId && (
                <button
                  onClick={() => void reativar(erroDup.inativaId!)}
                  disabled={reativando}
                  className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-xs font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
                >
                  {reativando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Reativar peça existente
                </button>
              )}
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onFechar} className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5">
            Cancelar
          </button>
          <button
            onClick={() => void salvar()}
            disabled={salvando}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalMovimentar({
  peca,
  onFechar,
  onSalvo,
  toast,
}: {
  peca: Peca;
  onFechar: () => void;
  onSalvo: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [tipo, setTipo] = useState<"ENTRADA" | "SAIDA" | "AJUSTE">("ENTRADA");
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const rotulo =
    tipo === "AJUSTE" ? "Novo estoque (valor absoluto)" : "Quantidade";

  async function salvar() {
    const q = Number(quantidade);
    if (!Number.isFinite(q) || q < 0 || (tipo !== "AJUSTE" && q <= 0)) {
      toast.erro("Informe uma quantidade valida.");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch(`/api/pecas/${peca.id}/movimentar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, quantidade: q, motivo: motivo.trim() || null }),
      });
      if (!r.ok) {
        toast.erro("Não foi possível movimentar.");
        return;
      }
      toast.sucesso("Estoque atualizado.");
      invalidarCache("/api/pecas");
      onSalvo();
    } catch {
      toast.erro("Falha de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-escuro">Movimentar estoque</h3>
          <button onClick={onFechar} className="rounded-lg p-1 text-medio/60 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs text-medio/60">
          {[peca.nome, peca.modelo].filter(Boolean).join(" ")} · estoque atual{" "}
          <strong className="text-escuro">{peca.estoque}</strong>
        </p>
        <div className="space-y-3">
          <div className="flex gap-1">
            {(["ENTRADA", "SAIDA", "AJUSTE"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTipo(t)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                  tipo === t ? "bg-tiffany text-white" : "bg-fundo text-medio hover:bg-black/5"
                }`}
              >
                {t === "ENTRADA" ? "Entrada" : t === "SAIDA" ? "Saída" : "Ajuste"}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-medio/70">{rotulo}</span>
            <input
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              type="number"
              min="0"
              step="1"
              autoFocus
              className="campo w-full"
              placeholder="0"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-medio/70">Motivo</span>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="campo w-full"
              placeholder="Ex.: compra, acerto de inventario"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onFechar} className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5">
            Cancelar
          </button>
          <button
            onClick={() => void salvar()}
            disabled={salvando}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

type Movimentacao = {
  id: string;
  tipo: string;
  quantidade: number;
  motivo: string | null;
  criadoEm: string;
  agente: string | null;
  negocioId: string | null;
  assistenciaLocal?: boolean;
  cliente: string | null;
};

const ROTULO_TIPO: Record<string, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  AJUSTE: "Ajuste",
  ESTORNO: "Estorno",
};

function DrawerHistorico({ peca, onFechar }: { peca: Peca; onFechar: () => void }) {
  const [movs, setMovs] = useState<Movimentacao[] | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pecas/${peca.id}/historico`);
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (vivo) setMovs(d.movimentacoes ?? []);
      } catch {
        if (vivo) setErro(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [peca.id]);

  return (
    <div className="fade-in fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onFechar}>
      <div
        className="modal-in scroll-fino h-full w-full max-w-md overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-black/5 bg-white px-5 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-escuro">
              {[peca.nome, peca.modelo].filter(Boolean).join(" ")}
            </h3>
            <p className="text-xs text-medio/60">
              Histórico · estoque atual {peca.estoque}
            </p>
          </div>
          <button onClick={onFechar} className="rounded-lg p-1 text-medio/60 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          {erro ? (
            <p className="py-8 text-center text-sm text-medio/50">
              Nao foi possivel carregar o histórico.
            </p>
          ) : movs === null ? (
            <div className="flex items-center justify-center py-12 text-medio/40">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : movs.length === 0 ? (
            <p className="py-8 text-center text-sm text-medio/50">
              Nenhuma movimentação ainda.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {movs.map((m) => {
                const entra = m.tipo === "ENTRADA" || m.tipo === "ESTORNO";
                const sinal = m.tipo === "AJUSTE" ? "" : entra ? "+" : "−";
                return (
                  <li
                    key={m.id}
                    className="rounded-lg border border-black/5 bg-fundo/50 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-escuro">
                        {ROTULO_TIPO[m.tipo] ?? m.tipo}
                      </span>
                      <span
                        className={`text-sm font-semibold ${
                          m.tipo === "AJUSTE"
                            ? "text-medio/70"
                            : entra
                              ? "text-green-600"
                              : "text-erro"
                        }`}
                      >
                        {sinal}
                        {m.quantidade}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-medio/50">
                      <span>
                        {new Date(m.criadoEm).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {m.agente && <span>· {m.agente}</span>}
                      {m.assistenciaLocal && <span>· Assistência local</span>}
                      {m.cliente && <span>· cliente {m.cliente}</span>}
                    </div>
                    {m.motivo && (
                      <p className="mt-0.5 text-xs text-medio/70">{m.motivo}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
