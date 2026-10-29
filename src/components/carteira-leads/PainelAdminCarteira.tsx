"use client";

// Painel ADMIN/SUPERVISOR da Carteira de Leads: visao de controle. Quem tem o
// que, quanto cada vendedor ja ativou (abordou) hoje, e a distribuicao por
// status. So leitura agregada — as acoes (reatribuir, descartar) ficam na lista
// em /carteira-leads (que o admin ve inteira).
import { useEffect, useState } from "react";

type PorVendedor = {
  donoId: string;
  nome: string;
  total: number;
  novo: number;
  emAbordagem: number;
  respondeu: number;
  convertido: number;
  descartado: number;
  ativadosHoje: number;
};
type Metricas = {
  totais: { contatos: number; ativadosHoje: number };
  statusGlobal: Record<string, number>;
  porVendedor: PorVendedor[];
};

const STATUS = [
  { v: "NOVO", r: "Novo" },
  { v: "EM_ABORDAGEM", r: "Em abordagem" },
  { v: "RESPONDEU", r: "Respondeu" },
  { v: "CONVERTIDO", r: "Convertido" },
  { v: "DESCARTADO", r: "Descartado" },
];

export function PainelAdminCarteira() {
  const [m, setM] = useState<Metricas | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/carteira-leads/metricas");
        if (r.ok) setM(await r.json());
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  if (carregando) return <p className="p-4 text-sm text-neutral-500">Carregando métricas…</p>;
  if (!m) return <p className="p-4 text-sm text-neutral-500">Sem dados.</p>;

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Carteira de Leads — Admin / Supervisor</h1>
        <a href="/carteira-leads" className="text-sm text-blue-600 hover:underline">
          Ver lista completa de contatos →
        </a>
      </div>

      {/* Totais */}
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <span className="rounded-lg bg-neutral-100 px-4 py-2 dark:bg-neutral-800">
          Contatos: <b>{m.totais.contatos}</b>
        </span>
        <span className="rounded-lg bg-neutral-100 px-4 py-2 dark:bg-neutral-800">
          Abordados hoje: <b>{m.totais.ativadosHoje}</b>
        </span>
        {STATUS.map((s) => (
          <span key={s.v} className="rounded-lg bg-neutral-100 px-4 py-2 dark:bg-neutral-800">
            {s.r}: <b>{m.statusGlobal[s.v] ?? 0}</b>
          </span>
        ))}
      </div>

      {/* Por vendedor */}
      <div className="overflow-x-auto rounded-lg border dark:border-neutral-700">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-800">
            <tr>
              <th className="px-3 py-2">Vendedor</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Novo</th>
              <th className="px-3 py-2 text-right">Em abordagem</th>
              <th className="px-3 py-2 text-right">Respondeu</th>
              <th className="px-3 py-2 text-right">Convertido</th>
              <th className="px-3 py-2 text-right">Descartado</th>
              <th className="px-3 py-2 text-right">Abordados hoje</th>
            </tr>
          </thead>
          <tbody>
            {m.porVendedor.map((v) => (
              <tr key={v.donoId} className="border-t dark:border-neutral-700">
                <td className="px-3 py-2 font-medium">{v.nome}</td>
                <td className="px-3 py-2 text-right">{v.total}</td>
                <td className="px-3 py-2 text-right">{v.novo}</td>
                <td className="px-3 py-2 text-right">{v.emAbordagem}</td>
                <td className="px-3 py-2 text-right">{v.respondeu}</td>
                <td className="px-3 py-2 text-right">{v.convertido}</td>
                <td className="px-3 py-2 text-right">{v.descartado}</td>
                <td className="px-3 py-2 text-right font-semibold">{v.ativadosHoje}</td>
              </tr>
            ))}
            {m.porVendedor.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-neutral-500">
                  Nenhum contato distribuído ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
