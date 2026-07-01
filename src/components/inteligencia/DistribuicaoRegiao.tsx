"use client";

// Distribuicao por regiao (5 regioes) em donut. Metrica configuravel (clientes
// ou vendas). Cores fixas por regiao, tonalidades de tiffany/verde da marca.
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import { NOME_REGIAO_ORDEM } from "./tipos";

const CORES: Record<string, string> = {
  Norte: "#3cbfb3",
  Nordeste: "#2aa79b",
  "Centro-Oeste": "#1a4f4a",
  Sudeste: "#7c3aed",
  Sul: "#f59e0b",
  Outros: "#94a3b8",
};

export function DistribuicaoRegiao({
  dados,
  rotulo,
}: {
  dados: { regiao: string; valor: number }[];
  rotulo: string;
}) {
  const ordenado = [...dados]
    .filter((d) => d.valor > 0)
    .sort(
      (a, b) =>
        NOME_REGIAO_ORDEM.indexOf(a.regiao) -
        NOME_REGIAO_ORDEM.indexOf(b.regiao),
    );

  return (
    <div className="rounded-xl border border-black/5 bg-white p-4">
      <p className="mb-1 text-sm font-semibold text-escuro">
        Distribuicao por regiao
      </p>
      <p className="mb-2 text-xs text-medio/60">{rotulo}</p>
      {ordenado.length === 0 ? (
        <p className="py-8 text-center text-sm text-medio/50">Sem dados.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={ordenado}
              dataKey="valor"
              nameKey="regiao"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
            >
              {ordenado.map((d) => (
                <Cell key={d.regiao} fill={CORES[d.regiao] ?? "#94a3b8"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e8e7",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
