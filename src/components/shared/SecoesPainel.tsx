"use client";

// Secoes REUTILIZAVEIS do painel do cliente (Fatia B): extraidas de NegocioAcoes
// para serem consumidas IGUAIS pelos dois paineis (inbox e Kanban) — zero
// duplicacao, um componente por secao. Nada de logica nova: so reorganizacao de UI.
// Padrao da casa: dark, tiffany, Lucide monocromatico, sem emoji, titulos uppercase.
import { useEffect, useState } from "react";
import {
  Thermometer,
  GitBranch,
  Store,
  Loader2,
  PauseCircle,
  PlayCircle,
  XCircle,
  Trophy,
  RotateCcw,
} from "lucide-react";
import { BadgeTemperatura } from "@/components/badges";
import { BadgeSegmento } from "@/components/cliente/BlocoCliente";
import { useToast } from "@/components/ui/Toast";
import { MOTIVOS_PENDENCIA } from "@/lib/motivosPendencia";
import {
  TEMPERATURA_INFO,
  type DetalheNegocio,
  type Etapa,
  type Temperatura,
} from "@/components/kanban/tipos";

// Rotulo compacto (mesmo padrao do painel).
function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-medium text-medio/70">{children}</label>
  );
}

// Titulo padrao de secao (uppercase text-medio/50), com icone monocromatico.
function TituloSecao({
  icone: Icone,
  children,
}: {
  icone: typeof Thermometer;
  children: React.ReactNode;
}) {
  return (
    <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
      <Icone className="h-3.5 w-3.5" /> {children}
    </h4>
  );
}

// ----------------------------------------------------------------------------
// Temperatura (SO VENDA). Pos-venda usa ganho/pendente/perdido + garantia; o
// campo Negocio.temperatura permanece no banco. Extraida de NegocioAcoes sem
// mudanca de logica.
// ----------------------------------------------------------------------------
export function SecaoTemperatura({
  temperatura,
  finalidade,
  salvar,
}: {
  temperatura: Temperatura | null | undefined;
  finalidade: string;
  salvar: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  if (finalidade === "POS_VENDA") return null;
  return (
    <section className="rounded-xl border border-black/5 bg-white p-4">
      <TituloSecao icone={Thermometer}>Temperatura</TituloSecao>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(TEMPERATURA_INFO) as Temperatura[]).map((t) => {
          const ativo = temperatura === t;
          return (
            <button
              key={t}
              onClick={() => {
                if (!ativo) void salvar({ temperatura: t });
              }}
              className={`rounded-lg border px-1.5 py-1 transition-colors ${
                ativo
                  ? "border-tiffany bg-tiffany/5"
                  : "border-transparent hover:bg-black/5"
              }`}
            >
              <BadgeTemperatura temperatura={t} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// Etapa do funil. Trocar para GANHO/PERDIDO abre o modal de fechamento (via
// abrirModal); demais etapas salvam direto. Extraida de NegocioAcoes.
// ----------------------------------------------------------------------------
export function SecaoEtapa({
  etapaId,
  etapas,
  salvar,
  abrirModal,
}: {
  etapaId: string | null;
  etapas: Etapa[];
  salvar: (body: Record<string, unknown>) => Promise<boolean>;
  abrirModal: (tipo: "ganho" | "perdido", etapaId: string) => void;
}) {
  function aoTrocarEtapa(novaEtapaId: string) {
    const et = etapas.find((e) => e.id === novaEtapaId);
    if (!et || novaEtapaId === etapaId) return;
    if (et.tipo === "GANHO") return abrirModal("ganho", novaEtapaId);
    if (et.tipo === "PERDIDO") return abrirModal("perdido", novaEtapaId);
    void salvar({ etapaId: novaEtapaId });
  }
  return (
    <section className="rounded-xl border border-black/5 bg-white p-4">
      <TituloSecao icone={GitBranch}>Etapa</TituloSecao>
      <select
        value={etapaId ?? ""}
        onChange={(e) => aoTrocarEtapa(e.target.value)}
        className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
      >
        {etapas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome}
          </option>
        ))}
      </select>
    </section>
  );
}

// ----------------------------------------------------------------------------
// Segmento comercial do CLIENTE (Varejo/Atacado). SO VENDA (o pai so monta esta
// secao na finalidade de venda). Promove a seletor visivel o segmento que hoje
// so vive no formulario do BlocoCliente — mantendo BadgeSegmento e a persistencia
// atual (PATCH /api/leads/[id] { segmento }). Auto-busca o valor via GET (nao
// depende do detalhe do negocio, que nao carrega segmento).
// ----------------------------------------------------------------------------
export function SecaoSegmento({
  leadId,
  onAtualizado,
}: {
  leadId: string;
  onAtualizado?: () => void;
}) {
  const toast = useToast();
  const [segmento, setSegmento] = useState<"VAREJO" | "ATACADO" | "">("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    fetch(`/api/leads/${leadId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo) setSegmento((d?.cliente?.segmento as "VAREJO" | "ATACADO") ?? "");
      })
      .catch(() => {
        if (vivo) setSegmento("");
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [leadId]);

  async function mudar(novo: string) {
    const anterior = segmento;
    setSegmento((novo as "VAREJO" | "ATACADO") || "");
    setSalvando(true);
    try {
      const r = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmento: novo || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        if (!(r.status === 400 && d?.erro === "nada a atualizar")) {
          setSegmento(anterior);
          toast.erro(d?.erro ?? "Nao foi possivel salvar o segmento.");
          return;
        }
      }
      onAtualizado?.();
    } catch {
      setSegmento(anterior);
      toast.erro("Falha de conexao ao salvar o segmento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="rounded-xl border border-black/5 bg-white p-4">
      <TituloSecao icone={Store}>Segmento</TituloSecao>
      <div className="mb-2 flex items-center gap-2">
        {segmento ? (
          <BadgeSegmento segmento={segmento} />
        ) : (
          <span className="text-xs text-medio/40">Nao definido</span>
        )}
      </div>
      <select
        value={segmento}
        disabled={carregando || salvando}
        onChange={(e) => void mudar(e.target.value)}
        className="campo w-full"
      >
        <option value="">Nao definido</option>
        <option value="VAREJO">Varejo</option>
        <option value="ATACADO">Atacado</option>
      </select>
    </section>
  );
}

// ----------------------------------------------------------------------------
// DECISOES do orcamento (Ganho/Perdido/Pendente) — Fatia B: renderizadas no
// RODAPE da secao de orcamento (via slot `rodape` do BlocoOrcamento). Extraidas
// de NegocioAcoes SEM mudanca de logica: GANHO abre o modal (que exige valor na
// venda); Ganho/Perdido limpam a pendencia (feito no onConfirmar do modal); o
// botao Pendente captura o motivo e marca. Inclui o motivo-da-perda + reativar
// e o detalhe/desmarcar da pendencia.
// ----------------------------------------------------------------------------
export function SecaoDecisoes({
  detalhe,
  etapas,
  salvar,
  recarregar,
  onAtualizado,
  negocioId,
  abrirModal,
}: {
  detalhe: DetalheNegocio;
  etapas: Etapa[];
  salvar: (body: Record<string, unknown>) => Promise<boolean>;
  recarregar: () => Promise<void>;
  onAtualizado: () => void;
  negocioId: string;
  abrirModal: (tipo: "ganho" | "perdido", etapaId: string) => void;
}) {
  const toast = useToast();
  const etapaGanho = etapas.find((e) => e.tipo === "GANHO");
  const etapaPerda = etapas.find((e) => e.tipo === "PERDIDO");
  const etapaAberta = etapas.find((e) => e.tipo === "ABERTA");

  const ehGanho = detalhe.status === "GANHO";
  const ehPerdido = detalhe.status === "PERDIDO";
  const ehPendente = detalhe.pendente;

  const [pendAbrir, setPendAbrir] = useState(false);
  const [pendCode, setPendCode] = useState("");
  const [pendObs, setPendObs] = useState("");
  const [mudandoPend, setMudandoPend] = useState(false);
  const [reativando, setReativando] = useState(false);

  async function reabrir() {
    if (!etapaAberta) return;
    await salvar({ etapaId: etapaAberta.id });
  }
  function clicarGanho() {
    if (ehGanho) {
      void reabrir();
      return;
    }
    if (etapaGanho) abrirModal("ganho", etapaGanho.id);
  }
  function clicarPerdido() {
    if (ehPerdido) {
      void reabrir();
      return;
    }
    if (etapaPerda) abrirModal("perdido", etapaPerda.id);
  }
  function clicarPendente() {
    if (ehPendente) {
      void salvar({ pendente: false });
      return;
    }
    setPendCode("");
    setPendObs("");
    setPendAbrir(true);
  }
  async function confirmarPendente() {
    if (!pendCode) {
      toast.erro("Escolha o motivo da pendência.");
      return;
    }
    const obs = pendObs.trim();
    if (pendCode === "OUTRO" && !obs) {
      toast.erro("Descreva o motivo (Outro).");
      return;
    }
    setMudandoPend(true);
    const body: Record<string, unknown> = {
      pendente: true,
      motivoPendenciaCode: pendCode,
      motivoPendencia: obs || null,
    };
    if ((ehGanho || ehPerdido) && etapaAberta) body.etapaId = etapaAberta.id;
    const ok = await salvar(body);
    setMudandoPend(false);
    if (ok) {
      setPendAbrir(false);
      setPendCode("");
      setPendObs("");
      toast.sucesso("Negócio marcado como pendente.");
    }
  }

  async function reativar() {
    setReativando(true);
    try {
      const r = await fetch(`/api/negocios/${negocioId}/reativar`, { method: "POST" });
      if (r.ok) {
        toast.sucesso("Negocio reativado.");
        await recarregar();
        onAtualizado();
      } else {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel reativar.");
      }
    } catch {
      toast.erro("Falha de conexão.");
    } finally {
      setReativando(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Decisao (Fatia 3.07): Pendente e Perdido lado a lado (secundarios); GANHO
          em destaque abaixo. Clicar um estado ativo desmarca (volta a ABERTO). */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            onClick={clicarPendente}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              ehPendente
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "border border-amber-300 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-500/10"
            }`}
          >
            <PauseCircle className="h-4 w-4" /> Pendente
          </button>
          {etapaPerda && (
            <button
              onClick={clicarPerdido}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                ehPerdido
                  ? "bg-erro text-white hover:brightness-95"
                  : "border border-erro/40 text-erro hover:bg-erro/10"
              }`}
            >
              <XCircle className="h-4 w-4" /> Perdido
            </button>
          )}
        </div>
        {etapaGanho && (
          <button
            onClick={clicarGanho}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold text-white shadow-sm transition-transform hover:scale-[1.01] active:scale-100 ${
              ehGanho ? "bg-tiffany-escuro" : "bg-tiffany hover:bg-tiffany-escuro"
            }`}
          >
            <Trophy className="h-5 w-5" /> Ganho
          </button>
        )}
      </div>

      {/* Captura do MOTIVO da pendencia (superficie escura da casa). */}
      {pendAbrir && !ehPendente && (
        <div className="space-y-2.5 rounded-lg border border-white/10 bg-escuro p-3">
          <p className="text-xs font-semibold text-white/90">Motivo da pendência</p>
          <select
            value={pendCode}
            onChange={(e) => setPendCode(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-tiffany"
          >
            <option value="">Selecione um motivo...</option>
            {MOTIVOS_PENDENCIA.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
          <textarea
            value={pendObs}
            onChange={(e) => setPendObs(e.target.value)}
            rows={2}
            placeholder={pendCode === "OUTRO" ? "Descreva o motivo" : "Observação (opcional)"}
            className="scroll-fino w-full resize-none rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-tiffany"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setPendAbrir(false);
                setPendCode("");
                setPendObs("");
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              onClick={() => void confirmarPendente()}
              disabled={mudandoPend || !pendCode || (pendCode === "OUTRO" && !pendObs.trim())}
              className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-50"
            >
              {mudandoPend && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Marcar pendente
            </button>
          </div>
        </div>
      )}

      {/* Motivo da perda + reativar (quando perdido) */}
      {detalhe.status === "PERDIDO" && (
        <div className="space-y-2">
          {detalhe.motivoPerdaLabel && (
            <div className="rounded-lg border border-red-100 bg-red-50/60 p-3">
              <p className="text-xs font-semibold text-red-700">
                Motivo da perda: {detalhe.motivoPerdaLabel}
              </p>
              {detalhe.motivoPerdaObs && (
                <p className="mt-0.5 text-xs text-red-900/80">{detalhe.motivoPerdaObs}</p>
              )}
            </div>
          )}
          <button
            onClick={() => void reativar()}
            disabled={reativando}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {reativando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Reativar negocio
          </button>
        </div>
      )}

      {/* Detalhe/desmarcar da pendencia operacional */}
      <BlocoPendencia detalhe={detalhe} salvar={salvar} />
    </div>
  );
}

// Pendencia operacional: quando pendente, mostra o motivo atual e permite
// desmarcar. Marcar pendente e feito pelo botao "Pendente" acima.
function BlocoPendencia({
  detalhe,
  salvar,
}: {
  detalhe: DetalheNegocio;
  salvar: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const toast = useToast();
  const [salvando, setSalvando] = useState(false);

  async function desmarcar() {
    setSalvando(true);
    const ok = await salvar({ pendente: false });
    setSalvando(false);
    if (ok) toast.sucesso("Pendencia removida.");
  }

  if (!detalhe.pendente) return null;

  return (
    <div>
      <Rotulo>Pendencia</Rotulo>
      <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
        <div className="flex items-start gap-2">
          <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-orange-700">
              {detalhe.motivoPendenciaLabel ?? "Negócio pendente"}
            </p>
            {detalhe.motivoPendencia && (
              <p className="mt-0.5 whitespace-pre-wrap text-xs text-orange-900/80">
                {detalhe.motivoPendencia}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => void desmarcar()}
          disabled={salvando}
          className="mt-2 flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-orange-700 ring-1 ring-orange-200 transition-colors hover:bg-orange-100 disabled:opacity-60"
        >
          {salvando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayCircle className="h-3.5 w-3.5" />
          )}
          Desmarcar pendencia
        </button>
      </div>
    </div>
  );
}
