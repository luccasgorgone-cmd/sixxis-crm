"use client";

// SOL-2: dashboard da Sol (somente leitura). Mostra o que ela faz, quanto custa
// e quantos atendimentos viram venda. Nenhuma acao liga/desliga a Sol aqui —
// isso continua no painel de configuracao acima.
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

type Metricas = {
  periodo: { desde: string; ate: string };
  acoes: Record<string, number>;
  volume: { eventos: number; conversas: number; leads: number };
  custo: {
    moeda: string;
    total: number;
    medioPorConversa: number;
    tokensEntrada: number;
    tokensSaida: number;
    eventosComCusto: number;
    eventosSemMedicao: number;
    modelosSemPreco: { modelo: string; eventos: number }[];
  };
  motivos: {
    handoff: { itens: { motivo: string; total: number }[]; outros: number; distintos: number };
    silenciar: { itens: { motivo: string; total: number }[]; outros: number; distintos: number };
  };
  conversao: { atendidos: number; ganhos: number; taxa: number; criterio: string };
  serie: { dia: string; eventos: number; custo: number }[];
};

type Periodo = "7d" | "30d" | "custom";

const nf = new Intl.NumberFormat("pt-BR");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
// Custo em DOLAR (a Anthropic cobra em USD; nao convertemos sem cotacao).
const usd = (v: number) =>
  `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usdFino = (v: number) =>
  `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

function diaISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function MetricasSol() {
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [desde, setDesde] = useState(() =>
    diaISO(new Date(Date.now() - 29 * 864e5)),
  );
  const [ate, setAte] = useState(() => diaISO(new Date()));
  const [dados, setDados] = useState<Metricas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Presets calculam a janela no cliente; "custom" usa os dois campos de data.
  const query = useMemo(() => {
    if (periodo === "custom") return `desde=${desde}&ate=${ate}`;
    const dias = periodo === "7d" ? 7 : 30;
    return `desde=${diaISO(new Date(Date.now() - (dias - 1) * 864e5))}&ate=${diaISO(new Date())}`;
  }, [periodo, desde, ate]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/admin/ia/metricas?${query}`);
      if (!r.ok) throw new Error();
      setDados((await r.json()) as Metricas);
      setErro(null);
    } catch {
      setErro("Nao foi possivel carregar as metricas da Sol.");
    } finally {
      setCarregando(false);
    }
  }, [query]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totalAcoes = dados
    ? Object.values(dados.acoes).reduce((s, v) => s + v, 0)
    : 0;
  const taxa = (n: number) => (totalAcoes > 0 ? n / totalAcoes : 0);

  const serie = useMemo(
    () =>
      (dados?.serie ?? []).map((d) => ({
        ...d,
        rotulo: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}`,
      })),
    [dados],
  );

  const vazio = !carregando && !erro && dados !== null && dados.volume.eventos === 0;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-escuro">Desempenho da Sol</h3>
          <p className="text-xs text-medio/60">
            O que ela fez no periodo, quanto custou e quanto virou venda. Somente
            leitura.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-black/10">
            {(["7d", "30d", "custom"] as Periodo[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  periodo === p
                    ? "bg-tiffany text-white"
                    : "bg-white text-medio hover:text-escuro"
                }`}
              >
                {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "Periodo"}
              </button>
            ))}
          </div>
          {periodo === "custom" && (
            <>
              <input
                type="date"
                value={desde}
                max={ate}
                onChange={(e) => setDesde(e.target.value)}
                className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-tiffany"
              />
              <input
                type="date"
                value={ate}
                min={desde}
                onChange={(e) => setAte(e.target.value)}
                className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-tiffany"
              />
            </>
          )}
          <button
            onClick={() => void carregar()}
            disabled={carregando}
            title="Recarregar"
            className="rounded-lg border border-black/10 bg-white p-1.5 text-medio transition-colors hover:border-tiffany/40 hover:text-tiffany disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {carregando && !dados ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-black/5 bg-white text-sm text-medio/50">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando metricas...
          </div>
        ) : erro ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {erro}
            <button
              onClick={() => void carregar()}
              className="ml-2 font-semibold underline"
            >
              Tentar de novo
            </button>
          </div>
        ) : vazio ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-black/5 bg-white px-6 text-center text-sm text-medio/50">
            A Sol ainda nao atendeu no periodo.
          </div>
        ) : dados ? (
          <>
            {/* Avisos que tornam o custo honesto: sem eles o total parece completo. */}
            {dados.custo.eventosSemMedicao > 0 && (
              <Aviso>
                {nf.format(dados.custo.eventosSemMedicao)} de{" "}
                {nf.format(dados.volume.eventos)} atendimentos sao anteriores a
                medicao de custo — eles contam no volume, mas o custo deles e
                desconhecido (nao zero). O total abaixo cobre{" "}
                {nf.format(dados.custo.eventosComCusto)} atendimentos.
              </Aviso>
            )}
            {dados.custo.modelosSemPreco.length > 0 && (
              <Aviso>
                Sem preco cadastrado para{" "}
                {dados.custo.modelosSemPreco
                  .map((m) => `${m.modelo} (${nf.format(m.eventos)})`)
                  .join(", ")}
                . O custo total esta SUBESTIMADO ate cadastrar em lib/custoIA.ts.
              </Aviso>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <Cartao
                rotulo="Atendimentos"
                valor={nf.format(dados.volume.eventos)}
                nota={`${nf.format(dados.volume.conversas)} conversas`}
              />
              <Cartao
                rotulo="Handoff"
                valor={pct(taxa(dados.acoes.handoff ?? 0))}
                nota={`${nf.format(dados.acoes.handoff ?? 0)} passados a humano`}
              />
              <Cartao
                rotulo="Silenciar"
                valor={pct(taxa(dados.acoes.silenciar ?? 0))}
                nota={`${nf.format(dados.acoes.silenciar ?? 0)} sem resposta`}
              />
              <Cartao
                rotulo="Custo total"
                valor={usd(dados.custo.total)}
                nota={`${nf.format(dados.custo.tokensEntrada + dados.custo.tokensSaida)} tokens`}
              />
              <Cartao
                rotulo="Custo/atendimento"
                valor={usdFino(dados.custo.medioPorConversa)}
                nota="por conversa atendida"
              />
              <Cartao
                rotulo="Virou venda"
                valor={pct(dados.conversao.taxa)}
                nota={`${nf.format(dados.conversao.ganhos)} de ${nf.format(dados.conversao.atendidos)} clientes`}
                titulo={dados.conversao.criterio}
              />
            </div>

            {/* Grafico: mesma lib do GraficoTendencia (recharts). Dois eixos —
                contagem e dolar nao compartilham escala. */}
            <div className="rounded-xl border border-black/5 bg-white p-4">
              <p className="mb-3 text-sm font-semibold text-escuro">
                Atendimentos e custo por dia
              </p>
              {serie.length === 0 ? (
                <div className="flex h-52 items-center justify-center text-sm text-medio/50">
                  Sem dados no periodo.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={serie} margin={{ left: -20, right: 8, top: 4 }}>
                    <defs>
                      <linearGradient id="gSolEv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3cbfb3" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#3cbfb3" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gSolCusto" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis
                      yAxisId="ev"
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "#64748b" }}
                    />
                    <YAxis
                      yAxisId="custo"
                      orientation="right"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e2e8e7",
                        fontSize: 12,
                      }}
                      formatter={(v, nome) => {
                        const n = Number(v ?? 0);
                        return nome === "Custo (US$)" ? usdFino(n) : nf.format(n);
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      yAxisId="ev"
                      type="monotone"
                      dataKey="eventos"
                      name="Atendimentos"
                      stroke="#3cbfb3"
                      fill="url(#gSolEv)"
                      strokeWidth={2}
                    />
                    <Area
                      yAxisId="custo"
                      type="monotone"
                      dataKey="custo"
                      name="Custo (US$)"
                      stroke="#f59e0b"
                      fill="url(#gSolCusto)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Onde a Sol trava: e o que diz o que melhorar na base. */}
            <div className="grid gap-3 lg:grid-cols-2">
              <TabelaMotivos
                titulo="Por que passou para um humano"
                vazio="Nenhum handoff no periodo."
                dados={dados.motivos.handoff}
              />
              <TabelaMotivos
                titulo="Por que silenciou"
                vazio="Nenhum silenciamento no periodo."
                dados={dados.motivos.silenciar}
              />
            </div>

            <p className="text-[11px] text-medio/50">
              Custo em dolar (moeda cobrada pela Anthropic), estimado pelos tokens
              de cada decisao. &quot;Virou venda&quot;: {dados.conversao.criterio}.
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

function Cartao({
  rotulo,
  valor,
  nota,
  titulo,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  titulo?: string;
}) {
  return (
    <div
      className="min-w-0 rounded-xl border border-black/5 bg-white px-3 py-2.5"
      title={titulo}
    >
      <p className="truncate text-[10px] uppercase tracking-wide text-medio/50">
        {rotulo}
      </p>
      <p className="mt-0.5 truncate text-lg font-semibold text-escuro" title={valor}>
        {valor}
      </p>
      {nota && <p className="truncate text-[11px] text-medio/60">{nota}</p>}
    </div>
  );
}

function TabelaMotivos({
  titulo,
  vazio,
  dados,
}: {
  titulo: string;
  vazio: string;
  dados: { itens: { motivo: string; total: number }[]; outros: number; distintos: number };
}) {
  const maior = dados.itens[0]?.total ?? 0;
  return (
    <div className="rounded-xl border border-black/5 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-escuro">{titulo}</p>
      {dados.itens.length === 0 ? (
        <p className="py-6 text-center text-sm text-medio/50">{vazio}</p>
      ) : (
        <ul className="space-y-2">
          {dados.itens.map((m) => (
            <li key={m.motivo}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-xs text-escuro" title={m.motivo}>
                  {m.motivo}
                </span>
                <span className="shrink-0 text-xs font-semibold text-medio">
                  {nf.format(m.total)}
                </span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-black/5">
                <div
                  className="h-1 rounded-full bg-tiffany"
                  style={{ width: `${maior > 0 ? (m.total / maior) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {/* O corte no top N e dito em voz alta — senao a lista parece completa. */}
      {dados.outros > 0 && (
        <p className="mt-3 text-[11px] text-medio/50">
          + {nf.format(dados.outros)} em outros {dados.distintos - dados.itens.length}{" "}
          motivos menos frequentes.
        </p>
      )}
    </div>
  );
}
