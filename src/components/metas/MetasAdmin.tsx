"use client";

// Admin > Metas: CRUD de metas + visao de atingimento (cards com barra de
// progresso, %, ritmo, dias restantes) e leaderboard por colaborador.
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Target,
  Trophy,
  Users,
  User,
  CalendarClock,
  TrendingUp,
} from "lucide-react";
import { Cabecalho } from "@/components/admin/VendedoresAdmin";
import { corFinalidade } from "@/components/BadgeFinalidade";
import {
  type Meta,
  type Metrica,
  type Escopo,
  type Periodo,
  type Finalidade,
  METRICAS,
  ROTULO_METRICA,
  ROTULO_PERIODO,
  RITMO_INFO,
  formatarValor,
  pctExibido,
  alvoParaInput,
  inputParaAlvo,
  ehTempo,
} from "./tipos";

type Vendedor = { id: string; nome: string };
type FiltroEscopo = "TODAS" | "COLABORADOR" | "EQUIPE";

export function MetasAdmin() {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Meta | null>(null);
  const [filtroEscopo, setFiltroEscopo] = useState<FiltroEscopo>("TODAS");
  const [filtroPeriodo, setFiltroPeriodo] = useState<Periodo | "TODOS">("TODOS");
  const [incluirInativas, setIncluirInativas] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/admin/metas");
    if (r.ok) setMetas((await r.json()).metas);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
    void (async () => {
      const r = await fetch("/api/vendedores");
      if (r.ok) setVendedores((await r.json()).vendedores);
    })();
  }, [carregar]);

  async function remover(id: string) {
    if (!confirm("Remover esta meta? A acao nao pode ser desfeita.")) return;
    await fetch(`/api/admin/metas/${id}`, { method: "DELETE" });
    await carregar();
  }

  async function alternarAtivo(m: Meta) {
    await fetch(`/api/admin/metas/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !m.ativo }),
    });
    await carregar();
  }

  const filtradas = useMemo(
    () =>
      metas.filter(
        (m) =>
          (incluirInativas || m.ativo) &&
          (filtroEscopo === "TODAS" || m.escopo === filtroEscopo) &&
          (filtroPeriodo === "TODOS" || m.periodo === filtroPeriodo),
      ),
    [metas, incluirInativas, filtroEscopo, filtroPeriodo],
  );

  const leaderboard = useMemo(() => construirLeaderboard(metas), [metas]);

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Metas"
        subtitulo="Defina metas por colaborador ou equipe e acompanhe o atingimento"
        acao={
          <button
            onClick={() => setCriando(true)}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro"
          >
            <Plus className="h-4 w-4" /> Nova meta
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmento
          opcoes={[
            ["TODAS", "Todas"],
            ["COLABORADOR", "Colaborador"],
            ["EQUIPE", "Equipe"],
          ]}
          valor={filtroEscopo}
          onChange={(v) => setFiltroEscopo(v as FiltroEscopo)}
        />
        <select
          value={filtroPeriodo}
          onChange={(e) => setFiltroPeriodo(e.target.value as Periodo | "TODOS")}
          className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm outline-none focus:border-tiffany"
        >
          <option value="TODOS">Todos os periodos</option>
          <option value="DIARIA">Diaria</option>
          <option value="SEMANAL">Semanal</option>
          <option value="MENSAL">Mensal</option>
          <option value="CUSTOM">Personalizada</option>
        </select>
        <label className="ml-auto flex items-center gap-2 text-sm text-medio/70">
          <input
            type="checkbox"
            checked={incluirInativas}
            onChange={(e) => setIncluirInativas(e.target.checked)}
            className="h-4 w-4 accent-tiffany"
          />
          Incluir inativas
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {carregando ? (
            <ListaSkeleton />
          ) : filtradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/10 bg-white py-16 text-center">
              <Target className="h-8 w-8 text-medio/30" />
              <p className="text-sm font-medium text-escuro">Nenhuma meta</p>
              <p className="text-xs text-medio/60">
                Crie a primeira meta para comecar a acompanhar.
              </p>
            </div>
          ) : (
            filtradas.map((m) => (
              <CartaoAdmin
                key={m.id}
                meta={m}
                onEditar={() => setEditando(m)}
                onRemover={() => void remover(m.id)}
                onAtivo={() => void alternarAtivo(m)}
              />
            ))
          )}
        </div>

        <div className="xl:col-span-1">
          <Leaderboard itens={leaderboard} />
        </div>
      </div>

      {(criando || editando) && (
        <ModalMeta
          meta={editando}
          vendedores={vendedores}
          onFechar={() => {
            setCriando(false);
            setEditando(null);
          }}
          onSalvo={async () => {
            setCriando(false);
            setEditando(null);
            await carregar();
          }}
        />
      )}
    </div>
  );
}

function CartaoAdmin({
  meta,
  onEditar,
  onRemover,
  onAtivo,
}: {
  meta: Meta;
  onEditar: () => void;
  onRemover: () => void;
  onAtivo: () => void;
}) {
  const p = meta.progresso;
  const c = corFinalidade(meta.finalidade);
  const ritmo = RITMO_INFO[p.ritmo];
  const corBarra = p.atingida ? "#16a34a" : c.hex;
  const titulo = meta.nome ?? ROTULO_METRICA[meta.metrica];
  const larguraBarra = Math.max(2, Math.min(pctExibido(p), 100));

  return (
    <div
      className={`rounded-2xl border bg-white p-5 ${
        p.atingida ? "border-green-300" : "border-black/5"
      } ${meta.ativo ? "" : "opacity-60"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Chip finalidade={meta.finalidade} />
            <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-medio/70">
              {meta.escopo === "EQUIPE" ? (
                <>
                  <Users className="h-3 w-3" /> Equipe
                </>
              ) : (
                <>
                  <User className="h-3 w-3" /> {meta.agente?.nome ?? "Colaborador"}
                </>
              )}
            </span>
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-medio/70">
              {ROTULO_PERIODO[meta.periodo]}
            </span>
            {p.atingida && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                <Trophy className="h-3 w-3" /> Batida
              </span>
            )}
          </div>
          <p className="mt-2 text-sm font-semibold text-escuro">{titulo}</p>
          <p className="text-xs text-medio/60">
            {ROTULO_METRICA[meta.metrica]}
            {!p.maiorMelhor && " · abaixo de"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onAtivo}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              meta.ativo
                ? "bg-green-100 text-green-700"
                : "bg-black/10 text-medio/60"
            }`}
          >
            {meta.ativo ? "Ativa" : "Inativa"}
          </button>
          <button
            onClick={onEditar}
            className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onRemover}
            className="rounded-lg p-1.5 text-medio/50 hover:bg-black/5 hover:text-erro"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-end justify-between">
          <span className="text-lg font-semibold text-escuro">
            {formatarValor(meta.metrica, p.atual)}
            <span className="ml-1 text-xs font-normal text-medio/60">
              {p.maiorMelhor ? "de" : "/ abaixo de"}{" "}
              {formatarValor(meta.metrica, p.alvo)}
            </span>
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: corBarra }}
          >
            {pctExibido(p)}%
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/5">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${larguraBarra}%`, backgroundColor: corBarra }}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${ritmo.classe}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${ritmo.ponto}`} />
          {ritmo.rotulo}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1 font-medium text-medio/70">
          <CalendarClock className="h-3.5 w-3.5" />
          {p.encerrada
            ? "Encerrada"
            : p.diasRestantes === 0
              ? "Ultimo dia"
              : `${p.diasRestantes} ${p.diasRestantes === 1 ? "dia restante" : "dias restantes"}`}
        </span>
        <span className="inline-flex items-center gap-1 text-medio/60">
          <TrendingUp className="h-3.5 w-3.5" />
          Projecao {formatarValor(meta.metrica, p.projecao)}
        </span>
      </div>
    </div>
  );
}

type ItemLeaderboard = {
  id: string;
  nome: string;
  metas: number;
  batidas: number;
  media: number; // 0..1 media dos percentuais (clampados)
};

function construirLeaderboard(metas: Meta[]): ItemLeaderboard[] {
  const mapa = new Map<string, ItemLeaderboard>();
  for (const m of metas) {
    if (m.escopo !== "COLABORADOR" || !m.agente || !m.ativo) continue;
    const it = mapa.get(m.agente.id) ?? {
      id: m.agente.id,
      nome: m.agente.nome,
      metas: 0,
      batidas: 0,
      media: 0,
    };
    it.metas += 1;
    if (m.progresso.atingida) it.batidas += 1;
    it.media += Math.min(m.progresso.percentual, 1);
    mapa.set(m.agente.id, it);
  }
  return Array.from(mapa.values())
    .map((it) => ({ ...it, media: it.metas ? it.media / it.metas : 0 }))
    .sort((a, b) => b.media - a.media);
}

function Leaderboard({ itens }: { itens: ItemLeaderboard[] }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
        <Trophy className="h-4 w-4 text-amber-500" /> Atingimento por colaborador
      </h3>
      {itens.length === 0 ? (
        <p className="mt-4 text-xs text-medio/60">
          Sem metas de colaborador ativas para ranquear.
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {itens.map((it, i) => {
            const pct = Math.round(it.media * 100);
            return (
              <li key={it.id} className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    i === 0
                      ? "bg-amber-100 text-amber-700"
                      : i === 1
                        ? "bg-slate-200 text-slate-600"
                        : i === 2
                          ? "bg-orange-100 text-orange-700"
                          : "bg-black/5 text-medio/60"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-escuro">
                      {it.nome}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-tiffany">
                      {pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                    <div
                      className="h-full rounded-full bg-tiffany transition-all duration-700"
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[10px] text-medio/50">
                    {it.batidas}/{it.metas} batidas
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ModalMeta({
  meta,
  vendedores,
  onFechar,
  onSalvo,
}: {
  meta: Meta | null;
  vendedores: Vendedor[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const edicao = Boolean(meta);
  const [nome, setNome] = useState(meta?.nome ?? "");
  const [escopo, setEscopo] = useState<Escopo>(meta?.escopo ?? "COLABORADOR");
  const [agenteId, setAgenteId] = useState(meta?.agenteId ?? "");
  const [finalidade, setFinalidade] = useState<Finalidade>(
    meta?.finalidade ?? "AMBAS",
  );
  const [metrica, setMetrica] = useState<Metrica>(
    meta?.metrica ?? "VALOR_VENDIDO",
  );
  const [periodo, setPeriodo] = useState<Periodo>(meta?.periodo ?? "MENSAL");
  const [alvo, setAlvo] = useState(
    meta ? String(alvoParaInput(meta.metrica, meta.alvo)) : "",
  );
  const [inicio, setInicio] = useState(
    meta ? meta.inicio.slice(0, 10) : datasPreset("MENSAL").inicio,
  );
  const [fim, setFim] = useState(
    meta ? meta.fim.slice(0, 10) : datasPreset("MENSAL").fim,
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const unidade = METRICAS.find((x) => x.chave === metrica)?.unidade ?? "";

  function aplicarPeriodo(p: Periodo) {
    setPeriodo(p);
    if (p !== "CUSTOM") {
      const d = datasPreset(p);
      setInicio(d.inicio);
      setFim(d.fim);
    }
  }

  async function salvar() {
    setErro(null);
    const alvoNum = Number(alvo);
    if (!Number.isFinite(alvoNum) || alvoNum <= 0) {
      setErro("Informe um alvo maior que zero.");
      return;
    }
    if (escopo === "COLABORADOR" && !agenteId) {
      setErro("Selecione o colaborador.");
      return;
    }
    if (!inicio || !fim || fim < inicio) {
      setErro("Verifique as datas de inicio e fim.");
      return;
    }
    setSalvando(true);
    try {
      const corpo = {
        nome,
        escopo,
        agenteId: escopo === "COLABORADOR" ? agenteId : null,
        finalidade,
        metrica,
        alvo: inputParaAlvo(metrica, alvoNum),
        periodo,
        inicio: `${inicio}T00:00:00`,
        fim: `${fim}T23:59:59`,
      };
      const r = await fetch(
        edicao ? `/api/admin/metas/${meta!.id}` : "/api/admin/metas",
        {
          method: edicao ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        setErro(d?.erro ?? "Nao foi possivel salvar.");
        setSalvando(false);
        return;
      }
      onSalvo();
    } catch {
      setErro("Falha ao salvar.");
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="scroll-fino max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-escuro">
            {edicao ? "Editar meta" : "Nova meta"}
          </h3>
          <button
            onClick={onFechar}
            className="rounded-lg p-1 text-medio/60 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <Rotulo>Nome (opcional)</Rotulo>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Meta de vendas do mes"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </div>

          <div>
            <Rotulo>Escopo</Rotulo>
            <Segmento
              opcoes={[
                ["COLABORADOR", "Colaborador"],
                ["EQUIPE", "Equipe"],
              ]}
              valor={escopo}
              onChange={(v) => setEscopo(v as Escopo)}
              cheio
            />
          </div>

          {escopo === "COLABORADOR" && (
            <div>
              <Rotulo>Colaborador</Rotulo>
              <select
                value={agenteId}
                onChange={(e) => setAgenteId(e.target.value)}
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
              >
                <option value="">Selecione...</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Rotulo>Finalidade</Rotulo>
            <Segmento
              opcoes={[
                ["AMBAS", "Geral"],
                ["VENDA", "Venda"],
                ["POS_VENDA", "Pos-venda"],
              ]}
              valor={finalidade}
              onChange={(v) => setFinalidade(v as Finalidade)}
              cheio
              corDe={(v) =>
                v === "VENDA"
                  ? "#3cbfb3"
                  : v === "POS_VENDA"
                    ? "#7c3aed"
                    : undefined
              }
            />
          </div>

          <div>
            <Rotulo>Metrica</Rotulo>
            <select
              value={metrica}
              onChange={(e) => setMetrica(e.target.value as Metrica)}
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            >
              {METRICAS.map((m) => (
                <option key={m.chave} value={m.chave}>
                  {m.rotulo}
                  {m.maiorMelhor ? "" : " (menor e melhor)"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Rotulo>
              Alvo {ehTempo(metrica) ? "(abaixo de, em minutos)" : `(${unidade})`}
            </Rotulo>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step="any"
                value={alvo}
                onChange={(e) => setAlvo(e.target.value)}
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
              />
              <span className="shrink-0 text-sm text-medio/60">{unidade}</span>
            </div>
          </div>

          <div>
            <Rotulo>Periodo</Rotulo>
            <Segmento
              opcoes={[
                ["DIARIA", "Diaria"],
                ["SEMANAL", "Semanal"],
                ["MENSAL", "Mensal"],
                ["CUSTOM", "Custom"],
              ]}
              valor={periodo}
              onChange={(v) => aplicarPeriodo(v as Periodo)}
              cheio
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Rotulo>Inicio</Rotulo>
              <input
                type="date"
                value={inicio}
                onChange={(e) => {
                  setInicio(e.target.value);
                  setPeriodo("CUSTOM");
                }}
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
              />
            </div>
            <div>
              <Rotulo>Fim</Rotulo>
              <input
                type="date"
                value={fim}
                onChange={(e) => {
                  setFim(e.target.value);
                  setPeriodo("CUSTOM");
                }}
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
              />
            </div>
          </div>
        </div>

        {erro && <p className="mt-3 text-xs text-erro">{erro}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onFechar}
            className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={() => void salvar()}
            disabled={salvando}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// Datas-padrao (yyyy-mm-dd) para cada preset de periodo, baseadas em hoje.
function datasPreset(p: Periodo): { inicio: string; fim: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const hoje = new Date();
  if (p === "DIARIA") return { inicio: iso(hoje), fim: iso(hoje) };
  if (p === "SEMANAL") {
    const fim = new Date(hoje);
    fim.setDate(fim.getDate() + 6);
    return { inicio: iso(hoje), fim: iso(fim) };
  }
  if (p === "MENSAL") {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return { inicio: iso(ini), fim: iso(fim) };
  }
  const fim = new Date(hoje);
  fim.setDate(fim.getDate() + 30);
  return { inicio: iso(hoje), fim: iso(fim) };
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-sm font-medium text-escuro">
      {children}
    </label>
  );
}

function Segmento({
  opcoes,
  valor,
  onChange,
  cheio,
  corDe,
}: {
  opcoes: [string, string][];
  valor: string;
  onChange: (v: string) => void;
  cheio?: boolean;
  corDe?: (v: string) => string | undefined;
}) {
  return (
    <div
      className={`flex overflow-hidden rounded-lg border border-black/10 ${
        cheio ? "w-full" : ""
      }`}
    >
      {opcoes.map(([chave, rotulo]) => {
        const ativo = valor === chave;
        const cor = corDe?.(chave);
        return (
          <button
            key={chave}
            type="button"
            onClick={() => onChange(chave)}
            style={ativo && cor ? { backgroundColor: cor } : undefined}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              cheio ? "flex-1" : ""
            } ${
              ativo
                ? cor
                  ? "text-white"
                  : "bg-tiffany text-white"
                : "bg-white text-medio hover:bg-black/5"
            }`}
          >
            {rotulo}
          </button>
        );
      })}
    </div>
  );
}

function Chip({ finalidade }: { finalidade: Finalidade }) {
  if (finalidade === "AMBAS") {
    return (
      <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-medio/70">
        Geral
      </span>
    );
  }
  const c = corFinalidade(finalidade);
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.badge}`}>
      {c.rotulo}
    </span>
  );
}

function ListaSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-black/5 bg-white p-5">
          <div className="skeleton h-4 w-40" />
          <div className="skeleton mt-4 h-7 w-32" />
          <div className="skeleton mt-3 h-2.5 w-full rounded-full" />
        </div>
      ))}
    </>
  );
}
