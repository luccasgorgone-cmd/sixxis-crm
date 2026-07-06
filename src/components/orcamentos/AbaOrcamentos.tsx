"use client";

// Aba ORCAMENTOS (Fatia 3.07): lista gerencial dos orcamentos-decisao com chips
// de decisao, filtro de finalidade e periodo (reusa FiltroPeriodoEntrada), busca
// por numero/cliente e 3 mini-cards de resumo sincronizados com os filtros.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ReceiptText, Loader2, ChevronRight, Search, ShieldCheck } from "lucide-react";
import { EstadoErro } from "@/components/ui/Estado";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  FiltroPeriodoEntrada,
  paramsPeriodo,
  PERIODO_TODOS,
  type PeriodoEntrada,
} from "@/components/ui/FiltroPeriodoEntrada";
import { formatarBRL } from "@/lib/format";

type Item = {
  id: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  garantia: boolean;
};
type Orcamento = {
  id: string;
  numero: number;
  numeroFormatado: string;
  finalidade: string;
  decisao: string;
  total: number | null;
  totalGarantia: number | null;
  qtdItens: number;
  criadoEm: string;
  cliente: { leadId: string; nome: string };
  agente?: { nome: string | null };
  itens: Item[];
};
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

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function AbaOrcamentos({ ehAdmin }: { ehAdmin: boolean }) {
  const [decisao, setDecisao] = useState<Decisao>("");
  const [finalidade, setFinalidade] = useState("");
  const [periodo, setPeriodo] = useState<PeriodoEntrada>(PERIODO_TODOS);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");

  const [orcs, setOrcs] = useState<Orcamento[]>([]);
  const [resumo, setResumo] = useState<Resumo>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

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
    return p;
  }, [decisao, finalidade, periodo, buscaAplicada]);

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
        <select
          value={finalidade}
          onChange={(e) => setFinalidade(e.target.value)}
          className="campo"
        >
          <option value="">Todas finalidades</option>
          <option value="VENDA">Venda</option>
          <option value="POS_VENDA">Pós-venda</option>
        </select>
        <FiltroPeriodoEntrada valor={periodo} onChange={setPeriodo} />
        <div className="relative min-w-0 flex-1 sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-medio/40" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Número ou cliente"
            className="campo w-full pl-8 sm:w-52"
          />
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
              <p className="mt-0.5 truncate text-sm font-bold text-escuro">
                {formatarBRL(dados.somaTotal)}
              </p>
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
            const exp = expandido === o.id;
            return (
              <div key={o.id} className="overflow-hidden rounded-lg border border-black/5 bg-white">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    onClick={() => setExpandido(exp ? null : o.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 text-medio/40 transition-transform ${exp ? "rotate-90" : ""}`}
                    />
                    <span className="shrink-0 font-mono text-xs font-semibold text-escuro">
                      {o.numeroFormatado}
                    </span>
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
                  </button>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className="text-sm font-semibold text-escuro">{formatarBRL(o.total ?? 0)}</span>
                    {o.totalGarantia != null && o.totalGarantia > 0 && (
                      <span className="text-[10px] text-medio/50">Garantia {formatarBRL(o.totalGarantia)}</span>
                    )}
                  </div>
                </div>
                {/* Linha secundaria: cliente + qtd + agente (admin) */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 pb-2 pl-9 text-[11px] text-medio/50">
                  <Link
                    href={`/inbox?lead=${o.cliente.leadId}`}
                    className="font-medium text-medio/80 hover:text-tiffany"
                  >
                    {o.cliente.nome}
                  </Link>
                  <span>· {o.qtdItens} {o.qtdItens === 1 ? "item" : "itens"}</span>
                  {ehAdmin && o.agente?.nome && <span>· {o.agente.nome}</span>}
                </div>
                {exp && o.itens.length > 0 && (
                  <ul className="space-y-1 border-t border-black/5 bg-fundo/40 px-3 py-2 pl-9">
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
                  </ul>
                )}
              </div>
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
    </div>
  );
}
