"use client";

// Drill-down de clima de um estado (dentro do drawer da Inteligencia Regional,
// modo Climatizador). Busca /api/inteligencia/clima/estado?uf=XX e mostra:
// resumo (temp atual, max/min, umidade, chuva, indice, tendencia), a curva do
// dia (LineChart 24h) e o historico ~30d (max/min em linha + chuva em barra).
// Skeleton enquanto carrega; cada parte degrada isolada sem quebrar o painel.
import { useCallback, useEffect, useState } from "react";
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
  Gauge,
  TrendingUp,
  TrendingDown,
  Minus,
  CloudOff,
} from "lucide-react";
import type { ClimaUF, DetalheClimaResp, Tendencia } from "./tipos";

function fmtTemp(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v)}°C`;
}
function fmtPct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v)}%`;
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

  return (
    <section className="border-b border-black/5 bg-fundo/40 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5">
        <ThermometerSun className="h-4 w-4 text-tiffany" />
        <p className="text-sm font-semibold text-escuro">Clima do estado</p>
      </div>

      {/* Resumo: sai do dado do mapa (ja disponivel) + tendencia do detalhe. */}
      <Resumo resumo={resumo} tendencia={dados?.tendencia ?? null} />

      {carregando && !dados ? (
        <div className="mt-3 space-y-3">
          <div className="skeleton h-[120px] w-full rounded-lg" />
          <div className="skeleton h-[130px] w-full rounded-lg" />
        </div>
      ) : erro && !dados ? (
        <Aviso texto="Nao foi possivel carregar o detalhe do clima." onRetry={carregar} />
      ) : (
        <div className="mt-3 space-y-4">
          {/* Curva do dia */}
          <Grafico titulo="Temperatura hoje (por hora)">
            {dados && !dados.horarioErro && dados.horarioHoje.length > 0 ? (
              <ResponsiveContainer width="100%" height={130}>
                <LineChart
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
                    tick={{ fontSize: 10, fill: "#5b7a76" }}
                    width={34}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${Math.round(v)}°`}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: unknown) => [`${Math.round(Number(v))}°C`, "Temp."]}
                  />
                  <Line
                    type="monotone"
                    dataKey="temp"
                    stroke="#3cbfb3"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <MiniVazio texto="Curva do dia indisponivel." />
            )}
          </Grafico>

          {/* Historico ~30 dias: max/min (linha) + chuva (barra sutil) */}
          <Grafico titulo="Ultimos 30 dias (max/min e chuva)">
            {dados && !dados.historicoErro && dados.historico.length > 0 ? (
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
            ) : (
              <MiniVazio texto="Historico indisponivel." />
            )}
            {dados && !dados.historicoErro && dados.historico.length > 0 && (
              <div className="mt-1 flex items-center gap-3 text-[11px] text-medio/60">
                <LegItem cor="#f59e0b" rotulo="Maxima" />
                <LegItem cor="#3cbfb3" rotulo="Minima" />
                <LegItem cor="#bae6fd" rotulo="Chuva (mm)" />
              </div>
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

function Resumo({
  resumo,
  tendencia,
}: {
  resumo: ClimaUF | null | undefined;
  tendencia: Tendencia | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Chip icon={<ThermometerSun className="h-3.5 w-3.5" />} rotulo="Atual" valor={fmtTemp(resumo?.tempAtual)} />
      <Chip
        icon={<ThermometerSun className="h-3.5 w-3.5" />}
        rotulo="Max / min"
        valor={`${fmtTemp(resumo?.tempMax)} / ${fmtTemp(resumo?.tempMin)}`}
      />
      <Chip icon={<Droplets className="h-3.5 w-3.5" />} rotulo="Umidade" valor={fmtPct(resumo?.umidade)} />
      <Chip
        icon={<CloudRain className="h-3.5 w-3.5" />}
        rotulo="Chuva prevista"
        valor={resumo?.chuvaPrevista != null ? `${resumo.chuvaPrevista} mm` : "—"}
      />
      <Chip
        icon={<Gauge className="h-3.5 w-3.5" />}
        rotulo="Indice"
        valor={resumo?.indiceOportunidade != null ? String(resumo.indiceOportunidade) : "—"}
      />
      <div className="flex items-center rounded-lg border border-black/5 bg-white px-2.5 py-1.5">
        <ChipTendencia tendencia={tendencia} />
      </div>
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
      <span className="text-[11px] text-medio/60">Tendencia</span>
      <span className={`mt-0.5 flex items-center gap-1 text-sm font-semibold ${cfg.classe}`}>
        {cfg.icon}
        {cfg.rotulo}
      </span>
    </div>
  );
}

function Grafico({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-black/5 bg-white p-3">
      <p className="mb-1.5 text-xs font-medium text-medio/70">{titulo}</p>
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
