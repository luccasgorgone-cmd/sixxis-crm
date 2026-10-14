"use client";

// Aba RELATÓRIOS do Supervisor: a visão analítica da forma PainelSupervisor
// (Camada 1). KPIs com semáforo, funil de negócios em aberto, desempenho por
// origem (ganhos×perdas do anúncio/canal) e ranking de vendedores. Números
// nascem no servidor — aqui só se renderiza.
import type { PainelSupervisor } from "@/lib/supervisor/tipos";
import { formatarBRL, formatarPct } from "@/lib/format";
import { Layers, Megaphone, Trophy } from "lucide-react";
import { GradeIndicadores, LinhaLista, Secao } from "./PainelPartes";

export function PainelRelatorios({ painel }: { painel: PainelSupervisor }) {
  const maxFunil = Math.max(1, ...painel.funil.map((e) => e.emAberto));
  const origens = painel.origens.slice(0, 6);
  const ranking = [...painel.ranking].sort(
    (a, b) => b.valorVendido - a.valorVendido,
  );

  return (
    <div className="space-y-6">
      <GradeIndicadores indicadores={painel.indicadores} />

      {painel.funil.length > 0 && (
        <Secao titulo="Funil — negócios em aberto" icone={Layers}>
          <div className="space-y-1.5">
            {painel.funil.map((e) => (
              <div
                key={e.etapaId}
                className="relative overflow-hidden rounded-lg border border-black/5 bg-white"
              >
                {/* Barra de volume proporcional ao nº de negócios na etapa. */}
                <span
                  className="absolute inset-y-0 left-0 bg-tiffany/[0.07]"
                  style={{ width: `${(e.emAberto / maxFunil) * 100}%` }}
                  aria-hidden
                />
                <div className="relative flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="truncate text-escuro">{e.nome}</span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-medio/70">
                    <span className="tabular-nums">{e.emAberto} neg.</span>
                    <span className="tabular-nums">
                      {formatarBRL(e.valorEmAberto)}
                    </span>
                    {e.cicloMedioDias != null && (
                      <span className="hidden tabular-nums sm:inline">
                        {Math.round(e.cicloMedioDias)} d méd.
                      </span>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {origens.length > 0 && (
        <Secao
          titulo="Desempenho por origem"
          icone={Megaphone}
          extra={`${origens.length} ${origens.length === 1 ? "origem" : "origens"}`}
        >
          <div className="space-y-1.5">
            {origens.map((o) => (
              <LinhaLista key={o.origem}>
                <span className="truncate text-escuro">{o.origem}</span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-medio/70">
                  <span className="tabular-nums text-sucesso">
                    {o.ganhos} ganho{o.ganhos === 1 ? "" : "s"}
                  </span>
                  <span className="tabular-nums text-erro/80">
                    {o.perdas} perda{o.perdas === 1 ? "" : "s"}
                  </span>
                  {o.conversao != null && (
                    <span className="w-10 text-right tabular-nums font-medium text-escuro">
                      {formatarPct(o.conversao)}
                    </span>
                  )}
                  <span className="hidden w-24 text-right tabular-nums sm:inline">
                    {formatarBRL(o.valorGanho)}
                  </span>
                </span>
              </LinhaLista>
            ))}
          </div>
        </Secao>
      )}

      {ranking.length > 0 && (
        <Secao titulo="Ranking de vendedores" icone={Trophy}>
          <div className="space-y-1.5">
            {ranking.map((v, i) => (
              <LinhaLista key={v.agenteId}>
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="w-4 shrink-0 text-xs tabular-nums text-medio/50">
                    {i + 1}
                  </span>
                  <span className="truncate text-escuro">{v.nome}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-medio/70">
                  <span className="tabular-nums">{v.ganhos} ganhos</span>
                  <span className="w-10 text-right tabular-nums">
                    {formatarPct(v.conversao)}
                  </span>
                  <span className="hidden w-24 text-right tabular-nums font-medium text-escuro sm:inline">
                    {formatarBRL(v.valorVendido)}
                  </span>
                </span>
              </LinhaLista>
            ))}
          </div>
        </Secao>
      )}
    </div>
  );
}
