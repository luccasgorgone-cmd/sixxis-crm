"use client";

// Grafico de tendencia (atendimentos x fechamentos por dia) com Recharts.
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
import type { PontoTendencia } from "./tipos";

export function GraficoTendencia({ dados }: { dados: PontoTendencia[] }) {
  const formatado = dados.map((d) => ({
    ...d,
    rotulo: d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7),
  }));

  if (formatado.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-black/5 bg-white text-sm text-medio/50">
        Sem dados no periodo.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-black/5 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-escuro">Tendencia</p>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={formatado} margin={{ left: -20, right: 8, top: 4 }}>
          <defs>
            <linearGradient id="gAtend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3cbfb3" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#3cbfb3" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gFech" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f1" />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e2e8e7",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="atendimentos"
            name="Atendimentos"
            stroke="#3cbfb3"
            fill="url(#gAtend)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="fechamentos"
            name="Fechamentos"
            stroke="#16a34a"
            fill="url(#gFech)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
