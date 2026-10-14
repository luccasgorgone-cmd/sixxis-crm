"use client";

// Painel determinístico do Supervisor (Camada 1, renderizado). Mesma forma
// (PainelSupervisor) que a IA recebe como contexto — os números nascem no
// servidor, nunca no modelo. Mostra os indicadores com semáforo, o funil, os
// pontos de atenção (parados / sem próximo passo), as perdas e o ranking.
import type {
  PainelSupervisor,
  Indicador,
  Semaforo,
  UnidadeIndicador,
} from "@/lib/supervisor/tipos";
import { formatarBRL, formatarDuracao, formatarPct } from "@/lib/format";
import { AlertTriangle, TrendingDown, Trophy } from "lucide-react";

// Cor do ponto de semáforo. neutro = "sem leitura" (cinza), nunca verde.
const COR_SEMAFORO: Record<Semaforo, string> = {
  verde: "bg-sucesso",
  amarelo: "bg-amber-500",
  vermelho: "bg-erro",
  neutro: "bg-medio/40",
};

function formatarValor(valor: number | null, unidade: UnidadeIndicador): string {
  if (valor == null) return "—";
  switch (unidade) {
    case "pct":
      return formatarPct(valor);
    case "seg":
      return formatarDuracao(valor);
    case "dias":
      return `${Math.round(valor)} d`;
    case "reais":
      return formatarBRL(valor);
    case "x":
      return `${valor.toFixed(1)}x`;
    default:
      return `${Math.round(valor)}`;
  }
}

function formatarMeta(ind: Indicador): string | null {
  if (ind.meta == null) return null;
  return `meta ${formatarValor(ind.meta, ind.unidade)}`;
}

function CartaoIndicador({ ind }: { ind: Indicador }) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-medio/70">{ind.titulo}</p>
        <span
          className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${COR_SEMAFORO[ind.semaforo]}`}
          aria-hidden
        />
      </div>
      <p className="mt-1 text-xl font-semibold text-escuro">
        {formatarValor(ind.valor, ind.unidade)}
      </p>
      <p className="mt-0.5 text-[11px] text-medio/50">
        {ind.detalhe ?? formatarMeta(ind) ?? " "}
      </p>
    </div>
  );
}

function Secao({
  titulo,
  icone: Icone,
  children,
}: {
  titulo: string;
  icone?: typeof AlertTriangle;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-medio/50">
        {Icone && <Icone className="h-3.5 w-3.5" />}
        {titulo}
      </h3>
      {children}
    </div>
  );
}

export function PainelIndicadores({ painel }: { painel: PainelSupervisor }) {
  const perdasTop = painel.perdas.porMotivo.slice(0, 4);
  const parados = painel.parados.filter((p) => p.parados > 0);
  const ranking = [...painel.ranking].sort((a, b) => b.valorVendido - a.valorVendido);

  return (
    <div className="space-y-6">
      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {painel.indicadores.map((ind) => (
          <CartaoIndicador key={ind.chave} ind={ind} />
        ))}
      </div>

      {/* Funil */}
      {painel.funil.length > 0 && (
        <Secao titulo="Funil (negócios em aberto)">
          <div className="space-y-1.5">
            {painel.funil.map((e) => (
              <div
                key={e.etapaId}
                className="flex items-center justify-between gap-3 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm"
              >
                <span className="truncate text-escuro">{e.nome}</span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-medio/70">
                  <span className="tabular-nums">{e.emAberto} neg.</span>
                  <span className="tabular-nums">{formatarBRL(e.valorEmAberto)}</span>
                  {e.cicloMedioDias != null && (
                    <span className="tabular-nums">
                      {Math.round(e.cicloMedioDias)} d méd.
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {/* Pontos de atenção */}
      {(parados.length > 0 || painel.semProximoPasso.semProximo > 0) && (
        <Secao titulo="Pontos de atenção" icone={AlertTriangle}>
          <div className="space-y-1.5 text-sm">
            {painel.semProximoPasso.semProximo > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-black/5 bg-white px-3 py-2">
                <span className="text-escuro">Negócios sem próximo passo</span>
                <span className="text-xs text-medio/70">
                  <span className="font-medium text-escuro">
                    {painel.semProximoPasso.semProximo}
                  </span>{" "}
                  de {painel.semProximoPasso.totalAbertos} ·{" "}
                  {formatarPct(painel.semProximoPasso.pct)}
                </span>
              </div>
            )}
            {parados.map((p) => (
              <div
                key={p.etapaId ?? p.nome}
                className="flex items-center justify-between rounded-lg border border-black/5 bg-white px-3 py-2"
              >
                <span className="truncate text-escuro">Parados em {p.nome}</span>
                <span className="shrink-0 text-xs text-medio/70">
                  <span className="font-medium text-escuro">{p.parados}</span>
                  {p.limiarDias != null && ` · +${p.limiarDias} d`}
                </span>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {/* Perdas */}
      {perdasTop.length > 0 && (
        <Secao titulo="Principais motivos de perda" icone={TrendingDown}>
          <div className="space-y-1.5 text-sm">
            {perdasTop.map((m) => (
              <div
                key={m.code}
                className="flex items-center justify-between rounded-lg border border-black/5 bg-white px-3 py-2"
              >
                <span className="truncate text-escuro">{m.label}</span>
                <span className="shrink-0 text-xs text-medio/70">
                  <span className="font-medium text-escuro">{m.count}</span> ·{" "}
                  {formatarPct(m.pct)}
                </span>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {/* Ranking */}
      {ranking.length > 0 && (
        <Secao titulo="Ranking de vendedores" icone={Trophy}>
          <div className="space-y-1.5 text-sm">
            {ranking.map((v, i) => (
              <div
                key={v.agenteId}
                className="flex items-center justify-between gap-3 rounded-lg border border-black/5 bg-white px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-4 shrink-0 text-xs tabular-nums text-medio/50">
                    {i + 1}
                  </span>
                  <span className="truncate text-escuro">{v.nome}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-medio/70">
                  <span className="tabular-nums">{v.ganhos} ganhos</span>
                  <span className="tabular-nums">{formatarPct(v.conversao)}</span>
                  <span className="tabular-nums">{formatarBRL(v.valorVendido)}</span>
                </span>
              </div>
            ))}
          </div>
        </Secao>
      )}
    </div>
  );
}
