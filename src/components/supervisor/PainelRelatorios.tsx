"use client";

// Aba RELATÓRIOS do Supervisor: a visão analítica da forma PainelSupervisor
// (Camada 1). KPIs com semáforo, funil de negócios em aberto, desempenho por
// origem (ganhos×perdas do anúncio/canal) e ranking de vendedores. Números
// nascem no servidor — aqui só se renderiza.
import type { PainelSupervisor } from "@/lib/supervisor/tipos";
import { formatarBRL, formatarPct } from "@/lib/format";
import { ChevronRight, Download, Layers, Megaphone, Timer, Trophy } from "lucide-react";
import { GradeIndicadores, LinhaLista, Secao, formatarValor } from "./PainelPartes";

// Exporta o painel para CSV (separador ';' + BOM, amigável ao Excel pt-BR). Sem
// dependência: serializa o que a tela já mostra, em seções.
function csvEscapar(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function gerarCsv(painel: PainelSupervisor): string {
  const linhas: (string | number | null)[][] = [];
  linhas.push(["Indicador", "Valor", "Período anterior", "Meta"]);
  for (const ind of painel.indicadores) {
    linhas.push([
      ind.titulo,
      formatarValor(ind.valor, ind.unidade),
      ind.valorAnterior != null ? formatarValor(ind.valorAnterior, ind.unidade) : "",
      ind.meta != null ? formatarValor(ind.meta, ind.unidade) : "",
    ]);
  }
  linhas.push([]);
  linhas.push(["Funil — etapa", "Negócios em aberto", "Valor em aberto", "Ciclo médio (dias)"]);
  for (const e of painel.funil) {
    linhas.push([
      e.nome,
      e.emAberto,
      formatarBRL(e.valorEmAberto),
      e.cicloMedioDias != null ? Math.round(e.cicloMedioDias) : "",
    ]);
  }
  linhas.push([]);
  linhas.push(["Origem", "Ganhos", "Perdas", "Conversão", "Valor ganho"]);
  for (const o of painel.origens) {
    linhas.push([
      o.origem,
      o.ganhos,
      o.perdas,
      o.conversao != null ? formatarPct(o.conversao) : "",
      formatarBRL(o.valorGanho),
    ]);
  }
  linhas.push([]);
  linhas.push(["Vendedor", "Ganhos", "Perdidos", "Conversão", "Valor vendido", "Sem próximo passo"]);
  for (const v of painel.ranking) {
    linhas.push([
      v.nome,
      v.ganhos,
      v.perdidos,
      formatarPct(v.conversao),
      formatarBRL(v.valorVendido),
      v.semProximoPasso,
    ]);
  }
  return linhas.map((l) => l.map(csvEscapar).join(";")).join("\n");
}

function baixarCsv(painel: PainelSupervisor) {
  const csv = "﻿" + gerarCsv(painel);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `supervisor-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Histograma do tempo de 1ª resposta: onde as respostas caem, não só a média.
function DistribuicaoResposta({ painel }: { painel: PainelSupervisor }) {
  const faixas = painel.pctDentroDoPrazo.distribuicao;
  if (!faixas || faixas.length === 0) return null;
  const total = faixas.reduce((s, f) => s + f.qtd, 0);
  if (total === 0) return null;
  const max = Math.max(1, ...faixas.map((f) => f.qtd));
  return (
    <Secao titulo="Tempo de 1ª resposta — distribuição" icone={Timer} extra={`${total} conversas`}>
      <div className="space-y-1.5">
        {faixas.map((f) => {
          const pct = (f.qtd / total) * 100;
          return (
            <div
              key={f.rotulo}
              className="relative overflow-hidden rounded-lg border border-black/5 bg-white"
            >
              <span
                className="absolute inset-y-0 left-0 bg-tiffany/[0.07]"
                style={{ width: `${(f.qtd / max) * 100}%` }}
                aria-hidden
              />
              <div className="relative flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-escuro">{f.rotulo}</span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-medio/70">
                  <span className="tabular-nums font-medium text-escuro">{f.qtd}</span>
                  <span className="w-10 text-right tabular-nums">{Math.round(pct)}%</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Secao>
  );
}

// Barra de atingimento da meta do período: valor vendido ÷ meta configurada.
// Usa valorEfetivo via metricas.valorVendido (já respeita a regra do valorAjustado).
function BarraMeta({ painel }: { painel: PainelSupervisor }) {
  const meta = painel.limiares.metaPeriodoReais;
  if (meta == null || meta <= 0) return null;
  const vendido = painel.metricas.valorVendido;
  const pct = Math.max(0, (vendido / meta) * 100);
  const bateu = vendido >= meta;
  return (
    <section className="rounded-xl border border-black/5 bg-white p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-medio/50">
          Meta do período
        </h3>
        <span
          className={`text-xs font-semibold tabular-nums ${bateu ? "text-sucesso" : "text-escuro"}`}
        >
          {Math.round(pct)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-black/5">
        <span
          className={`block h-full rounded-full ${bateu ? "bg-sucesso" : "bg-tiffany"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
          aria-hidden
        />
      </div>
      <p className="mt-1.5 text-[11px] tabular-nums text-medio/60">
        {formatarBRL(vendido)} de {formatarBRL(meta)}
        {!bateu && ` · faltam ${formatarBRL(meta - vendido)}`}
      </p>
    </section>
  );
}

export function PainelRelatorios({
  painel,
  aoFocarAgente,
}: {
  painel: PainelSupervisor;
  aoFocarAgente?: (id: string, nome: string) => void;
}) {
  const maxFunil = Math.max(1, ...painel.funil.map((e) => e.emAberto));
  const origens = painel.origens.slice(0, 6);
  const ranking = [...painel.ranking].sort(
    (a, b) => b.valorVendido - a.valorVendido,
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => baixarCsv(painel)}
          className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </button>
      </div>

      <GradeIndicadores indicadores={painel.indicadores} />

      <BarraMeta painel={painel} />

      <DistribuicaoResposta painel={painel} />

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
        <Secao
          titulo="Ranking de vendedores"
          icone={Trophy}
          extra={aoFocarAgente ? "clique p/ ver um vendedor" : undefined}
        >
          <div className="space-y-1.5">
            {ranking.map((v, i) => {
              const conteudo = (
                <>
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
                    {aoFocarAgente && (
                      <ChevronRight className="h-3.5 w-3.5 text-medio/40" />
                    )}
                  </span>
                </>
              );
              return aoFocarAgente ? (
                <button
                  key={v.agenteId}
                  onClick={() => aoFocarAgente(v.agenteId, v.nome)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-black/5 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-tiffany/40 hover:bg-tiffany/[0.03]"
                >
                  {conteudo}
                </button>
              ) : (
                <LinhaLista key={v.agenteId}>{conteudo}</LinhaLista>
              );
            })}
          </div>
        </Secao>
      )}
    </div>
  );
}
