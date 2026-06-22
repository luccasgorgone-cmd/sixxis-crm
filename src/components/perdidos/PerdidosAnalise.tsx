"use client";

// Analise de perdidos por motivo: rosca (recharts) + lista drillavel. Reusada na
// carteira e no detalhe da meta. Busca /api/analise/perdidos com finalidade,
// agenteId (admin) e periodo (inicio/fim) opcionais.
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { XCircle, ChevronRight, PieChart as PieIcon, BarChart3 } from "lucide-react";
import { AvatarCliente } from "@/components/AvatarCliente";
import { SegmentToggle } from "@/components/ui/SegmentToggle";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabelaOrdenavel, type Coluna } from "@/components/ui/TabelaOrdenavel";
import { List, Table2 } from "lucide-react";
import { formatarBRL } from "@/lib/format";

type PerdidoItem = AnalisePerdidos["itens"][number];

export type AnalisePerdidos = {
  total: number;
  valorTotal: number;
  porMotivo: { code: string; label: string; count: number; valor: number; pct: number }[];
  itens: {
    negocioId: string;
    leadId: string;
    nome: string;
    telefone: string;
    fotoUrl: string | null;
    motivoCode: string | null;
    motivoLabel: string;
    obs: string | null;
    valor: number | null;
    fechadoEm: string | null;
  }[];
};

// Paleta para os setores (tons distintos, coerentes com a marca + alertas).
const CORES = [
  "#dc2626",
  "#f59e0b",
  "#7c3aed",
  "#0ea5e9",
  "#16a34a",
  "#1a4f4a",
  "#db2777",
  "#64748b",
  "#3cbfb3",
  "#9333ea",
  "#ca8a04",
  "#0f2e2b",
];

// Colunas da tabela ordenavel de perdidos.
const colunasPerdidos: Coluna<PerdidoItem>[] = [
  {
    chave: "cliente",
    rotulo: "Cliente",
    sortValue: (i) => i.nome.toLowerCase(),
    render: (i) => <span className="font-medium text-escuro">{i.nome}</span>,
  },
  {
    chave: "motivo",
    rotulo: "Motivo",
    sortValue: (i) => i.motivoLabel.toLowerCase(),
    render: (i) => (
      <span className="text-medio/80" title={i.obs ?? undefined}>
        {i.motivoLabel}
      </span>
    ),
  },
  {
    chave: "valor",
    rotulo: "Valor",
    align: "right",
    sortValue: (i) => i.valor ?? 0,
    render: (i) => (i.valor != null ? formatarBRL(i.valor) : "—"),
  },
  {
    chave: "data",
    rotulo: "Data",
    align: "right",
    sortValue: (i) => (i.fechadoEm ? new Date(i.fechadoEm).getTime() : 0),
    render: (i) =>
      i.fechadoEm
        ? new Date(i.fechadoEm).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
          })
        : "—",
  },
];

export function PerdidosAnalise({
  finalidade,
  agenteId,
  inicio,
  fim,
  dadosFixos,
  onAbrir,
}: {
  finalidade?: string;
  agenteId?: string;
  inicio?: string;
  fim?: string;
  // Quando informado, usa estes dados (sem fetch) — ex.: detalhe da meta.
  dadosFixos?: AnalisePerdidos;
  onAbrir?: (negocioId: string) => void;
}) {
  const [dados, setDados] = useState<AnalisePerdidos | null>(dadosFixos ?? null);
  const [carregando, setCarregando] = useState(!dadosFixos);
  const [motivoSel, setMotivoSel] = useState<string | null>(null);
  const [formato, setFormato] = useState<"rosca" | "barras">("rosca");
  const [vistaLista, setVistaLista] = useState<"lista" | "tabela">("lista");

  // Perdidos por dia (para a visao de barras por periodo).
  const porDia = useMemo(() => {
    if (!dados) return [];
    const mapa = new Map<string, number>();
    for (const i of dados.itens) {
      if (!i.fechadoEm) continue;
      const dia = i.fechadoEm.slice(0, 10);
      mapa.set(dia, (mapa.get(dia) ?? 0) + 1);
    }
    return [...mapa.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dia, count]) => ({
        rotulo: dia.slice(8, 10) + "/" + dia.slice(5, 7),
        count,
      }));
  }, [dados]);

  const carregar = useCallback(async () => {
    if (dadosFixos || !finalidade) return;
    setCarregando(true);
    try {
      const p = new URLSearchParams({ finalidade });
      if (agenteId) p.set("agenteId", agenteId);
      if (inicio) p.set("inicio", inicio);
      if (fim) p.set("fim", fim);
      const r = await fetch(`/api/analise/perdidos?${p.toString()}`);
      if (r.ok) setDados(await r.json());
      else setDados(null);
    } catch {
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [finalidade, agenteId, inicio, fim, dadosFixos]);

  useEffect(() => {
    if (dadosFixos) {
      setDados(dadosFixos);
      setCarregando(false);
      return;
    }
    void carregar();
  }, [carregar, dadosFixos]);

  if (carregando) {
    return <div className="skeleton h-56 rounded-xl" />;
  }
  if (!dados || dados.total === 0) {
    return (
      <EmptyState
        icone={XCircle}
        titulo="Nenhum perdido no periodo"
        texto="Quando um negocio for marcado como perdido, a analise aparece aqui."
      />
    );
  }

  const corDe = (code: string) => {
    const idx = dados.porMotivo.findIndex((m) => m.code === code);
    return CORES[idx % CORES.length];
  };

  const itensFiltrados = motivoSel
    ? dados.itens.filter((i) => (i.motivoCode ?? "") === motivoSel)
    : dados.itens;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Rosca/barras + legenda */}
      <div className="rounded-xl border border-black/5 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-escuro">
              {formato === "rosca" ? "Perdidos por motivo" : "Perdidos por dia"}
            </p>
            <p className="text-xs text-medio/60">
              {dados.total} · {formatarBRL(dados.valorTotal)}
            </p>
          </div>
          <SegmentToggle
            tamanho="sm"
            valor={formato}
            onChange={setFormato}
            opcoes={[
              { valor: "rosca", icone: PieIcon, titulo: "Por motivo (rosca)" },
              { valor: "barras", icone: BarChart3, titulo: "Por periodo (barras)" },
            ]}
          />
        </div>
        {formato === "barras" ? (
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={porDia} margin={{ left: -20, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#0000000d" vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "#1a4f4a99" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#1a4f4a99" }} />
              <Tooltip />
              <Bar dataKey="count" name="Perdidos" fill="#dc2626" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
        <div className="flex items-center gap-3">
          <ResponsiveContainer width="50%" height={160}>
            <PieChart>
              <Pie
                data={dados.porMotivo}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={66}
                paddingAngle={2}
                stroke="none"
              >
                {dados.porMotivo.map((m) => (
                  <Cell key={m.code} fill={corDe(m.code)} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, _name, item) => {
                  const p = (item?.payload ?? {}) as {
                    valor?: number;
                    label?: string;
                  };
                  return [
                    `${value} (${formatarBRL(p.valor ?? 0)})`,
                    p.label ?? "",
                  ];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <ul className="min-w-0 flex-1 space-y-1">
            {dados.porMotivo.map((m) => {
              const ativo = motivoSel === m.code;
              return (
                <li key={m.code}>
                  <button
                    onClick={() => setMotivoSel(ativo ? null : m.code)}
                    className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-black/5 ${
                      ativo ? "bg-black/5" : ""
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: corDe(m.code) }}
                    />
                    <span className="min-w-0 flex-1 truncate text-escuro">
                      {m.label}
                    </span>
                    <span className="shrink-0 font-semibold text-medio/70">
                      {m.count}
                    </span>
                    <span className="shrink-0 text-medio/40">{m.pct}%</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        )}
      </div>

      {/* Lista/tabela drillavel */}
      <div className="rounded-xl border border-black/5 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-escuro">
            {motivoSel
              ? dados.porMotivo.find((m) => m.code === motivoSel)?.label
              : "Todos os perdidos"}
          </p>
          <div className="flex items-center gap-2">
            {motivoSel && (
              <button
                onClick={() => setMotivoSel(null)}
                className="text-xs font-medium text-tiffany hover:underline"
              >
                Limpar filtro
              </button>
            )}
            <SegmentToggle
              tamanho="sm"
              valor={vistaLista}
              onChange={setVistaLista}
              opcoes={[
                { valor: "lista", icone: List, titulo: "Lista" },
                { valor: "tabela", icone: Table2, titulo: "Tabela" },
              ]}
            />
          </div>
        </div>
        {vistaLista === "tabela" ? (
          <div className="scroll-fino max-h-72 overflow-y-auto">
            <TabelaOrdenavel<PerdidoItem>
              dados={itensFiltrados}
              chaveLinha={(i) => i.negocioId}
              ordemInicial={{ chave: "valor", dir: -1 }}
              onLinha={onAbrir ? (i) => onAbrir(i.negocioId) : undefined}
              colunas={colunasPerdidos}
            />
          </div>
        ) : (
        <div className="scroll-fino max-h-72 space-y-1.5 overflow-y-auto">
          {itensFiltrados.map((i) => (
            <button
              key={i.negocioId}
              onClick={() => onAbrir?.(i.negocioId)}
              disabled={!onAbrir}
              className="flex w-full items-center gap-2.5 rounded-lg border border-black/5 bg-white p-2 text-left transition-colors hover:bg-fundo disabled:cursor-default"
            >
              <AvatarCliente
                nome={i.nome}
                telefone={i.telefone}
                fotoUrl={i.fotoUrl}
                tamanho={32}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-escuro">{i.nome}</p>
                <p className="truncate text-xs text-medio/60">
                  {i.motivoLabel}
                  {i.obs ? ` · ${i.obs}` : ""}
                </p>
              </div>
              {i.valor != null && (
                <span className="shrink-0 text-xs font-semibold text-medio/70">
                  {formatarBRL(i.valor)}
                </span>
              )}
              {onAbrir && <ChevronRight className="h-4 w-4 shrink-0 text-medio/40" />}
            </button>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
