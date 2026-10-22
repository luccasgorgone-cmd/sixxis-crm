"use client";

// Aba "Captação Ativa" do Supervisor (admin-only). Mede prospecção ativa:
// clientes cadastrados MANUALMENTE (Lead.origem="manual") por período, com
// conversão e R$ por coorte. Fetch próprio em /api/admin/supervisor/captacao.
// Ver docs/DESIGN_CAPTACAO_ATIVA.md.
import { useState, useEffect, useCallback, useMemo } from "react";
import { UserPlus, Search, ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import { EstadoErro } from "@/components/ui/Estado";

type StatusCaptacao = "ABERTO" | "GANHO" | "PERDIDO";
type LinhaCaptacao = {
  leadId: string;
  nome: string | null;
  telefone: string;
  donoId: string | null;
  donoNome: string | null;
  cadastradoPorId: string | null;
  cadastradoPorNome: string | null;
  criadoEm: string;
  etapaAtual: string | null;
  status: StatusCaptacao | null;
  valorGanho: number | null;
};
type RankingVendedor = {
  agenteId: string | null;
  nome: string | null;
  captados: number;
  convertidos: number;
  conversao: number;
  valorGerado: number;
};
type Resultado = {
  total: number;
  vendedoresQueCaptaram: number;
  convertidos: number;
  conversao: number;
  valorGerado: number;
  delta: { total: number | null; conversao: number | null; valorGerado: number | null };
  ranking: RankingVendedor[];
  serie: { data: string; captados: number }[];
  linhas: LinhaCaptacao[];
};

const PAGINA = 20;

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

function Delta({ v }: { v: number | null }) {
  if (v === null) return <span className="text-xs text-medio">—</span>;
  const sobe = v >= 0;
  const Icone = sobe ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        sobe ? "text-emerald-600" : "text-rose-600"
      }`}
    >
      <Icone className="h-3 w-3" />
      {sobe ? "+" : ""}
      {(v * 100).toFixed(0)}%
    </span>
  );
}

function Kpi({
  rotulo,
  valor,
  delta,
}: {
  rotulo: string;
  valor: string;
  delta?: number | null;
}) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-3">
      <div className="text-xs text-medio">{rotulo}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-semibold text-escuro">{valor}</span>
        {delta !== undefined && <Delta v={delta} />}
      </div>
    </div>
  );
}

function BadgeStatus({ s }: { s: StatusCaptacao | null }) {
  const mapa: Record<StatusCaptacao, string> = {
    GANHO: "bg-emerald-500/10 text-emerald-700",
    PERDIDO: "bg-rose-500/10 text-rose-700",
    ABERTO: "bg-tiffany/10 text-tiffany",
  };
  const rotulo = s ?? "ABERTO";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${mapa[rotulo]}`}>
      {rotulo === "GANHO" ? "Ganho" : rotulo === "PERDIDO" ? "Perdido" : "Aberto"}
    </span>
  );
}

export function PainelCaptacao({
  periodo,
  finalidade,
  agenteFoco,
  aoFocarAgente,
}: {
  periodo: string;
  finalidade: string;
  agenteFoco: { id: string; nome: string } | null;
  aoFocarAgente?: (id: string, nome: string) => void;
}) {
  const [dados, setDados] = useState<Resultado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    try {
      const qs = new URLSearchParams({ periodo });
      if (finalidade) qs.set("finalidade", finalidade);
      if (agenteFoco) qs.set("agenteId", agenteFoco.id);
      const r = await fetch(`/api/admin/supervisor/captacao?${qs.toString()}`);
      if (!r.ok) {
        setErro(true);
        return;
      }
      setDados((await r.json()) as Resultado);
      setPagina(0);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [periodo, finalidade, agenteFoco]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const linhasFiltradas = useMemo(() => {
    if (!dados) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return dados.linhas;
    return dados.linhas.filter((l) =>
      [l.nome, l.telefone, l.donoNome, l.cadastradoPorNome]
        .filter(Boolean)
        .some((c) => (c as string).toLowerCase().includes(q)),
    );
  }, [dados, busca]);

  const maxRanking = useMemo(
    () => Math.max(1, ...(dados?.ranking.map((r) => r.captados) ?? [1])),
    [dados],
  );
  const maxSerie = useMemo(
    () => Math.max(1, ...(dados?.serie.map((p) => p.captados) ?? [1])),
    [dados],
  );

  if (erro) {
    return (
      <EstadoErro
        mensagem="Não foi possível carregar a captação ativa."
        onRetry={() => void carregar()}
      />
    );
  }
  if (carregando && !dados) {
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (!dados) return null;

  const pags = Math.max(1, Math.ceil(linhasFiltradas.length / PAGINA));
  const paginaAtual = Math.min(pagina, pags - 1);
  const visiveis = linhasFiltradas.slice(
    paginaAtual * PAGINA,
    paginaAtual * PAGINA + PAGINA,
  );

  return (
    <div className={`space-y-5 ${carregando ? "opacity-60 transition-opacity" : ""}`}>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Kpi rotulo="Captados no período" valor={String(dados.total)} delta={dados.delta.total} />
        <Kpi rotulo="Conversão (coorte)" valor={pct(dados.conversao)} delta={dados.delta.conversao} />
        <Kpi rotulo="R$ gerado" valor={brl(dados.valorGerado)} delta={dados.delta.valorGerado} />
        <Kpi rotulo="Vendedores que captaram" valor={String(dados.vendedoresQueCaptaram)} />
      </div>

      {/* Ranking por vendedor */}
      <div className="rounded-2xl border border-black/5 bg-white p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-escuro">
          <UserPlus className="h-4 w-4 text-tiffany" /> Ranking de captação por vendedor
        </div>
        {dados.ranking.length === 0 ? (
          <p className="text-sm text-medio">Nenhuma captação manual no período.</p>
        ) : (
          <ul className="space-y-1.5">
            {dados.ranking.map((r) => {
              const clicavel = !!aoFocarAgente && r.agenteId !== null;
              return (
                <li key={r.agenteId ?? "_sem"}>
                  <button
                    disabled={!clicavel}
                    onClick={() =>
                      clicavel && aoFocarAgente!(r.agenteId as string, r.nome ?? "")
                    }
                    className={`relative flex w-full items-center justify-between overflow-hidden rounded-lg px-3 py-2 text-left ${
                      clicavel ? "hover:bg-black/[0.03]" : "cursor-default"
                    }`}
                  >
                    <span
                      className="absolute inset-y-0 left-0 bg-tiffany/10"
                      style={{ width: `${(r.captados / maxRanking) * 100}%` }}
                      aria-hidden
                    />
                    <span className="relative z-10 truncate text-sm text-escuro">
                      {r.nome ?? "(sem vendedor)"}
                    </span>
                    <span className="relative z-10 ml-3 flex shrink-0 items-center gap-3 text-xs text-medio">
                      <span>
                        <strong className="text-escuro">{r.captados}</strong> captados
                      </span>
                      <span>{pct(r.conversao)} conv.</span>
                      <span>{brl(r.valorGerado)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Série temporal (captações por dia) */}
      {dados.serie.length > 0 && (
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-escuro">Captações por dia</div>
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {dados.serie.map((p) => (
              <div key={p.data} className="flex flex-1 flex-col items-center justify-end" title={`${p.data}: ${p.captados}`}>
                <div
                  className="w-full rounded-t bg-tiffany/70"
                  style={{ height: `${(p.captados / maxSerie) * 100}%`, minHeight: 2 }}
                />
                <span className="mt-1 text-[10px] text-medio">{p.data.slice(8, 10)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista detalhada */}
      <div className="rounded-2xl border border-black/5 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-escuro">
            Clientes captados ({linhasFiltradas.length})
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-medio" />
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(0);
              }}
              placeholder="Buscar nome, telefone, vendedor…"
              className="rounded-lg border border-black/10 py-1.5 pl-7 pr-2 text-xs text-escuro outline-none focus:border-tiffany"
            />
          </div>
        </div>
        {visiveis.length === 0 ? (
          <p className="text-sm text-medio">Nenhum cliente captado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-medio">
                <tr className="border-b border-black/5">
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 font-medium">Vendedor</th>
                  <th className="py-2 pr-3 font-medium">Cadastrado por</th>
                  <th className="py-2 pr-3 font-medium">Data</th>
                  <th className="py-2 pr-3 font-medium">Etapa</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Valor</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.leadId} className="border-b border-black/[0.03]">
                    <td className="py-2 pr-3">
                      <div className="text-escuro">{l.nome ?? "(sem nome)"}</div>
                      <div className="text-medio">{l.telefone}</div>
                    </td>
                    <td className="py-2 pr-3 text-escuro">{l.donoNome ?? "(sem vendedor)"}</td>
                    <td className="py-2 pr-3 text-medio">{l.cadastradoPorNome ?? "—"}</td>
                    <td className="py-2 pr-3 text-medio">{dataCurta(l.criadoEm)}</td>
                    <td className="py-2 pr-3 text-medio">{l.etapaAtual ?? "—"}</td>
                    <td className="py-2 pr-3"><BadgeStatus s={l.status} /></td>
                    <td className="py-2 pr-3 text-escuro">
                      {l.valorGanho != null ? brl(l.valorGanho) : "—"}
                    </td>
                    <td className="py-2">
                      <a
                        href={`/inbox?lead=${l.leadId}`}
                        className="inline-flex items-center gap-1 text-tiffany hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Abrir
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pags > 1 && (
          <div className="mt-3 flex items-center justify-between text-xs text-medio">
            <button
              disabled={paginaAtual === 0}
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
              className="rounded px-2 py-1 disabled:opacity-40 hover:bg-black/[0.03]"
            >
              ← Anterior
            </button>
            <span>
              {paginaAtual + 1} / {pags}
            </span>
            <button
              disabled={paginaAtual >= pags - 1}
              onClick={() => setPagina((p) => Math.min(pags - 1, p + 1))}
              className="rounded px-2 py-1 disabled:opacity-40 hover:bg-black/[0.03]"
            >
              Próxima →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
