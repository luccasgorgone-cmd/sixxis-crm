"use client";

// Console do Supervisor Comercial IA (SPEC §7) — admin-only. Organizado em três
// abas no topo: Relatórios (visão analítica), Alertas (o que precisa de ação) e
// Chat (o consultor interno). Relatórios e Alertas leem a MESMA forma
// PainelSupervisor (um único fetch, recarregado quando o gestor troca
// período/finalidade); o Chat conversa com a IA, que também lê o painel no
// servidor. Nada é executado sem confirmação do gestor (human-in-the-loop).
import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart3, Bell, MessageSquare, Gauge, SlidersHorizontal, BookOpen, User, X } from "lucide-react";
import { Cabecalho } from "@/components/admin/VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import type { PainelSupervisor } from "@/lib/supervisor/tipos";
import { PainelRelatorios } from "./PainelRelatorios";
import { PainelAlertas } from "./PainelAlertas";
import { ChatSupervisor } from "./ChatSupervisor";
import { PainelConfiguracoes } from "./PainelConfiguracoes";
import { PainelExplicativo } from "./PainelExplicativo";

type Aba = "relatorios" | "alertas" | "chat" | "config" | "explicativo";
type Periodo = "hoje" | "semana" | "15d" | "mes";
type Finalidade = "" | "VENDA" | "POS_VENDA";

const PERIODOS: { chave: Periodo; rotulo: string }[] = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "semana", rotulo: "7 dias" },
  { chave: "15d", rotulo: "15 dias" },
  { chave: "mes", rotulo: "30 dias" },
];

const FINALIDADES: { chave: Finalidade; rotulo: string }[] = [
  { chave: "", rotulo: "Tudo" },
  { chave: "VENDA", rotulo: "Venda" },
  { chave: "POS_VENDA", rotulo: "Pós-venda" },
];

const ABAS: { chave: Aba; rotulo: string; icone: typeof BarChart3 }[] = [
  { chave: "relatorios", rotulo: "Relatórios", icone: BarChart3 },
  { chave: "alertas", rotulo: "Alertas", icone: Bell },
  { chave: "chat", rotulo: "Chat", icone: MessageSquare },
  { chave: "config", rotulo: "Configurações", icone: SlidersHorizontal },
  { chave: "explicativo", rotulo: "Explicativo", icone: BookOpen },
];

// Há algo pedindo atenção? (dirige o ponto no rótulo da aba Alertas.)
function temAtencao(p: PainelSupervisor | null): boolean {
  if (!p) return false;
  const parados = p.parados.some((x) => x.parados > 0);
  return p.semProximoPasso.semProximo > 0 || parados || p.perdas.total > 0;
}

function Segmentado<T extends string>({
  opcoes,
  valor,
  aoMudar,
  rotuloGrupo,
}: {
  opcoes: { chave: T; rotulo: string }[];
  valor: T;
  aoMudar: (v: T) => void;
  rotuloGrupo: string;
}) {
  return (
    <div
      role="group"
      aria-label={rotuloGrupo}
      className="flex items-center gap-0.5 rounded-lg border border-black/5 bg-white p-0.5"
    >
      {opcoes.map((o) => (
        <button
          key={o.chave || "_"}
          onClick={() => aoMudar(o.chave)}
          aria-pressed={valor === o.chave}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            valor === o.chave
              ? "bg-tiffany/10 text-tiffany"
              : "text-medio hover:text-escuro"
          }`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function SupervisorConsole() {
  const [aba, setAba] = useState<Aba>("relatorios");
  const [painel, setPainel] = useState<PainelSupervisor | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [finalidade, setFinalidade] = useState<Finalidade>("");
  // Drilldown: quando o gestor clica num vendedor do ranking, todo o painel passa
  // a ser recalculado no escopo daquele agente (a rota já aceita agenteId).
  const [agenteFoco, setAgenteFoco] = useState<{ id: string; nome: string } | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    try {
      const qs = new URLSearchParams({ periodo });
      if (finalidade) qs.set("finalidade", finalidade);
      if (agenteFoco) qs.set("agenteId", agenteFoco.id);
      const r = await fetch(`/api/admin/supervisor/painel?${qs.toString()}`);
      if (!r.ok) {
        setErro(true);
        return;
      }
      setPainel((await r.json()) as PainelSupervisor);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [periodo, finalidade, agenteFoco]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Navegação por seta entre abas (acessibilidade de tablist).
  function aoTeclarNasAbas(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = ABAS.findIndex((a) => a.chave === aba);
    const prox =
      e.key === "ArrowRight"
        ? (i + 1) % ABAS.length
        : (i - 1 + ABAS.length) % ABAS.length;
    setAba(ABAS[prox].chave);
    const botoes = tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    botoes?.[prox]?.focus();
  }

  const atencao = temAtencao(painel);
  const mostraFiltros = aba === "relatorios" || aba === "alertas";

  return (
    <div className="flex h-full min-h-0 flex-col p-4 sm:p-6">
      <Cabecalho
        titulo="Supervisor Comercial"
        subtitulo="Consultor interno de IA — lê os indicadores e sugere o próximo passo. Nada é executado sem a sua confirmação."
      />

      {/* Abas */}
      <div
        ref={tabsRef}
        role="tablist"
        aria-label="Seções do Supervisor"
        onKeyDown={aoTeclarNasAbas}
        className="mt-1 flex items-center gap-1 border-b border-black/5"
      >
        {ABAS.map((a) => {
          const ativa = aba === a.chave;
          const Icone = a.icone;
          const pontoAlerta = a.chave === "alertas" && atencao;
          return (
            <button
              key={a.chave}
              role="tab"
              aria-selected={ativa}
              tabIndex={ativa ? 0 : -1}
              onClick={() => setAba(a.chave)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                ativa
                  ? "border-tiffany text-escuro"
                  : "border-transparent text-medio hover:text-escuro"
              }`}
            >
              <Icone className="h-4 w-4" />
              {a.rotulo}
              {pontoAlerta && (
                <span
                  className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500"
                  aria-label="há pontos de atenção"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Filtros (período / finalidade) — só nas abas de dados. */}
      {mostraFiltros && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Segmentado
            opcoes={PERIODOS}
            valor={periodo}
            aoMudar={setPeriodo}
            rotuloGrupo="Período"
          />
          <Segmentado
            opcoes={FINALIDADES}
            valor={finalidade}
            aoMudar={setFinalidade}
            rotuloGrupo="Finalidade"
          />
          {/* Chip de foco no vendedor (drilldown) — clique no X volta ao geral. */}
          {agenteFoco && (
            <div className="flex items-center gap-1.5 rounded-lg border border-tiffany/30 bg-tiffany/5 px-2.5 py-1 text-xs font-medium text-tiffany">
              <User className="h-3.5 w-3.5" />
              {agenteFoco.nome}
              <button
                onClick={() => setAgenteFoco(null)}
                aria-label="Voltar ao geral"
                className="ml-0.5 rounded hover:text-tiffany-escuro"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Conteúdo da aba ativa */}
      <div className="mt-4 min-h-0 flex-1">
        {aba === "chat" ? (
          <div className="flex h-[calc(100vh-14rem)] min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white">
            <div className="flex items-center gap-2 border-b border-black/5 px-4 py-3">
              <Gauge className="h-4 w-4 text-tiffany" />
              <span className="text-sm font-semibold text-escuro">
                Consultor comercial
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <ChatSupervisor />
            </div>
          </div>
        ) : aba === "config" ? (
          <PainelConfiguracoes />
        ) : aba === "explicativo" ? (
          <PainelExplicativo />
        ) : erro ? (
          <EstadoErro
            mensagem="Não foi possível carregar os indicadores."
            onRetry={() => void carregar()}
          />
        ) : carregando && !painel ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : painel ? (
          <div className={carregando ? "opacity-60 transition-opacity" : ""}>
            {aba === "relatorios" ? (
              <PainelRelatorios
                painel={painel}
                aoFocarAgente={
                  agenteFoco ? undefined : (id, nome) => setAgenteFoco({ id, nome })
                }
              />
            ) : (
              <PainelAlertas painel={painel} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
