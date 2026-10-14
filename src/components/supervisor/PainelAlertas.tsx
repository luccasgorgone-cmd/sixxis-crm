"use client";

// Aba ALERTAS do Supervisor: o que precisa de ação AGORA, lido da mesma forma
// PainelSupervisor (Camada 1). Negócios sem próximo passo, negócios parados além
// do limiar por etapa e as perdas do período. Sem fetch próprio — recebe o painel
// que a console já carregou. Quando não há nada pendente, mostra estado vazio.
import { useState, useEffect, useCallback } from "react";
import type { PainelSupervisor } from "@/lib/supervisor/tipos";
import { formatarBRL, formatarPct } from "@/lib/format";
import { CalendarClock, CheckCircle2, Hourglass, TrendingDown, Wand2 } from "lucide-react";
import { EstadoVazio } from "@/components/ui/Estado";
import { LinhaLista, Secao } from "./PainelPartes";
import { CardAcao, type AcaoProposta } from "./CardAcao";

// Chip compacto de resumo: rótulo + valor + ponto de severidade. Não é um
// hero-metric card — é uma leitura rápida do volume de cada tipo de alerta.
function ChipResumo({
  rotulo,
  valor,
  severidade,
}: {
  rotulo: string;
  valor: string;
  severidade: "alerta" | "erro" | "ok";
}) {
  const cor =
    severidade === "erro"
      ? "bg-erro"
      : severidade === "alerta"
        ? "bg-amber-500"
        : "bg-sucesso";
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-black/5 bg-white px-3.5 py-2.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${cor}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none tabular-nums text-escuro">
          {valor}
        </p>
        <p className="mt-1 truncate text-[11px] leading-none text-medio/60">
          {rotulo}
        </p>
      </div>
    </div>
  );
}

export function PainelAlertas({ painel }: { painel: PainelSupervisor }) {
  const sem = painel.semProximoPasso;
  const parados = painel.parados.filter((p) => p.parados > 0);
  const totalParados = parados.reduce((s, p) => s + p.parados, 0);
  const perdasTop = painel.perdas.porMotivo.slice(0, 5);

  // Propostas abertas pela varredura periódica (ações prontas para confirmar).
  const [propostas, setPropostas] = useState<AcaoProposta[]>([]);
  const carregarPropostas = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/supervisor/acoes");
      if (!r.ok) return;
      const d = (await r.json()) as { itens?: AcaoProposta[] };
      setPropostas(d.itens ?? []);
    } catch {
      // silencioso: a aba de alertas ainda mostra o resto
    }
  }, []);
  useEffect(() => {
    void carregarPropostas();
  }, [carregarPropostas]);

  const removerProposta = (id: string) =>
    setPropostas((prev) => prev.filter((p) => p.id !== id));

  const semNada =
    sem.semProximo === 0 &&
    totalParados === 0 &&
    painel.perdas.total === 0 &&
    propostas.length === 0;

  if (semNada) {
    return (
      <EstadoVazio
        icone={CheckCircle2}
        titulo="Tudo em dia"
        texto="Nenhum negócio sem próximo passo, nenhum parado além do limiar e nenhuma perda registrada no período."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Sugestões abertas pela varredura periódica (confirmar/descartar). */}
      {propostas.length > 0 && (
        <Secao
          titulo="Sugestões da varredura"
          icone={Wand2}
          extra={`${propostas.length} pendente${propostas.length === 1 ? "" : "s"}`}
        >
          <div className="space-y-2">
            {propostas.map((p) => (
              <CardAcao key={p.id} acao={p} onResolvido={() => removerProposta(p.id)} />
            ))}
          </div>
        </Secao>
      )}

      {/* Resumo rápido */}
      <div className="grid grid-cols-3 gap-2.5">
        <ChipResumo
          rotulo="Sem próximo passo"
          valor={String(sem.semProximo)}
          severidade={sem.semProximo > 0 ? "alerta" : "ok"}
        />
        <ChipResumo
          rotulo="Parados além do prazo"
          valor={String(totalParados)}
          severidade={totalParados > 0 ? "alerta" : "ok"}
        />
        <ChipResumo
          rotulo="Perdas no período"
          valor={String(painel.perdas.total)}
          severidade={painel.perdas.total > 0 ? "erro" : "ok"}
        />
      </div>

      {sem.semProximo > 0 && (
        <Secao
          titulo="Negócios sem próximo passo"
          icone={CalendarClock}
          extra={sem.pct != null ? formatarPct(sem.pct) : undefined}
        >
          <LinhaLista>
            <span className="text-escuro">
              Abertos sem lembrete futuro agendado
            </span>
            <span className="shrink-0 text-xs text-medio/70">
              <span className="font-medium text-escuro">{sem.semProximo}</span> de{" "}
              <span className="tabular-nums">{sem.totalAbertos}</span> abertos
            </span>
          </LinhaLista>
        </Secao>
      )}

      {parados.length > 0 && (
        <Secao
          titulo="Parados por etapa"
          icone={Hourglass}
          extra={`${totalParados} negócio${totalParados === 1 ? "" : "s"}`}
        >
          <div className="space-y-1.5">
            {parados.map((p) => (
              <LinhaLista key={p.etapaId ?? p.nome}>
                <span className="truncate text-escuro">{p.nome}</span>
                <span className="shrink-0 text-xs text-medio/70">
                  <span className="font-medium text-escuro tabular-nums">
                    {p.parados}
                  </span>
                  {p.limiarDias != null && (
                    <span className="text-medio/50"> · +{p.limiarDias} d parado</span>
                  )}
                </span>
              </LinhaLista>
            ))}
          </div>
        </Secao>
      )}

      {perdasTop.length > 0 && (
        <Secao
          titulo="Principais motivos de perda"
          icone={TrendingDown}
          extra={formatarBRL(painel.perdas.valorTotal)}
        >
          <div className="space-y-1.5">
            {perdasTop.map((m) => (
              <LinhaLista key={m.code || m.label}>
                <span className="truncate text-escuro">{m.label}</span>
                <span className="shrink-0 text-xs text-medio/70">
                  <span className="font-medium text-escuro tabular-nums">
                    {m.count}
                  </span>{" "}
                  {/* m.pct já vem em 0–100 (perdidos.ts) — NÃO passar por
                      formatarPct, que multiplica por 100. */}
                  <span className="tabular-nums">· {m.pct}%</span>
                </span>
              </LinhaLista>
            ))}
          </div>
        </Secao>
      )}
    </div>
  );
}
