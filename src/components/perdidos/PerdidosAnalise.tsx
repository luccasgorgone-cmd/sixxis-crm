"use client";

// Analise de perdidos por motivo: rosca (recharts) + lista drillavel. Reusada na
// carteira e no detalhe da meta. Busca /api/analise/perdidos com finalidade,
// agenteId (admin) e periodo (inicio/fim) opcionais.
import { useState, useEffect, useCallback } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { XCircle, ChevronRight } from "lucide-react";
import { AvatarCliente } from "@/components/AvatarCliente";
import { formatarBRL } from "@/lib/format";

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
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/10 bg-white py-12 text-center">
        <XCircle className="h-7 w-7 text-medio/30" />
        <p className="text-sm font-medium text-escuro">Nenhum perdido no periodo</p>
        <p className="text-xs text-medio/60">
          Quando um negocio for marcado como perdido, a analise aparece aqui.
        </p>
      </div>
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
      {/* Rosca + legenda */}
      <div className="rounded-xl border border-black/5 bg-white p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-semibold text-escuro">Perdidos por motivo</p>
          <p className="text-xs text-medio/60">
            {dados.total} · {formatarBRL(dados.valorTotal)}
          </p>
        </div>
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
      </div>

      {/* Lista drillavel */}
      <div className="rounded-xl border border-black/5 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-escuro">
            {motivoSel
              ? dados.porMotivo.find((m) => m.code === motivoSel)?.label
              : "Todos os perdidos"}
          </p>
          {motivoSel && (
            <button
              onClick={() => setMotivoSel(null)}
              className="text-xs font-medium text-tiffany hover:underline"
            >
              Limpar filtro
            </button>
          )}
        </div>
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
      </div>
    </div>
  );
}
