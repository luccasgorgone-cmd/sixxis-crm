"use client";

// Painel meteorologico PREMIUM de um estado (dentro do drawer da Inteligencia
// Regional, modo Climatizador). Busca /api/inteligencia/clima/estado?uf=XX e
// mostra: AGORA (atual + indice Sixxis + tendencia), curva 24h (temp + sensacao +
// prob. chuva), previsao de 7 DIAS interativa (cards clicaveis com detalhe) e o
// historico ~30d. Tudo derivado da query horaria (fonte unica leve). Cada bloco
// degrada isolado com aviso discreto; skeleton no carregamento. Sem emoji.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  ThermometerSun,
  Droplets,
  CloudRain,
  Wind,
  Sun as SunIcon,
  Gauge,
  TrendingUp,
  TrendingDown,
  Minus,
  CloudOff,
  CalendarRange,
} from "lucide-react";
import { condicaoWeathercode } from "@/lib/weathercode";
import { Reveal } from "./Reveal";
import type { ClimaUF, DetalheClimaResp, PontoPrevisao, Tendencia } from "./tipos";

function fmtTemp(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v)}°C`;
}
function fmtGrau(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v)}°`;
}
function fmtPct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v)}%`;
}
function fmtVento(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v)} km/h`;
}
function fmtUv(v: number | null | undefined): string {
  return v == null ? "—" : String(Math.round(v));
}
function fmtMm(v: number | null | undefined): string {
  return v == null ? "—" : `${v} mm`;
}

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid #e2e8e7",
  fontSize: 12,
} as const;

export function ClimaEstadoDetalhe({
  uf,
  resumo,
}: {
  uf: string;
  resumo: ClimaUF | null | undefined;
}) {
  const [dados, setDados] = useState<DetalheClimaResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/inteligencia/clima/estado?uf=${uf}`);
      if (!r.ok) throw new Error();
      setDados(await r.json());
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [uf]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const previsao = dados?.previsao ?? [];
  const uvHoje = previsao[0]?.uv ?? null;

  return (
    <section className="border-b border-black/5 bg-fundo/40 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5">
        <ThermometerSun className="h-4 w-4 text-tiffany" />
        <p className="text-sm font-semibold text-escuro">Meteorologia do estado</p>
      </div>

      {/* AGORA + indice Sixxis + tendencia */}
      <Agora
        atual={dados?.atual ?? null}
        resumo={resumo}
        uvHoje={uvHoje}
        tendencia={dados?.tendencia ?? null}
      />

      {carregando && !dados ? (
        <div className="mt-3 space-y-3">
          <div className="skeleton h-[120px] w-full rounded-lg" />
          <div className="skeleton h-[110px] w-full rounded-lg" />
          <div className="skeleton h-[150px] w-full rounded-lg" />
        </div>
      ) : erro && !dados ? (
        <Aviso texto="Nao foi possivel carregar a meteorologia." onRetry={carregar} />
      ) : (
        <div className="mt-3 space-y-4">
          {/* Curva 24h: temp + sensacao + prob. chuva */}
          <Grafico titulo="Hoje por hora (temperatura, sensacao e prob. de chuva)">
            {dados && !dados.horarioErro && dados.horarioHoje.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <ComposedChart
                    data={dados.horarioHoje}
                    margin={{ top: 5, right: 8, left: -18, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="gradTempHora" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3cbfb3" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#3cbfb3" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e7" vertical={false} />
                    <XAxis
                      dataKey="hora"
                      tick={{ fontSize: 10, fill: "#5b7a76" }}
                      interval={3}
                      tickFormatter={(h: string) => (h.length >= 2 ? h.slice(0, 2) : h)}
                      axisLine={{ stroke: "#e2e8e7" }}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="temp"
                      tick={{ fontSize: 10, fill: "#5b7a76" }}
                      width={34}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${Math.round(v)}°`}
                    />
                    <YAxis yAxisId="prob" orientation="right" hide domain={[0, 100]} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: unknown, nome: unknown) => {
                        const key = String(nome);
                        if (key === "chuvaProb") return [`${Math.round(Number(v))}%`, "Prob. chuva"];
                        return [
                          `${Math.round(Number(v))}°C`,
                          key === "sensacao" ? "Sensacao" : "Temp.",
                        ];
                      }}
                    />
                    <Bar
                      yAxisId="prob"
                      dataKey="chuvaProb"
                      fill="#bae6fd"
                      radius={[2, 2, 0, 0]}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="temp"
                      stroke="#3cbfb3"
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="sensacao"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-medio/60">
                  <LegItem cor="#3cbfb3" rotulo="Temperatura" />
                  <LegItem cor="#f59e0b" rotulo="Sensacao" />
                  <LegItem cor="#bae6fd" rotulo="Prob. chuva (%)" />
                </div>
              </>
            ) : (
              <MiniVazio texto="Curva do dia indisponivel." />
            )}
          </Grafico>

          {/* Previsao 7 dias — cards interativos */}
          <Grafico titulo="Proximos dias">
            {dados && !dados.previsaoErro && previsao.length > 0 ? (
              <PrevisaoSemana previsao={previsao} />
            ) : (
              <MiniVazio texto="Previsao indisponivel no momento." />
            )}
          </Grafico>

          {/* Historico ~30 dias */}
          <Grafico titulo="Ultimos 30 dias (max/min e chuva)">
            {dados && !dados.historicoErro && dados.historico.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <ComposedChart
                    data={dados.historico}
                    margin={{ top: 5, right: 6, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e7" vertical={false} />
                    <XAxis
                      dataKey="dia"
                      tick={{ fontSize: 10, fill: "#5b7a76" }}
                      interval={5}
                      tickFormatter={fmtDia}
                      axisLine={{ stroke: "#e2e8e7" }}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="temp"
                      tick={{ fontSize: 10, fill: "#5b7a76" }}
                      width={34}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${Math.round(v)}°`}
                    />
                    <YAxis yAxisId="chuva" orientation="right" hide />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={(l: unknown) => fmtDia(String(l))}
                      formatter={(v: unknown, nome: unknown) => {
                        const n = Number(v);
                        const key = String(nome);
                        if (key === "chuva") return [`${n} mm`, "Chuva"];
                        return [
                          `${Math.round(n)}°C`,
                          key === "tempMax" ? "Maxima" : "Minima",
                        ];
                      }}
                    />
                    <Bar
                      yAxisId="chuva"
                      dataKey="chuva"
                      fill="#bae6fd"
                      radius={[2, 2, 0, 0]}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="tempMax"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="tempMin"
                      stroke="#3cbfb3"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-medio/60">
                  <LegItem cor="#f59e0b" rotulo="Maxima" />
                  <LegItem cor="#3cbfb3" rotulo="Minima" />
                  <LegItem cor="#bae6fd" rotulo="Chuva (mm)" />
                </div>
              </>
            ) : (
              <MiniVazio texto="Historico indisponivel." />
            )}
          </Grafico>
        </div>
      )}
    </section>
  );
}

// "YYYY-MM-DD" -> "dd/MM"
function fmtDia(d: string): string {
  if (typeof d !== "string" || d.length < 10) return d;
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}
// "YYYY-MM-DD" -> dia da semana curto PT-BR.
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
function diaSemana(d: string): string {
  const dt = new Date(`${d}T12:00:00Z`);
  return Number.isNaN(dt.getTime()) ? "" : DIAS_SEMANA[dt.getUTCDay()];
}

// ---- AGORA (destaque) ----
function Agora({
  atual,
  resumo,
  uvHoje,
  tendencia,
}: {
  atual: DetalheClimaResp["atual"];
  resumo: ClimaUF | null | undefined;
  uvHoje: number | null;
  tendencia: Tendencia | null;
}) {
  const cond = condicaoWeathercode(atual?.weathercode);
  const CondIcon = cond.Icone;
  const tempAtual = atual?.temp ?? resumo?.tempAtual ?? null;
  return (
    <div className="space-y-2">
      {/* Faixa principal do "agora" */}
      <div className="flex items-center gap-3 rounded-xl border border-tiffany/20 bg-gradient-to-br from-tiffany/[0.07] to-transparent px-3 py-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tiffany/10">
          <CondIcon className="h-7 w-7 text-tiffany" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold leading-none text-escuro">
              {fmtTemp(tempAtual)}
            </span>
            <span className="truncate text-xs text-medio/70">{cond.rotulo}</span>
          </div>
          <p className="mt-1 text-[11px] text-medio/60">
            Sensacao {fmtTemp(atual?.sensacao)}
          </p>
        </div>
        {/* Indice de oportunidade Sixxis (proprietario) */}
        <div className="shrink-0 rounded-lg border border-tiffany/20 bg-white px-2.5 py-1.5 text-right">
          <p className="flex items-center justify-end gap-1 text-[10px] text-medio/50">
            <Gauge className="h-3 w-3" />
            Indice Sixxis
          </p>
          <p className="text-xl font-semibold text-tiffany">
            {resumo?.indiceOportunidade != null ? resumo.indiceOportunidade : "—"}
          </p>
        </div>
      </div>

      {/* Metricas do agora */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Chip icon={<Droplets className="h-3.5 w-3.5" />} rotulo="Umidade" valor={fmtPct(atual?.umidade ?? resumo?.umidade)} />
        <Chip icon={<Wind className="h-3.5 w-3.5" />} rotulo="Vento" valor={fmtVento(atual?.vento)} />
        <Chip icon={<SunIcon className="h-3.5 w-3.5" />} rotulo="UV (hoje)" valor={fmtUv(uvHoje)} />
        <Chip icon={<CloudRain className="h-3.5 w-3.5" />} rotulo="Chuva agora" valor={fmtMm(atual?.chuva)} />
        <div className="col-span-3 flex items-center rounded-lg border border-black/5 bg-white px-2.5 py-1.5 sm:col-span-1">
          <ChipTendencia tendencia={tendencia} />
        </div>
      </div>
    </div>
  );
}

// ---- Previsao 7 dias: cards clicaveis + detalhe do dia selecionado ----
function PrevisaoSemana({ previsao }: { previsao: PontoPrevisao[] }) {
  const [sel, setSel] = useState(0);
  const selecionado = previsao[Math.min(sel, previsao.length - 1)];

  // Faixa de temperatura da semana p/ a barrinha visual de cada dia.
  const [semMin, semMax] = useMemo(() => {
    const mins = previsao.map((p) => p.tempMin).filter((v): v is number => v != null);
    const maxs = previsao.map((p) => p.tempMax).filter((v): v is number => v != null);
    if (!mins.length || !maxs.length) return [null, null] as const;
    return [Math.min(...mins), Math.max(...maxs)] as const;
  }, [previsao]);

  return (
    <div>
      <div className="scroll-fino -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {previsao.map((p, i) => {
          const cond = condicaoWeathercode(p.weathercode);
          const Ic = cond.Icone;
          const ativo = i === sel;
          return (
            <button
              key={p.dia}
              onClick={() => setSel(i)}
              className={`flex w-[72px] shrink-0 flex-col items-center gap-1 rounded-lg border px-1.5 py-2 transition-colors ${
                ativo
                  ? "border-tiffany bg-tiffany/5"
                  : "border-black/5 bg-white hover:border-tiffany/40"
              }`}
            >
              <span className="text-[11px] font-semibold text-escuro">
                {i === 0 ? "Hoje" : diaSemana(p.dia)}
              </span>
              <span className="text-[10px] text-medio/50">{fmtDia(p.dia)}</span>
              <Ic className="my-0.5 h-5 w-5 text-tiffany" />
              <span className="text-xs font-semibold text-escuro">
                {fmtGrau(p.tempMax)}
              </span>
              <BarraTemp
                min={p.tempMin}
                max={p.tempMax}
                semMin={semMin}
                semMax={semMax}
              />
              <span className="text-[10px] text-medio/50">{fmtGrau(p.tempMin)}</span>
              <span className="mt-0.5 flex items-center gap-0.5 text-[10px] text-sky-600 dark:text-sky-400">
                <CloudRain className="h-2.5 w-2.5" />
                {p.chuvaProb != null ? `${Math.round(p.chuvaProb)}%` : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Detalhe do dia selecionado */}
      {selecionado && (
        <Reveal key={selecionado.dia}>
          <div className="mt-2 rounded-lg border border-black/5 bg-fundo/60 p-3">
            <div className="mb-2 flex items-center gap-2">
              {(() => {
                const Ic = condicaoWeathercode(selecionado.weathercode).Icone;
                return <Ic className="h-4 w-4 text-tiffany" />;
              })()}
              <p className="text-sm font-semibold text-escuro">
                {diaSemana(selecionado.dia)} {fmtDia(selecionado.dia)}
              </p>
              <span className="text-xs text-medio/60">
                {condicaoWeathercode(selecionado.weathercode).rotulo}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <DetalheItem rotulo="Maxima / minima" valor={`${fmtTemp(selecionado.tempMax)} / ${fmtTemp(selecionado.tempMin)}`} />
              <DetalheItem
                rotulo="Chuva"
                valor={
                  selecionado.chuvaProb != null
                    ? `${fmtMm(selecionado.chuva)} (${Math.round(selecionado.chuvaProb)}%)`
                    : fmtMm(selecionado.chuva)
                }
              />
              <DetalheItem rotulo="Vento" valor={fmtVento(selecionado.vento)} />
              <DetalheItem rotulo="UV" valor={fmtUv(selecionado.uv)} />
            </div>
          </div>
        </Reveal>
      )}
    </div>
  );
}

// Barrinha visual: faixa min->max do dia dentro da faixa da semana.
function BarraTemp({
  min,
  max,
  semMin,
  semMax,
}: {
  min: number | null;
  max: number | null;
  semMin: number | null;
  semMax: number | null;
}) {
  if (min == null || max == null || semMin == null || semMax == null || semMax <= semMin) {
    return <span className="h-1 w-8 rounded-full bg-black/5" />;
  }
  const faixa = semMax - semMin;
  const left = ((min - semMin) / faixa) * 100;
  const width = Math.max(6, ((max - min) / faixa) * 100);
  return (
    <span className="relative h-1 w-8 overflow-hidden rounded-full bg-black/5">
      <span
        className="absolute inset-y-0 rounded-full"
        style={{
          left: `${left}%`,
          width: `${width}%`,
          background: "linear-gradient(90deg,#3cbfb3,#f59e0b)",
        }}
      />
    </span>
  );
}

function DetalheItem({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-md border border-black/5 bg-white px-2 py-1.5">
      <p className="text-[10px] text-medio/50">{rotulo}</p>
      <p className="mt-0.5 text-xs font-semibold text-escuro">{valor}</p>
    </div>
  );
}

function Chip({
  icon,
  rotulo,
  valor,
}: {
  icon: React.ReactNode;
  rotulo: string;
  valor: string;
}) {
  return (
    <div className="rounded-lg border border-black/5 bg-white px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[11px] text-medio/60">
        {icon}
        {rotulo}
      </div>
      <p className="mt-0.5 text-sm font-semibold text-escuro">{valor}</p>
    </div>
  );
}

function ChipTendencia({ tendencia }: { tendencia: Tendencia | null }) {
  if (!tendencia) {
    return <span className="text-xs text-medio/50">Tendencia indisponivel</span>;
  }
  const cfg =
    tendencia === "esquentando"
      ? { icon: <TrendingUp className="h-3.5 w-3.5" />, rotulo: "Esquentando", classe: "text-amber-600 dark:text-amber-400" }
      : tendencia === "esfriando"
        ? { icon: <TrendingDown className="h-3.5 w-3.5" />, rotulo: "Esfriando", classe: "text-sky-600 dark:text-sky-400" }
        : { icon: <Minus className="h-3.5 w-3.5" />, rotulo: "Estavel", classe: "text-medio/70" };
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-medio/60">Tendencia (7d)</span>
      <span className={`mt-0.5 flex items-center gap-1 text-sm font-semibold ${cfg.classe}`}>
        {cfg.icon}
        {cfg.rotulo}
      </span>
    </div>
  );
}

function Grafico({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-black/5 bg-white p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-medio/70">
          <CalendarRange className="h-3.5 w-3.5 text-medio/40" />
          {titulo}
        </p>
        {acao}
      </div>
      {children}
    </div>
  );
}

function MiniVazio({ texto }: { texto: string }) {
  return (
    <div className="flex h-[100px] flex-col items-center justify-center gap-1.5 text-center text-xs text-medio/50">
      <CloudOff className="h-5 w-5" />
      {texto}
    </div>
  );
}

function LegItem({ cor, rotulo }: { cor: string; rotulo: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: cor }} />
      {rotulo}
    </span>
  );
}

function Aviso({ texto, onRetry }: { texto: string; onRetry: () => void }) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
      <CloudOff className="h-4 w-4 shrink-0" />
      <span>{texto}</span>
      <button
        onClick={onRetry}
        className="ml-auto rounded-md px-2 py-0.5 font-medium underline-offset-2 hover:underline"
      >
        Tentar de novo
      </button>
    </div>
  );
}
