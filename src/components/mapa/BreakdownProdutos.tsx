"use client";

// Breakdown de produtos por estado: barras horizontais compactas (recharts) com
// as cores Sixxis por categoria. So dados reais (classificacao honesta); estado
// vazio explicito quando nao ha nenhum produto classificado. Usado na aba
// "Visao geral" do drawer do Mapa.
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
} from "recharts";
import { CORES_PRODUTO, type ProdutoTop } from "./tipos";

export function BreakdownProdutos({ dados }: { dados: ProdutoTop[] }) {
  const itens = dados.filter((d) => d.qtd > 0);
  if (itens.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-medio/50">
        Sem produto classificado neste estado.
      </p>
    );
  }
  const altura = Math.max(90, itens.length * 34);
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart
        data={itens}
        layout="vertical"
        margin={{ left: 4, right: 28, top: 4, bottom: 4 }}
      >
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="rotulo"
          width={112}
          tick={{ fontSize: 11, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid #e2e8e7",
            fontSize: 12,
          }}
        />
        <Bar dataKey="qtd" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11, fill: "#6b7280" }}>
          {itens.map((d) => (
            <Cell key={d.rotulo} fill={CORES_PRODUTO[d.rotulo] ?? "#94a3b8"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
