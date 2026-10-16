"use client";

// Gráficos do Supervisor (Recharts). Lêem a forma PainelSupervisor (Camada 1) —
// nenhum número nasce aqui, só se desenha. Cores vêm dos tokens semânticos do app
// (`var(--color-*)`), então o SVG acompanha o tema claro/escuro sem hardcode.
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type {
  EtapaFunil,
  FaixaResposta,
  OrigemResultado,
} from "@/lib/supervisor/tipos";
import { formatarBRL, formatarPct } from "@/lib/format";

// Paleta dos gráficos em tokens semânticos (seguem o tema).
const TIFFANY = "var(--color-tiffany)";
const SUCESSO = "var(--color-sucesso)";
const ERRO = "var(--color-erro)";
const EIXO = "var(--color-medio)";

const TICK = { fontSize: 11, fill: EIXO };
const GRID = { stroke: EIXO, strokeOpacity: 0.12, strokeDasharray: "3 3" };

// Caixa de tooltip temática (superfície + borda do próprio tema).
function CaixaTooltip({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-medio/15 bg-superficie px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-semibold text-escuro">{titulo}</p>
      {children}
    </div>
  );
}

function LinhaTooltip({
  cor,
  rotulo,
  valor,
}: {
  cor?: string;
  rotulo: string;
  valor: string;
}) {
  return (
    <p className="flex items-center justify-between gap-4 tabular-nums text-medio">
      <span className="flex items-center gap-1.5">
        {cor && (
          <span
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: cor }}
            aria-hidden
          />
        )}
        {rotulo}
      </span>
      <span className="font-medium text-escuro">{valor}</span>
    </p>
  );
}

// ── Funil: negócios em aberto por etapa (barras horizontais, ordem do funil). ──
export function GraficoFunil({ etapas }: { etapas: EtapaFunil[] }) {
  if (etapas.length === 0) return null;
  const altura = Math.max(150, etapas.length * 40 + 16);
  return (
    <div style={{ width: "100%", height: altura }}>
      <ResponsiveContainer>
        <BarChart
          layout="vertical"
          data={etapas}
          margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
          barCategoryGap="22%"
        >
          <CartesianGrid horizontal={false} {...GRID} />
          <XAxis type="number" tick={TICK} allowDecimals={false} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="nome"
            tick={TICK}
            width={128}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: EIXO, fillOpacity: 0.06 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const e = payload[0].payload as EtapaFunil;
              return (
                <CaixaTooltip titulo={e.nome}>
                  <LinhaTooltip cor={TIFFANY} rotulo="Em aberto" valor={`${e.emAberto}`} />
                  <LinhaTooltip rotulo="Valor" valor={formatarBRL(e.valorEmAberto)} />
                  {e.cicloMedioDias != null && (
                    <LinhaTooltip rotulo="Ciclo médio" valor={`${Math.round(e.cicloMedioDias)} d`} />
                  )}
                </CaixaTooltip>
              );
            }}
          />
          <Bar dataKey="emAberto" fill={TIFFANY} radius={[0, 4, 4, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Origem: ganhos × perdas por canal/anúncio (barras agrupadas horizontais). ──
export function GraficoOrigens({ origens }: { origens: OrigemResultado[] }) {
  if (origens.length === 0) return null;
  const altura = Math.max(150, origens.length * 48 + 16);
  return (
    <div style={{ width: "100%", height: altura }}>
      <ResponsiveContainer>
        <BarChart
          layout="vertical"
          data={origens}
          margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
          barCategoryGap="28%"
        >
          <CartesianGrid horizontal={false} {...GRID} />
          <XAxis type="number" tick={TICK} allowDecimals={false} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="origem"
            tick={TICK}
            width={128}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 17) + "…" : v)}
          />
          <Tooltip
            cursor={{ fill: EIXO, fillOpacity: 0.06 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const o = payload[0].payload as OrigemResultado;
              return (
                <CaixaTooltip titulo={o.origem}>
                  <LinhaTooltip cor={SUCESSO} rotulo="Ganhos" valor={`${o.ganhos}`} />
                  <LinhaTooltip cor={ERRO} rotulo="Perdas" valor={`${o.perdas}`} />
                  {o.conversao != null && (
                    <LinhaTooltip rotulo="Conversão" valor={formatarPct(o.conversao)} />
                  )}
                  <LinhaTooltip rotulo="Valor ganho" valor={formatarBRL(o.valorGanho)} />
                </CaixaTooltip>
              );
            }}
          />
          <Bar dataKey="ganhos" name="Ganhos" fill={SUCESSO} radius={[0, 3, 3, 0]} maxBarSize={14} />
          <Bar dataKey="perdas" name="Perdas" fill={ERRO} fillOpacity={0.8} radius={[0, 3, 3, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Cor da faixa de tempo de resposta: rápida = boa (verde), extremo lento = ruim
// (vermelho), meio = tiffany. Posição-based (as faixas vêm ordenadas do servidor).
function corFaixa(i: number, n: number): string {
  if (i === 0) return SUCESSO;
  if (i === n - 1) return ERRO;
  return TIFFANY;
}

// ── Distribuição do tempo de 1ª resposta (histograma vertical). ──
export function GraficoDistribuicaoResposta({ faixas }: { faixas: FaixaResposta[] }) {
  if (faixas.length === 0) return null;
  const total = faixas.reduce((s, f) => s + f.qtd, 0);
  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={faixas} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
          <CartesianGrid vertical={false} {...GRID} />
          <XAxis dataKey="rotulo" tick={{ ...TICK, fontSize: 10 }} interval={0} axisLine={false} tickLine={false} />
          <YAxis tick={TICK} allowDecimals={false} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: EIXO, fillOpacity: 0.06 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const f = payload[0].payload as FaixaResposta;
              const pct = total > 0 ? Math.round((f.qtd / total) * 100) : 0;
              return (
                <CaixaTooltip titulo={f.rotulo}>
                  <LinhaTooltip rotulo="Conversas" valor={`${f.qtd}`} />
                  <LinhaTooltip rotulo="Do total" valor={`${pct}%`} />
                </CaixaTooltip>
              );
            }}
          />
          <Bar dataKey="qtd" radius={[4, 4, 0, 0]} maxBarSize={56}>
            {faixas.map((f, i) => (
              <Cell key={f.rotulo} fill={corFaixa(i, faixas.length)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
