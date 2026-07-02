"use client";

// Mapa: centro de clientes georreferenciado. Reusa o MapaBrasil (choropleth) e o
// padrao de drawer, agora com metricas internas (clientes/vendas/perdidos/valor/
// clientes por 100k hab.) e filtros que recolorem o mapa (server-side). Clique no
// estado abre o PainelEstadoMapa (abas + edicao inline). Dark mode, Reveal, compacto.
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Loader2, Info, Users, Filter } from "lucide-react";
import { formatarBRL } from "@/lib/format";
import { EstadoErro } from "@/components/ui/Estado";
import { useAgente } from "@/components/shell/AgenteContext";
import { MapaBrasil } from "@/components/inteligencia/MapaBrasil";
import { Reveal } from "@/components/inteligencia/Reveal";
import {
  ESCALA_DENSIDADE,
  COR_SEM_DADO,
  corEscala,
} from "@/components/inteligencia/tipos";
import { PainelNegocio } from "@/components/kanban/PainelNegocio";
import { SeletorVendedor } from "@/components/shared/SeletorVendedor";
import type {
  Etapa,
  EtiquetaChip,
  AgenteResumo,
} from "@/components/kanban/tipos";
import { PainelEstadoMapa } from "./PainelEstadoMapa";
import {
  METRICAS,
  fmtMetrica,
  FILTROS_MAPA_VAZIO,
  queryFiltros,
  algumFiltroMapa,
  type EstadosResp,
  type FiltrosMapa,
  type MetricaMapa,
  type ResumoUF,
} from "./tipos";

const CATEGORIAS_FILTRO = [
  "Climatizador",
  "Bike Spinning",
  "Aspirador",
  "Nao classificado",
];

export function MapaClientes() {
  const [dados, setDados] = useState<EstadosResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosMapa>(FILTROS_MAPA_VAZIO);
  const [metrica, setMetrica] = useState<MetricaMapa>("clientes");
  const [ufAtivo, setUfAtivo] = useState<string | null>(null);
  const [ufDrawer, setUfDrawer] = useState<string | null>(null);
  const [negocioId, setNegocioId] = useState<string | null>(null);

  const agente = useAgente();
  const papel = agente?.papel ?? "COLABORADOR";
  const ehAdmin = papel === "ADMIN";
  const agenteId = agente?.id ?? "";
  const [escopo, setEscopo] = useState(""); // admin: "" (Todos) | agenteId | SEM_DONO
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [etiquetas, setEtiquetas] = useState<EtiquetaChip[]>([]);
  const [agentes, setAgentes] = useState<AgenteResumo[]>([]);

  // Datasets do PainelNegocio (reuso do Kanban) + etapas para a edicao inline.
  useEffect(() => {
    fetch("/api/etapas")
      .then((r) => (r.ok ? r.json() : { etapas: [] }))
      .then((d) => setEtapas(d.etapas ?? []))
      .catch(() => undefined);
    fetch("/api/etiquetas")
      .then((r) => (r.ok ? r.json() : { etiquetas: [] }))
      .then((d) => setEtiquetas(d.etiquetas ?? []))
      .catch(() => undefined);
    if (ehAdmin) {
      fetch("/api/agentes")
        .then((r) => (r.ok ? r.json() : { agentes: [] }))
        .then((d) => setAgentes(d.agentes ?? []))
        .catch(() => undefined);
    }
  }, [ehAdmin]);

  const carregar = useCallback(async (f: FiltrosMapa, esc: string) => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/mapa/estados${queryFiltros(f, esc)}`);
      if (!r.ok) throw new Error();
      setDados(await r.json());
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar(filtros, escopo);
  }, [carregar, filtros, escopo]);

  // Etapas de VENDA/AMBAS para o dropdown do drawer (pos-venda fica de fora).
  const etapasEdicao = useMemo(
    () =>
      etapas
        .filter((e) => {
          const fin = (e as { finalidade?: string }).finalidade;
          return fin == null || fin === "VENDA" || fin === "AMBAS";
        })
        .map((e) => ({
          id: e.id,
          nome: e.nome,
          tipo: (e as { tipo?: string }).tipo,
        })),
    [etapas],
  );

  const metricaCfg = METRICAS.find((m) => m.chave === metrica) ?? METRICAS[0];

  const porUF = useMemo(() => {
    const m = new Map<string, ResumoUF>();
    dados?.porUF.forEach((r) => m.set(r.uf, r));
    return m;
  }, [dados]);

  const maxMetrica = useMemo(() => {
    let mx = 0;
    dados?.porUF.forEach((r) => {
      const v = metricaCfg.valor(r);
      if (v != null && v > mx) mx = v;
    });
    return mx;
  }, [dados, metricaCfg]);

  const corPorUF = useCallback(
    (uf: string): string => {
      const r = porUF.get(uf);
      if (!r) return COR_SEM_DADO;
      const v = metricaCfg.valor(r);
      if (v == null || v <= 0 || maxMetrica === 0) return COR_SEM_DADO;
      return corEscala(v / maxMetrica, ESCALA_DENSIDADE);
    },
    [porUF, metricaCfg, maxMetrica],
  );

  const tooltip = useCallback(
    (uf: string): React.ReactNode => {
      const r = porUF.get(uf);
      const nome = r?.estado ?? uf;
      return (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-escuro">
            {nome} <span className="text-medio/60">({uf})</span>
          </p>
          {!r ? (
            <p className="text-medio/60">Sem clientes.</p>
          ) : (
            <>
              <Linha rotulo="Clientes" valor={String(r.clientes)} />
              <Linha rotulo="Abertos" valor={String(r.negocios.abertos)} />
              <Linha rotulo="Ganhos" valor={String(r.negocios.ganhos)} />
              <Linha rotulo="Perdidos" valor={String(r.negocios.perdidos)} />
              <Linha rotulo="Valor em aberto" valor={formatarBRL(r.valorAberto)} />
              {r.clientesPor100k != null && (
                <Linha
                  rotulo="Clientes/100k"
                  valor={r.clientesPor100k.toFixed(2)}
                />
              )}
            </>
          )}
        </div>
      );
    },
    [porUF],
  );

  const t = dados?.totais;

  return (
    <div className="space-y-4 p-6">
      {/* Cabecalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-escuro">Mapa de clientes</h2>
          <p className="text-sm text-medio/60">
            Onde estao seus clientes, negocios e vendas — cruzado com o potencial
            de mercado (populacao).
          </p>
        </div>
        <div className="flex items-center gap-3">
          {ehAdmin && (
            <SeletorVendedor
              valor={escopo}
              vendedores={agentes}
              onChange={setEscopo}
            />
          )}
          <button
            onClick={() => void carregar(filtros, escopo)}
            disabled={carregando}
            className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany disabled:opacity-60"
          >
            {carregando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi rotulo="Clientes" valor={t ? String(t.clientes) : "—"} />
        <Kpi rotulo="Negocios abertos" valor={t ? String(t.abertos) : "—"} />
        <Kpi rotulo="Valor em aberto" valor={t ? formatarBRL(t.valorAberto) : "—"} />
        <Kpi rotulo="Vendas (ganhos)" valor={t ? String(t.ganhos) : "—"} />
        <Kpi rotulo="Faturamento" valor={t ? formatarBRL(t.faturamento) : "—"} />
        <Kpi rotulo="Perdidos" valor={t ? String(t.perdidos) : "—"} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-black/5 bg-white px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-medio/70">
          <Filter className="h-3.5 w-3.5" />
          Filtros
        </span>
        <SelectFiltro
          rotulo="Categoria"
          valor={filtros.categoria ?? ""}
          opcoes={[
            { v: "", r: "Todas" },
            ...CATEGORIAS_FILTRO.map((c) => ({ v: c, r: c })),
          ]}
          onChange={(v) => setFiltros((f) => ({ ...f, categoria: v || null }))}
        />
        <SelectFiltro
          rotulo="Temperatura"
          valor={filtros.temperatura ?? ""}
          opcoes={[
            { v: "", r: "Todas" },
            { v: "QUENTE", r: "Quente" },
            { v: "MORNO", r: "Morno" },
            { v: "FRIO", r: "Frio" },
          ]}
          onChange={(v) =>
            setFiltros((f) => ({
              ...f,
              temperatura: (v || null) as FiltrosMapa["temperatura"],
            }))
          }
        />
        <SelectFiltro
          rotulo="Situacao"
          valor={filtros.situacao ?? ""}
          opcoes={[
            { v: "", r: "Todas" },
            { v: "abertos", r: "Abertos" },
            { v: "ganhos", r: "Ganhos" },
            { v: "perdidos", r: "Perdidos" },
          ]}
          onChange={(v) =>
            setFiltros((f) => ({
              ...f,
              situacao: (v || null) as FiltrosMapa["situacao"],
            }))
          }
        />
        <SelectFiltro
          rotulo="Periodo"
          valor={filtros.periodo ? String(filtros.periodo) : ""}
          opcoes={[
            { v: "", r: "Todo" },
            { v: "30", r: "30 dias" },
            { v: "90", r: "90 dias" },
          ]}
          onChange={(v) =>
            setFiltros((f) => ({
              ...f,
              periodo: v ? (Number(v) as 30 | 90) : null,
            }))
          }
        />
        {algumFiltroMapa(filtros) && (
          <button
            onClick={() => setFiltros(FILTROS_MAPA_VAZIO)}
            className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-medio/70 transition-colors hover:bg-black/5 hover:text-escuro"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {erro && !dados ? (
        <EstadoErro
          mensagem="Nao foi possivel carregar o mapa."
          onRetry={() => void carregar(filtros, escopo)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Mapa */}
          <Reveal className="lg:col-span-2">
            <div className="rounded-xl border border-black/5 bg-white p-4">
              {/* Seletor de metrica */}
              <div className="mb-3 flex flex-wrap items-center gap-1">
                {METRICAS.map((m) => (
                  <button
                    key={m.chave}
                    onClick={() => setMetrica(m.chave)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      metrica === m.chave
                        ? "bg-tiffany text-white"
                        : "bg-black/5 text-medio hover:bg-black/10"
                    }`}
                  >
                    {m.rotulo}
                  </button>
                ))}
              </div>

              {carregando && !dados ? (
                <div className="skeleton h-[360px] w-full rounded-xl" />
              ) : (
                <MapaBrasil
                  cor={corPorUF}
                  tooltip={tooltip}
                  ufAtivo={ufAtivo}
                  onHoverUF={setUfAtivo}
                  onClickUF={setUfDrawer}
                />
              )}

              <Legenda
                rotulo={metricaCfg.rotulo}
                max={fmtMetrica(maxMetrica || null, metricaCfg.formato)}
              />
              <p className="mt-2 text-center text-[11px] text-medio/50">
                Clique num estado para ver clientes, compradores e negocios.
              </p>
            </div>
          </Reveal>

          {/* Ranking pela metrica ativa */}
          <Reveal delay={60}>
            <div className="rounded-xl border border-black/5 bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-escuro">
                Estados por {metricaCfg.rotulo.toLowerCase()}
              </p>
              <Ranking
                dados={dados?.porUF ?? []}
                metrica={metrica}
                onClickUF={setUfDrawer}
              />
            </div>
          </Reveal>
        </div>
      )}

      {dados && dados.semUF > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-medio/50">
          <Info className="h-3 w-3" />
          {dados.semUF} clientes sem UF identificavel (sem endereco nem DDD valido).
        </p>
      )}

      <p className="text-[11px] text-medio/50">
        Populacao: IBGE (estimativa mais recente).
      </p>

      {/* Drawer do estado */}
      {ufDrawer && (
        <PainelEstadoMapa
          uf={ufDrawer}
          escopo={escopo}
          etapas={etapasEdicao}
          onFechar={() => setUfDrawer(null)}
          onAbrirNegocio={(id) => setNegocioId(id)}
        />
      )}

      {/* Painel do negocio (reuso do Kanban) por cima do drawer */}
      {negocioId && (
        <PainelNegocio
          negocioId={negocioId}
          papel={papel}
          agenteIdAtual={agenteId}
          agentes={agentes}
          etiquetas={etiquetas}
          etapas={etapas}
          onFechar={() => setNegocioId(null)}
          onAtualizado={() => void carregar(filtros, escopo)}
        />
      )}
    </div>
  );
}

// ---- auxiliares ----
function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-medio/70">{rotulo}</span>
      <span className="font-medium text-escuro">{valor}</span>
    </div>
  );
}

function Kpi({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-black/5 bg-white px-3 py-2">
      <p className="text-[11px] text-medio/60">{rotulo}</p>
      <p className="mt-0.5 text-base font-semibold text-escuro">{valor}</p>
    </div>
  );
}

function SelectFiltro({
  rotulo,
  valor,
  opcoes,
  onChange,
}: {
  rotulo: string;
  valor: string;
  opcoes: { v: string; r: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="text-medio/50">{rotulo}</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-black/10 bg-white px-1.5 py-1 text-xs outline-none focus:border-tiffany"
      >
        {opcoes.map((o) => (
          <option key={o.v} value={o.v}>
            {o.r}
          </option>
        ))}
      </select>
    </label>
  );
}

function Legenda({ rotulo, max }: { rotulo: string; max: string }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="flex items-center gap-1.5 text-xs text-medio/60">
        <Users className="h-3.5 w-3.5" />
        {rotulo}
      </div>
      <div
        className="h-2.5 flex-1 rounded-full"
        style={{
          background:
            "linear-gradient(90deg,#e2f4f1 0%,#3cbfb3 50%,#12433d 100%)",
        }}
        aria-hidden
      />
      <div className="text-xs text-medio/60">{max}</div>
    </div>
  );
}

function Ranking({
  dados,
  metrica,
  onClickUF,
}: {
  dados: ResumoUF[];
  metrica: MetricaMapa;
  onClickUF: (uf: string) => void;
}) {
  const cfg = METRICAS.find((m) => m.chave === metrica) ?? METRICAS[0];
  const itens = dados
    .map((r) => ({ uf: r.uf, estado: r.estado, valor: cfg.valor(r) }))
    .filter((i) => i.valor != null && i.valor > 0)
    .sort((a, b) => (b.valor as number) - (a.valor as number))
    .slice(0, 12);
  const max = itens[0]?.valor ?? 0;

  if (itens.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-medio/50">
        Sem dados para esta metrica.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {itens.map((i) => (
        <li key={i.uf}>
          <button
            onClick={() => onClickUF(i.uf)}
            className="group flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-black/5"
          >
            <span className="w-8 shrink-0 text-xs font-medium text-medio/70">
              {i.uf}
            </span>
            <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-black/5">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${max ? ((i.valor as number) / (max as number)) * 100 : 0}%`,
                  background: corEscala(
                    max ? (i.valor as number) / (max as number) : 0,
                    ESCALA_DENSIDADE,
                  ),
                }}
              />
            </span>
            <span className="w-16 shrink-0 text-right text-xs font-semibold text-escuro">
              {fmtMetrica(i.valor, cfg.formato)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
