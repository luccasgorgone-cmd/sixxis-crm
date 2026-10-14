"use client";

// Aba EXPLICATIVO do Supervisor: documentação viva de "como está configurado
// agora", para o gestor não se perder. Read-only. Lê a config vigente (GET
// /config) e monta: as varreduras que rodam (a do Supervisor, da config viva, +
// as rotinas do sistema), os valores de config em linguagem simples, e os
// relatórios disponíveis. Nada edita aqui — a edição é na aba Configurações.
import { useState, useEffect, useCallback } from "react";
import { Radar, SlidersHorizontal, FileBarChart, Clock, Sparkles, RefreshCw } from "lucide-react";
import { EstadoErro } from "@/components/ui/Estado";
import { Secao } from "./PainelPartes";
import {
  REGISTRO_SISTEMA,
  resumoVarreduraSupervisor,
  linhasConfig,
  type EntradaVarredura,
} from "@/lib/supervisor/explicativo";
import {
  nomeSinal,
  type ConfigEditavel,
  type AprendizadoSnapshot,
  type ForcaInsight,
  type SinalVarredura,
} from "@/lib/supervisor/tipos";

const RELATORIOS: { nome: string; desc: string }[] = [
  { nome: "Relatórios", desc: "KPIs com semáforo, funil por etapa, desempenho por origem e ranking de vendedores." },
  { nome: "Alertas", desc: "Negócios sem próximo passo, parados por etapa e os motivos de perda do período." },
  { nome: "Chat", desc: "Consultor que lê os indicadores, responde e — quando você manda — age (com desfazer)." },
];

function LinhaVarredura({ v, destaque }: { v: EntradaVarredura; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destaque ? "border-tiffany/30 bg-tiffany/5" : "border-black/5 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-semibold text-escuro">{v.nome}</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-medio tabular-nums">
          <Clock className="h-3 w-3" />
          {v.cadencia}
        </span>
      </div>
      <p className="mt-1 text-sm text-medio">{v.oQueFaz}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-medio/60">
        <span>lê: {v.le}</span>
        <span>edita: {v.editavel}</span>
      </div>
    </div>
  );
}

const CORES_FORCA: Record<ForcaInsight, string> = {
  forte: "bg-tiffany/10 text-tiffany-escuro",
  media: "bg-amber-400/10 text-amber-600",
  fraca: "bg-black/[0.04] text-medio",
};

const ROTULO_FORCA: Record<ForcaInsight, string> = {
  forte: "forte",
  media: "média",
  fraca: "amostra fraca",
};

export function PainelExplicativo() {
  const [cfg, setCfg] = useState<ConfigEditavel | null>(null);
  const [apr, setApr] = useState<AprendizadoSnapshot | null>(null);
  const [estudando, setEstudando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    try {
      const [rCfg, rApr] = await Promise.all([
        fetch("/api/admin/supervisor/config"),
        fetch("/api/admin/supervisor/aprender"),
      ]);
      if (!rCfg.ok) {
        setErro(true);
        return;
      }
      setCfg((await rCfg.json()) as ConfigEditavel);
      if (rApr.ok) setApr((await rApr.json()) as AprendizadoSnapshot);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  const estudarAgora = useCallback(async () => {
    setEstudando(true);
    try {
      const r = await fetch("/api/admin/supervisor/aprender", { method: "POST" });
      if (r.ok) {
        const j = (await r.json()) as { aprendizado: AprendizadoSnapshot };
        setApr(j.aprendizado);
      }
    } catch {
      // silencioso: o snapshot anterior segue válido
    } finally {
      setEstudando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro) return <EstadoErro mensagem="Não foi possível carregar o explicativo." onRetry={() => void carregar()} />;
  if (carregando || !cfg) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-40 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const supervisor = resumoVarreduraSupervisor(cfg);

  return (
    <div className="space-y-6 pb-4">
      <Secao
        titulo="Varreduras — o que roda de tempos em tempos"
        icone={Radar}
      >
        <div className="space-y-2">
          <LinhaVarredura v={supervisor} destaque />
          {REGISTRO_SISTEMA.map((v) => (
            <LinhaVarredura key={v.chave} v={v} />
          ))}
        </div>
      </Secao>

      <Secao titulo="O que a IA aprendeu" icone={Sparkles}>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-medio">
              {apr?.geradoEm ? (
                <>
                  Último estudo em{" "}
                  <span className="font-medium text-escuro">
                    {new Date(apr.geradoEm).toLocaleString("pt-BR")}
                  </span>{" "}
                  · {apr.amostras.acoes} decisão(ões) do gestor na amostra.
                </>
              ) : (
                "Ainda sem estudo — a IA aprende do histórico de decisões e dos padrões do funil. Clique para estudar agora."
              )}
            </p>
            <button
              type="button"
              onClick={() => void estudarAgora()}
              disabled={estudando}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-tiffany/30 bg-tiffany/5 px-3 py-1.5 text-xs font-medium text-tiffany-escuro transition hover:bg-tiffany/10 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${estudando ? "animate-spin" : ""}`} />
              {estudando ? "Estudando…" : "Estudar agora"}
            </button>
          </div>

          {apr && apr.insights.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-medio/60">
                Insights
              </p>
              {apr.insights.map((i, idx) => (
                <div
                  key={idx}
                  className="flex items-start justify-between gap-3 rounded-lg border border-black/5 bg-white px-3 py-2"
                >
                  <span className="text-sm text-escuro">{i.texto}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${CORES_FORCA[i.forca]}`}
                  >
                    {ROTULO_FORCA[i.forca]}
                  </span>
                </div>
              ))}
            </div>
          )}

          {apr && apr.aceitacaoPorSinal.some((a) => a.chave !== "outro" && a.taxa !== null) && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-medio/60">
                Aceitação por tipo de sugestão
              </p>
              <div className="space-y-1">
                {apr.aceitacaoPorSinal
                  .filter((a) => a.chave !== "outro" && a.taxa !== null)
                  .map((a) => (
                    <div
                      key={a.chave}
                      className="flex items-center justify-between gap-3 rounded-lg border border-black/5 bg-white px-3 py-1.5"
                    >
                      <span className="text-sm text-escuro">{nomeSinal(a.chave as SinalVarredura)}</span>
                      <span className="text-sm font-semibold tabular-nums text-escuro">
                        {Math.round((a.taxa ?? 0) * 100)}%
                        <span className="ml-1 text-[11px] font-normal text-medio/60">
                          ({a.executadas}/{a.executadas + a.descartadas})
                        </span>
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {apr && apr.sucessoPorSinal.some((s) => s.taxa !== null) && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-medio/60">
                Resultado quando o gestor agiu (virou ganho?)
              </p>
              <div className="space-y-1">
                {apr.sucessoPorSinal
                  .filter((s) => s.taxa !== null)
                  .map((s) => (
                    <div
                      key={s.sinal}
                      className="flex items-center justify-between gap-3 rounded-lg border border-black/5 bg-white px-3 py-1.5"
                    >
                      <span className="text-sm text-escuro">{nomeSinal(s.sinal)}</span>
                      <span className="text-sm font-semibold tabular-nums text-escuro">
                        {Math.round((s.taxa ?? 0) * 100)}%
                        <span className="ml-1 text-[11px] font-normal text-medio/60">
                          ({s.ganhos}/{s.executadas})
                        </span>
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-medio/50">
            Aprendizado determinístico (zero custo de IA): a IA acumula o que você
            aceita/descarta e o que dá certo, e usa isso para priorizar o conselho.
            Ela nunca muda a configuração nem desliga uma varredura sozinha — só
            sugere.
          </p>
        </div>
      </Secao>

      <Secao titulo="Configuração atual" icone={SlidersHorizontal}>
        <div className="space-y-4">
          {linhasConfig(cfg).map((g) => (
            <div key={g.grupo}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-medio/60">
                {g.grupo}
              </p>
              <div className="space-y-1.5">
                {g.itens.map((it) => (
                  <div
                    key={it.rotulo}
                    className="flex flex-col gap-0.5 rounded-lg border border-black/5 bg-white px-3 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
                  >
                    <div className="min-w-0">
                      <span className="text-sm text-escuro">{it.rotulo}</span>
                      <span className="ml-2 text-[11px] text-medio/60">{it.significado}</span>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-escuro">{it.valor}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-medio/50">
            Para mudar qualquer um destes, use a aba Configurações ou peça à IA no
            chat (ela confirma a mudança com você).
          </p>
        </div>
      </Secao>

      <Secao titulo="Relatórios disponíveis" icone={FileBarChart}>
        <div className="space-y-1.5">
          {RELATORIOS.map((r) => (
            <div key={r.nome} className="rounded-lg border border-black/5 bg-white px-3 py-2">
              <span className="text-sm font-medium text-escuro">{r.nome}</span>
              <p className="mt-0.5 text-xs text-medio">{r.desc}</p>
            </div>
          ))}
        </div>
      </Secao>
    </div>
  );
}
