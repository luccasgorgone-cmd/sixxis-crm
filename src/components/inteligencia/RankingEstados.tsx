"use client";

// Ranking dos estados (barra horizontal, top 10) pela metrica ativa. Reusa o
// Recharts ja instalado, no mesmo estilo do dashboard.
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

export type ItemRanking = { uf: string; valor: number; cor: string };

export function RankingEstados({
  titulo,
  itens,
  sufixo = "",
}: {
  titulo: string;
  itens: ItemRanking[];
  sufixo?: string;
}) {
  const dados = itens.slice(0, 10);
  return (
    <div className="rounded-xl border border-black/5 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-escuro">{titulo}</p>
      {dados.length === 0 ? (
        <p className="py-8 text-center text-sm text-medio/50">Sem dados.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(180, dados.length * 30)}>
          <BarChart
            data={dados}
            layout="vertical"
            margin={{ left: 4, right: 16, top: 0, bottom: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="uf"
              width={34}
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(60,191,179,0.08)" }}
              formatter={(v) => [`${Number(v)}${sufixo}`, ""]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e8e7",
                fontSize: 12,
              }}
            />
            <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
              {dados.map((d) => (
                <Cell key={d.uf} fill={d.cor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
