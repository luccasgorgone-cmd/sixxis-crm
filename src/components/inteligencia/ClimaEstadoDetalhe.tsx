"use client";

// Painel meteorologico COMPLETO de um estado (dentro do drawer da Inteligencia
// Regional, modo Climatizador). Busca /api/inteligencia/clima/estado?uf=XX e
// mostra: AGORA (atual + indice Sixxis), curva 24h (temp + sensacao + prob.
// chuva), previsao estendida ate 16 dias (dia a dia), historico ~30d e tendencia.
// Skeleton enquanto carrega; cada parte degrada isolada sem quebrar o painel.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
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
import type { ClimaUF, DetalheClimaResp, Tendencia } from "./tipos";

function fmtTemp(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v)}°C`;
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

const HORIZONTES = [7, 14, 16] as const;
type Horizonte = (typeof HORIZONTES)[number];

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
  const [horizonte, setHorizonte] = useState<Horizonte>(7);

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

  const previsao = useMemo(
    () => (dados?.previsao ?? []).slice(0, horizonte),
    [dados, horizonte],
  );
  const uvHoje = dados?.previsao?.[0]?.uv ?? null;

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
          <div className="skeleton h-[150px] w-full rounded-lg" />
          <div className="skeleton h-[130px] w-full rounded-lg" />
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
                      strokeWidth={2}
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

          {/* Previsao estendida (dia a dia) */}
          <Grafico
            titulo="Previsao estendida"
            acao={
              <div className="flex overflow-hidden rounded-md border border-black/10">
                {HORIZONTES.map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorizonte(h)}
                    className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      horizonte === h
                        ? "bg-tiffany text-white"
                        : "bg-white text-medio hover:bg-black/5"
                    }`}
                  >
                    {h}d
                  </button>
                ))}
              </div>
            }
          >
            {dados && !dados.previsaoErro && previsao.length > 0 ? (
              <TabelaPrevisao previsao={previsao} />
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

// ---- AGORA ----
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
      <div className="flex items-center gap-3 rounded-lg border border-black/5 bg-white px-3 py-2.5">
        <CondIcon className="h-8 w-8 shrink-0 text-tiffany" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-escuro">
              {fmtTemp(tempAtual)}
            </span>
            <span className="truncate text-xs text-medio/70">{cond.rotulo}</span>
          </div>
          <p className="text-[11px] text-medio/60">
            Sensacao {fmtTemp(atual?.sensacao)}
          </p>
        </div>
        {/* Indice de oportunidade Sixxis (proprietario) */}
        <div className="shrink-0 text-right">
          <p className="flex items-center justify-end gap-1 text-[10px] text-medio/50">
            <Gauge className="h-3 w-3" />
            Indice Sixxis
          </p>
          <p className="text-lg font-semibold text-tiffany">
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

// ---- Tabela de previsao estendida ----
function TabelaPrevisao({
  previsao,
}: {
  previsao: DetalheClimaResp["previsao"];
}) {
  return (
    <div className="scroll-fino overflow-x-auto">
      <table className="w-full min-w-[420px] text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-medio/50">
            <th className="py-1 pr-2 font-medium">Dia</th>
            <th className="py-1 pr-2 font-medium">Condicao</th>
            <th className="py-1 pr-2 text-right font-medium">Max/Min</th>
            <th className="py-1 pr-2 text-right font-medium">Chuva</th>
            <th className="py-1 pr-2 text-right font-medium">Vento</th>
            <th className="py-1 text-right font-medium">UV</th>
          </tr>
        </thead>
        <tbody>
          {previsao.map((p) => {
            const cond = condicaoWeathercode(p.weathercode);
            const Ic = cond.Icone;
            return (
              <tr key={p.dia} className="border-t border-black/5">
                <td className="py-1.5 pr-2 whitespace-nowrap">
                  <span className="font-medium text-escuro">{diaSemana(p.dia)}</span>{" "}
                  <span className="text-medio/50">{fmtDia(p.dia)}</span>
                </td>
                <td className="py-1.5 pr-2">
                  <span className="flex items-center gap-1.5 text-medio/80">
                    <Ic className="h-3.5 w-3.5 shrink-0 text-tiffany" />
                    <span className="truncate">{cond.rotulo}</span>
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-right whitespace-nowrap font-medium text-escuro">
                  {fmtTemp(p.tempMax)} <span className="text-medio/40">/</span>{" "}
                  {fmtTemp(p.tempMin)}
                </td>
                <td className="py-1.5 pr-2 text-right whitespace-nowrap text-medio/80">
                  {fmtMm(p.chuva)}
                  {p.chuvaProb != null && (
                    <span className="text-medio/40"> ({Math.round(p.chuvaProb)}%)</span>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-right whitespace-nowrap text-medio/80">
                  {fmtVento(p.vento)}
                </td>
                <td className="py-1.5 text-right text-medio/80">{fmtUv(p.uv)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
    <div className="flex h-[110px] flex-col items-center justify-center gap-1.5 text-center text-xs text-medio/50">
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
