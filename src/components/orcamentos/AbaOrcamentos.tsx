"use client";

// Aba ORCAMENTOS (Fatia 3.07/3.09): lista gerencial com chips de decisao, filtro
// de finalidade, periodo (FiltroPeriodoEntrada), busca (numero/cliente/CPF/CNPJ),
// filtros avancados (UF/DDD) e 3 mini-cards de resumo. Clicar numa linha abre o
// DRAWER com a ficha completa (substitui a expansao inline da 3.07).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ReceiptText,
  Loader2,
  ChevronRight,
  ShieldCheck,
  SlidersHorizontal,
  X,
  MessageCircle,
  CreditCard,
} from "lucide-react";
import { EstadoErro } from "@/components/ui/Estado";
import { EmptyState } from "@/components/ui/EmptyState";
import { InputBusca } from "@/components/ui/InputBusca";
import { useClickFora } from "@/lib/useClickFora";
import {
  FiltroPeriodoEntrada,
  paramsPeriodo,
  PERIODO_TODOS,
  type PeriodoEntrada,
} from "@/components/ui/FiltroPeriodoEntrada";
import { formatarBRL } from "@/lib/format";
import { formatarLinhaPagamento, type LinhaPagamento } from "@/lib/pagamento";

type Orcamento = {
  id: string;
  numeroFormatado: string;
  finalidade: string;
  decisao: string;
  total: number | null;
  totalFinal: number | null;
  totalGarantia: number | null;
  qtdItens: number;
  criadoEm: string;
  cliente: { leadId: string; nome: string };
  agente?: { nome: string | null };
  // Status do link de pagamento (Fase 3): "pago" | "pendente" | ... | null.
  statusPagamento: string | null;
  pagamentoPagoEm: string | null;
};

// Selo do status do link de pagamento (Fase 3). Nulo = sem cobranca (nao renderiza).
function SeloPagamento({ status }: { status: string | null }) {
  if (!status) return null;
  const pago = status === "pago";
  const cor = pago
    ? "bg-green-600/10 text-green-700"
    : status === "pendente"
      ? "bg-amber-500/10 text-amber-600"
      : "bg-black/5 text-medio/60";
  const rotulo = pago ? "Pago" : status === "pendente" ? "A pagar" : status;
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${cor}`}>
      <CreditCard className="h-2.5 w-2.5" /> {rotulo}
    </span>
  );
}
type Resumo = Record<string, { quantidade: number; somaTotal: number }>;
type Decisao = "" | "GANHO" | "PENDENTE" | "PERDIDO";

const CHIPS: { v: Decisao; r: string; ativoClasse: string }[] = [
  { v: "", r: "Todas", ativoClasse: "bg-escuro text-white" },
  { v: "GANHO", r: "Ganhos", ativoClasse: "bg-green-600 text-white" },
  { v: "PENDENTE", r: "Pendentes", ativoClasse: "bg-amber-500 text-white" },
  { v: "PERDIDO", r: "Perdidos", ativoClasse: "bg-erro text-white" },
];
const DECISAO_META: Record<string, { rotulo: string; classe: string }> = {
  GANHO: { rotulo: "Ganho", classe: "bg-green-600/10 text-green-700" },
  PENDENTE: { rotulo: "Pendente", classe: "bg-amber-500/10 text-amber-600" },
  PERDIDO: { rotulo: "Perdido", classe: "bg-erro/10 text-erro" },
};
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function AbaOrcamentos({ ehAdmin }: { ehAdmin: boolean }) {
  const [decisao, setDecisao] = useState<Decisao>("");
  const [finalidade, setFinalidade] = useState("");
  const [periodo, setPeriodo] = useState<PeriodoEntrada>(PERIODO_TODOS);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [uf, setUf] = useState("");
  const [ddd, setDdd] = useState("");
  const [pagamento, setPagamento] = useState(""); // "" | "pago" | "pendente"
  const [filtrosAberto, setFiltrosAberto] = useState(false);
  const filtrosRef = useRef<HTMLDivElement>(null);
  useClickFora(() => setFiltrosAberto(false), filtrosAberto, [filtrosRef]);

  const [orcs, setOrcs] = useState<Orcamento[]>([]);
  const [resumo, setResumo] = useState<Resumo>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (decisao) p.set("decisao", decisao);
    if (finalidade) p.set("finalidade", finalidade);
    for (const [k, v] of Object.entries(paramsPeriodo(periodo))) p.set(k, v);
    if (buscaAplicada.trim()) p.set("busca", buscaAplicada.trim());
    if (uf) p.set("uf", uf);
    if (ddd.length === 2) p.set("ddd", ddd);
    if (pagamento) p.set("pagamento", pagamento);
    return p;
  }, [decisao, finalidade, periodo, buscaAplicada, uf, ddd, pagamento]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/orcamentos?${query.toString()}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setOrcs(d.orcamentos ?? []);
      setResumo(d.resumo ?? {});
      setCursor(d.proximoCursor ?? null);
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [query]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function carregarMais() {
    if (!cursor || carregandoMais) return;
    setCarregandoMais(true);
    try {
      const p = new URLSearchParams(query);
      p.set("cursor", cursor);
      const r = await fetch(`/api/orcamentos?${p.toString()}`);
      if (r.ok) {
        const d = await r.json();
        setOrcs((prev) => [...prev, ...(d.orcamentos ?? [])]);
        setCursor(d.proximoCursor ?? null);
      }
    } catch {
      // silencioso
    } finally {
      setCarregandoMais(false);
    }
  }

  const cards: { v: Decisao; r: string; classe: string; ponto: string }[] = [
    { v: "GANHO", r: "Ganhos", classe: "border-green-600/20 bg-green-600/[0.04]", ponto: "text-green-700" },
    { v: "PENDENTE", r: "Pendentes", classe: "border-amber-500/20 bg-amber-500/[0.05]", ponto: "text-amber-600" },
    { v: "PERDIDO", r: "Perdidos", classe: "border-erro/20 bg-erro/[0.04]", ponto: "text-erro" },
  ];
  const temFiltroAvancado = Boolean(uf || ddd.length === 2 || pagamento);

  return (
    <div className="scroll-fino h-full space-y-4 overflow-y-auto p-4 md:p-6">
      {/* Cabecalho */}
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tiffany/10 text-tiffany">
          <ReceiptText className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-escuro">Orçamentos</h2>
          <p className="text-sm text-medio/60">
            {orcs.length}
            {orcs.length === 1 ? " orçamento" : " orçamentos"}
            {cursor ? "+" : ""} no filtro
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {CHIPS.map((c) => (
            <button
              key={c.v || "todas"}
              onClick={() => setDecisao(c.v)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                decisao === c.v ? c.ativoClasse : "bg-fundo text-medio hover:bg-black/5"
              }`}
            >
              {c.r}
            </button>
          ))}
        </div>
        <select value={finalidade} onChange={(e) => setFinalidade(e.target.value)} className="campo">
          <option value="">Todas finalidades</option>
          <option value="VENDA">Venda</option>
          <option value="POS_VENDA">Pós-venda</option>
        </select>
        <FiltroPeriodoEntrada valor={periodo} onChange={setPeriodo} />
        <InputBusca
          valor={busca}
          onChange={setBusca}
          placeholder="Número, cliente, CPF ou CNPJ"
          className="min-w-0 flex-1 sm:w-64 sm:flex-none"
        />
        {/* Filtros avancados (UF/DDD) */}
        <div className="relative" ref={filtrosRef}>
          <button
            onClick={() => setFiltrosAberto((a) => !a)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              temFiltroAvancado
                ? "border-tiffany/40 bg-tiffany/10 text-tiffany"
                : "border-black/10 text-medio/80 hover:bg-black/5"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" /> Filtros
            {temFiltroAvancado && <span className="text-xs">·</span>}
          </button>
          {filtrosAberto && (
            <div className="fade-in absolute right-0 top-full z-30 mt-1 w-56 space-y-3 rounded-lg border border-black/10 bg-white p-3 shadow-lg dark:bg-escuro">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-medio/70">UF</span>
                <select value={uf} onChange={(e) => setUf(e.target.value)} className="campo w-full">
                  <option value="">Todas</option>
                  {UFS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-medio/70">DDD</span>
                <input
                  value={ddd}
                  onChange={(e) => setDdd(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  inputMode="numeric"
                  placeholder="Ex.: 18"
                  className="campo w-full"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-medio/70">Pagamento</span>
                <select
                  value={pagamento}
                  onChange={(e) => setPagamento(e.target.value)}
                  className="campo w-full"
                >
                  <option value="">Todos</option>
                  <option value="pago">Pago</option>
                  <option value="pendente">A pagar (pendente)</option>
                </select>
              </label>
              {temFiltroAvancado && (
                <button
                  onClick={() => {
                    setUf("");
                    setDdd("");
                    setPagamento("");
                  }}
                  className="text-xs font-medium text-medio hover:text-erro"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mini-cards de resumo (sincronizados com os filtros) */}
      <div className="grid grid-cols-3 gap-2">
        {cards.map((c) => {
          const dados = resumo[c.v] ?? { quantidade: 0, somaTotal: 0 };
          const ativo = decisao === c.v;
          return (
            <button
              key={c.v}
              onClick={() => setDecisao(ativo ? "" : c.v)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-shadow hover:shadow-sm ${c.classe} ${
                ativo ? "ring-2 ring-tiffany/40" : ""
              }`}
            >
              <p className={`text-xs font-semibold ${c.ponto}`}>
                {c.r} · {dados.quantidade}
              </p>
              <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-escuro">{formatarBRL(dados.somaTotal)}</p>
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {erro ? (
        <EstadoErro mensagem="Não foi possível carregar os orçamentos." onRetry={carregar} />
      ) : carregando ? (
        <div className="flex items-center justify-center py-16 text-medio/50">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : orcs.length === 0 ? (
        <EmptyState icone={ReceiptText} titulo="Nenhum orçamento" texto="Nenhum orçamento no período." />
      ) : (
        <div className="space-y-1.5">
          {orcs.map((o) => {
            const dec = DECISAO_META[o.decisao] ?? { rotulo: o.decisao, classe: "bg-black/5 text-medio" };
            return (
              <button
                key={o.id}
                onClick={() => setDrawerId(o.id)}
                className="w-full rounded-lg border border-black/5 bg-white text-left transition-colors hover:border-tiffany/30"
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="shrink-0 font-mono text-xs font-semibold text-escuro">{o.numeroFormatado}</span>
                  <span className="shrink-0 text-[11px] text-medio/50">{dataCurta(o.criadoEm)}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      o.finalidade === "POS_VENDA" ? "bg-tiffany/10 text-tiffany" : "bg-sky-500/10 text-sky-600"
                    }`}
                  >
                    {o.finalidade === "POS_VENDA" ? "Pós-venda" : "Venda"}
                  </span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${dec.classe}`}>
                    {dec.rotulo}
                  </span>
                  <SeloPagamento status={o.statusPagamento} />
                  <div className="ml-auto flex shrink-0 flex-col items-end">
                    <span className="text-sm font-semibold tabular-nums text-escuro">{formatarBRL(o.totalFinal ?? 0)}</span>
                    {o.totalGarantia != null && o.totalGarantia > 0 && (
                      <span className="text-[10px] tabular-nums text-medio/50">Garantia {formatarBRL(o.totalGarantia)}</span>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-medio/30" />
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 pb-2 text-[11px] text-medio/50">
                  <span className="font-medium text-medio/80">{o.cliente.nome}</span>
                  <span>· {o.qtdItens} {o.qtdItens === 1 ? "item" : "itens"}</span>
                  {ehAdmin && o.agente?.nome && <span>· {o.agente.nome}</span>}
                </div>
              </button>
            );
          })}

          {cursor && (
            <button
              onClick={() => void carregarMais()}
              disabled={carregandoMais}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-black/10 py-2 text-sm font-medium text-medio hover:bg-black/5 disabled:opacity-60"
            >
              {carregandoMais && <Loader2 className="h-4 w-4 animate-spin" />}
              Carregar mais
            </button>
          )}
        </div>
      )}

      {drawerId && (
        <DrawerOrcamento key={drawerId} id={drawerId} onFechar={() => setDrawerId(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer com a ficha completa do orcamento.
// ---------------------------------------------------------------------------
type Ficha = {
  numeroFormatado: string;
  decisao: string;
  finalidade: string;
  criadoEm: string;
  cliente: {
    leadId: string;
    nome: string;
    telefone: string;
    cpf: string | null;
    cnpj: string | null;
    cidade: string | null;
    uf: string | null;
  };
  contexto: { finalidade: string; etapa: string | null; dono: string | null };
  valores: {
    subtotal: number | null;
    cupom: string | null;
    descontoPct: number | null;
    frete: number | null;
    fretePagoPelaEmpresa: boolean;
    totalFinal: number | null;
    totalGarantia: number | null;
    valorNegocio: number | null;
  };
  itens: {
    id: string;
    descricao: string;
    quantidade: number;
    valorUnitario: number;
    subtotal: number;
    garantia: boolean;
  }[];
  pagamentos: LinhaPagamento[];
};

function DrawerOrcamento({ id, onFechar }: { id: string; onFechar: () => void }) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/orcamentos/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (vivo) setFicha(d.orcamento);
      })
      .catch(() => {
        if (vivo) setErro(true);
      });
    return () => {
      vivo = false;
    };
  }, [id]);

  const dec = ficha ? DECISAO_META[ficha.decisao] ?? { rotulo: ficha.decisao, classe: "bg-black/5 text-medio" } : null;
  const v = ficha?.valores;
  const descValor = v && v.subtotal != null && v.descontoPct ? v.subtotal * (v.descontoPct / 100) : 0;

  return (
    <div className="fade-in fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onFechar}>
      <div
        className="modal-in scroll-fino h-full w-full max-w-md overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-black/5 bg-white px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-escuro">
              {ficha?.numeroFormatado ?? "…"}
            </span>
            {dec && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${dec.classe}`}>{dec.rotulo}</span>
            )}
          </div>
          <button onClick={onFechar} className="rounded-lg p-1 text-medio/60 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {erro ? (
          <p className="p-6 text-sm text-medio/50">Não foi possível carregar a ficha.</p>
        ) : !ficha ? (
          <div className="flex justify-center py-16 text-medio/40">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 p-5">
            {/* Cliente */}
            <div className="rounded-xl border border-black/5 bg-fundo/50 p-3">
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-medio/50">Cliente</h4>
              <p className="text-sm font-medium text-escuro">{ficha.cliente.nome}</p>
              <p className="text-xs text-medio/60">{ficha.cliente.telefone}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-medio/60">
                {ficha.cliente.cpf && <span>CPF {ficha.cliente.cpf}</span>}
                {ficha.cliente.cnpj && <span>CNPJ {ficha.cliente.cnpj}</span>}
                {(ficha.cliente.cidade || ficha.cliente.uf) && (
                  <span>
                    {[ficha.cliente.cidade, ficha.cliente.uf].filter(Boolean).join("/")}
                  </span>
                )}
              </div>
              <Link
                href={`/inbox?lead=${ficha.cliente.leadId}`}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-tiffany px-2.5 py-1 text-xs font-semibold text-white hover:bg-tiffany-escuro"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Abrir conversa
              </Link>
            </div>

            {/* Itens */}
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-medio/50">Itens</h4>
              <ul className="space-y-1">
                {ficha.itens.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-center gap-2 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate text-escuro" title={it.descricao}>
                      <span className="text-medio/50">{it.quantidade}x </span>
                      {it.descricao}
                    </span>
                    {it.garantia ? (
                      <span className="flex shrink-0 items-center gap-0.5 text-tiffany">
                        <ShieldCheck className="h-3 w-3" /> Garantia - sem custo
                      </span>
                    ) : (
                      <span className="shrink-0 tabular-nums text-medio/60">
                        {formatarBRL(it.valorUnitario)} · {formatarBRL(it.subtotal)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Valores */}
            {v && (
              <div className="rounded-xl border border-black/5 bg-fundo/50 p-3 text-xs">
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-medio/50">Valores</h4>
                <div className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-medio/60">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatarBRL(v.subtotal ?? 0)}</span>
                  </div>
                  {descValor > 0 && (
                    <div className="flex items-baseline justify-between gap-2 text-green-700">
                      <span className="min-w-0 truncate">
                        {v.cupom ? `Cupom ${v.cupom} · ` : ""}−{v.descontoPct}%
                      </span>
                      <span className="shrink-0 tabular-nums">− {formatarBRL(descValor)}</span>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-2 text-medio/60">
                    <span>Frete</span>
                    <span className="shrink-0 tabular-nums">{v.fretePagoPelaEmpresa ? "pago pela empresa" : `+ ${formatarBRL(v.frete ?? 0)}`}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-black/10 pt-2 text-sm font-bold text-escuro">
                    <span>Total</span>
                    <span className="tabular-nums text-tiffany">{formatarBRL(v.totalFinal ?? 0)}</span>
                  </div>
                  {v.totalGarantia != null && v.totalGarantia > 0 && (
                    <div className="flex items-baseline justify-between gap-2 text-[11px] text-medio/50">
                      <span>Garantia (não cobrado)</span>
                      <span className="tabular-nums line-through">{formatarBRL(v.totalGarantia)}</span>
                    </div>
                  )}
                  {v.valorNegocio != null && (
                    <div className="flex items-baseline justify-between gap-2 border-t border-black/10 pt-1 text-medio/70">
                      <span>Valor consolidado (ganho)</span>
                      <span className="font-semibold tabular-nums text-escuro">{formatarBRL(v.valorNegocio)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Forma(s) de pagamento (Fatia 3.18) — so quando houver no snapshot. */}
            {ficha.pagamentos.length > 0 && (
              <div className="rounded-xl border border-black/5 bg-fundo/50 p-3 text-xs">
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-medio/50">
                  Forma de pagamento
                </h4>
                <ul className="space-y-0.5 text-medio/70">
                  {ficha.pagamentos.map((p, i) => (
                    <li key={i}>{formatarLinhaPagamento(p)}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Contexto */}
            <div className="rounded-xl border border-black/5 bg-fundo/50 p-3 text-xs text-medio/70">
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-medio/50">Contexto</h4>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                <span>{ficha.finalidade === "POS_VENDA" ? "Pós-venda" : "Venda"}</span>
                {ficha.contexto.etapa && <span>· {ficha.contexto.etapa}</span>}
                {ficha.contexto.dono && <span>· {ficha.contexto.dono}</span>}
                <span>· {new Date(ficha.criadoEm).toLocaleString("pt-BR")}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
