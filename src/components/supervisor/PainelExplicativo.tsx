"use client";

// Aba EXPLICATIVO do Supervisor: documentação viva de "como está configurado
// agora", para o gestor não se perder. Read-only. Lê a config vigente (GET
// /config) e monta: as varreduras que rodam (a do Supervisor, da config viva, +
// as rotinas do sistema), os valores de config em linguagem simples, e os
// relatórios disponíveis. Nada edita aqui — a edição é na aba Configurações.
import { useState, useEffect, useCallback } from "react";
import { Radar, SlidersHorizontal, FileBarChart, Clock } from "lucide-react";
import { EstadoErro } from "@/components/ui/Estado";
import { Secao } from "./PainelPartes";
import {
  REGISTRO_SISTEMA,
  resumoVarreduraSupervisor,
  linhasConfig,
  type EntradaVarredura,
} from "@/lib/supervisor/explicativo";
import type { ConfigEditavel } from "@/lib/supervisor/tipos";

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

export function PainelExplicativo() {
  const [cfg, setCfg] = useState<ConfigEditavel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    try {
      const r = await fetch("/api/admin/supervisor/config");
      if (!r.ok) {
        setErro(true);
        return;
      }
      setCfg((await r.json()) as ConfigEditavel);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
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
