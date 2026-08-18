"use client";

// Sandbox de Atendimento (Kanban + Inbox ficticios) — WORKORDER_ATENDIMENTO_
// OMNICHANNEL, pedido direto do Luccas em 18/08/2026. AMBIENTE 100% ISOLADO:
// so fala com /api/admin/sandbox/* (tabelas Sandbox*, sem FK com dado real).
// Nada aqui envia WhatsApp real nem toca Lead/Negocio/Conversa/Mensagem.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Send,
  Trash2,
  FlaskConical,
  Plus,
  Play,
  Pause,
  UserCog,
  Ban,
  MessageSquare,
} from "lucide-react";
import { ROTEIROS_SANDBOX } from "@/lib/sandboxSimulador";

type Acao = "responder" | "handoff" | "silenciar";
type SandboxMsg = {
  id: string;
  direcao: "IN" | "OUT";
  texto: string;
  acao?: string | null;
  motivo?: string | null;
  criadoEm: string;
};
type SandboxNegocio = {
  id: string;
  etapa: string;
  finalidade: string;
  mensagens: SandboxMsg[];
};
type SandboxLeadDTO = {
  id: string;
  nome: string;
  roteiro: string | null;
  negocios: SandboxNegocio[];
};

const ETAPAS = ["NOVO", "ATENDENDO", "TRANSFERIDO", "ENCERRADO"] as const;
const ROTULO_ETAPA: Record<string, string> = {
  NOVO: "Novo",
  ATENDENDO: "Atendendo",
  TRANSFERIDO: "Transferido",
  ENCERRADO: "Encerrado",
};
const SELO: Record<Acao, { rotulo: string; classe: string; Icone: typeof Send }> = {
  responder: { rotulo: "Respondeu", classe: "bg-tiffany/10 text-tiffany", Icone: MessageSquare },
  handoff: {
    rotulo: "Transferiu",
    classe: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    Icone: UserCog,
  },
  silenciar: {
    rotulo: "Silenciou",
    classe: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    Icone: Ban,
  },
};

const AUTOTICK_INTERVALO_MS = 12000;

export function SandboxAtendimento() {
  const [leads, setLeads] = useState<SandboxLeadDTO[]>([]);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [input, setInput] = useState("");
  const [promptExtra, setPromptExtra] = useState("");
  const [autoRodando, setAutoRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/admin/sandbox/leads");
      const d = await r.json().catch(() => null);
      if (r.ok && Array.isArray(d?.leads)) setLeads(d.leads);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    fetch("/api/admin/sandbox/config")
      .then((r) => r.json())
      .then((d) => setPromptExtra(d?.config?.promptSistemaExtra ?? ""))
      .catch(() => {});
  }, [carregar]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [selecionadoId, leads]);

  // Timer do simulador: SO roda enquanto autoRodando=true e a tela esta
  // aberta (sem cron/worker server-side). Para automaticamente ao desmontar.
  useEffect(() => {
    if (!autoRodando) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      fetch("/api/admin/sandbox/autoTick", { method: "POST" })
        .then(() => carregar())
        .catch(() => {});
    }, AUTOTICK_INTERVALO_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRodando, carregar]);

  const negocioSelecionado = leads
    .flatMap((l) => l.negocios.map((n) => ({ ...n, lead: l })))
    .find((n) => n.id === selecionadoId);

  async function criarLeadManual(roteiroId?: string) {
    const r = await fetch("/api/admin/sandbox/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(roteiroId ? { roteiroId } : {}),
    });
    const d = await r.json().catch(() => null);
    if (r.ok && d?.lead) {
      await carregar();
      setSelecionadoId(d.lead.negocios[0]?.id ?? null);
    }
  }

  async function enviar() {
    const texto = input.trim();
    if (!texto || !negocioSelecionado || enviando) return;
    setErro(null);
    setEnviando(true);
    setInput("");
    try {
      const r = await fetch("/api/admin/sandbox/mensagens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ negocioId: negocioSelecionado.id, texto }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setErro(d?.erro ?? "Falha ao consultar a Sol.");
      }
      await carregar();
    } catch {
      setErro("Falha de conexao.");
    } finally {
      setEnviando(false);
    }
  }

  async function salvarPromptExtra() {
    await fetch("/api/admin/sandbox/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptSistemaExtra: promptExtra }),
    });
  }

  async function limparTudo() {
    if (!confirm("Apagar TODOS os leads/negocios/mensagens ficticios do sandbox?")) return;
    setAutoRodando(false);
    await fetch("/api/admin/sandbox", { method: "DELETE" });
    setSelecionadoId(null);
    await carregar();
  }

  const colunas = ETAPAS.map((etapa) => ({
    etapa,
    negocios: leads.flatMap((l) => l.negocios.filter((n) => n.etapa === etapa).map((n) => ({ ...n, lead: l }))),
  }));

  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
        <FlaskConical className="h-4 w-4 text-tiffany" />
        Sandbox de Atendimento (Kanban + Inbox fictícios)
      </h3>
      <p className="mb-2 text-xs text-medio/60">
        Ambiente 100% isolado do CRM real — leads, negócios e mensagens aqui
        vivem em tabelas próprias, sem nenhum vínculo com clientes reais. A Sol
        aqui nunca envia nada de verdade: quando ela &quot;mandaria&quot; algo,
        o texto só aparece na conversa. Cada resposta consome do mesmo teto de
        IA do mês (rotulado &quot;sandbox_*&quot; nas métricas).
      </p>

      {/* Barra de controles */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void criarLeadManual()}
          className="flex items-center gap-1 rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium text-medio hover:border-tiffany hover:text-tiffany"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo cliente fictício
        </button>
        <select
          onChange={(e) => {
            if (e.target.value) void criarLeadManual(e.target.value);
            e.target.value = "";
          }}
          defaultValue=""
          className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-medio outline-none"
        >
          <option value="">+ com roteiro pronto...</option>
          {ROTEIROS_SANDBOX.map((r) => (
            <option key={r.id} value={r.id}>
              {r.rotulo}
            </option>
          ))}
        </select>
        <button
          onClick={() => setAutoRodando((v) => !v)}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
            autoRodando
              ? "bg-tiffany text-white"
              : "border border-black/10 text-medio hover:border-tiffany hover:text-tiffany"
          }`}
        >
          {autoRodando ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {autoRodando ? "Simulador rodando" : "Ligar simulador"}
        </button>
        <button
          onClick={() => void limparTudo()}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-medio/70 hover:bg-black/5 hover:text-escuro"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Limpar sandbox
        </button>
      </div>

      {/* Prompt extra editavel ao vivo */}
      <div className="mb-3 rounded-lg border border-black/10 bg-fundo/40 p-2">
        <label className="mb-1 block text-[11px] font-medium text-medio/60">
          Personalidade extra (só neste sandbox — não altera a config real):
        </label>
        <textarea
          value={promptExtra}
          onChange={(e) => setPromptExtra(e.target.value)}
          onBlur={() => void salvarPromptExtra()}
          rows={2}
          placeholder="Ex.: seja mais direta, ofereça o cupom mais cedo..."
          className="w-full resize-none rounded-md border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-tiffany"
        />
      </div>

      {carregando && leads.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-medio/50">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* Mini-Kanban */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {colunas.map((col) => (
              <div key={col.etapa} className="rounded-lg border border-black/5 bg-fundo/40 p-1.5">
                <div className="mb-1 text-[10px] font-semibold uppercase text-medio/50">
                  {ROTULO_ETAPA[col.etapa]} ({col.negocios.length})
                </div>
                <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                  {col.negocios.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => setSelecionadoId(n.id)}
                      className={`w-full truncate rounded-md border px-1.5 py-1 text-left text-[11px] transition-colors ${
                        selecionadoId === n.id
                          ? "border-tiffany bg-tiffany/10 text-tiffany"
                          : "border-black/5 bg-white text-medio hover:border-tiffany/40"
                      }`}
                      title={n.lead.nome}
                    >
                      {n.lead.nome}
                      <span className="ml-1 text-[9px] text-medio/40">
                        ({n.finalidade === "POS_VENDA" ? "PV" : "V"})
                      </span>
                    </button>
                  ))}
                  {col.negocios.length === 0 && (
                    <div className="px-1 py-1 text-[10px] text-medio/30">vazio</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Inbox: thread do negocio selecionado */}
          <div className="overflow-hidden rounded-xl border border-black/5 bg-white">
            {!negocioSelecionado ? (
              <div className="flex h-72 flex-col items-center justify-center gap-2 text-center text-medio/50">
                <MessageSquare className="h-6 w-6 text-medio/30" />
                <p className="max-w-xs text-xs">
                  Selecione um card no mini-Kanban ou crie um cliente fictício
                  para conversar.
                </p>
              </div>
            ) : (
              <>
                <div className="border-b border-black/5 px-3 py-1.5 text-xs font-medium text-escuro">
                  {negocioSelecionado.lead.nome}{" "}
                  <span className="text-medio/40">
                    ({negocioSelecionado.finalidade === "POS_VENDA" ? "Pós-venda" : "Venda"})
                  </span>
                </div>
                <div className="scroll-fino flex h-64 flex-col gap-2 overflow-y-auto bg-fundo p-3">
                  {negocioSelecionado.mensagens.map((m) => (
                    <div key={m.id} className={`flex ${m.direcao === "IN" ? "justify-end" : "justify-start"}`}>
                      <div className="flex flex-col gap-1">
                        {m.direcao === "OUT" && m.acao && m.acao in SELO && (
                          <span
                            className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${SELO[m.acao as Acao].classe}`}
                          >
                            {SELO[m.acao as Acao].rotulo}
                          </span>
                        )}
                        <div
                          className={`max-w-[240px] whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${
                            m.direcao === "IN"
                              ? "rounded-br-sm bg-tiffany text-white"
                              : "rounded-bl-sm border border-black/5 bg-white text-escuro"
                          }`}
                        >
                          {m.texto}
                        </div>
                      </div>
                    </div>
                  ))}
                  {enviando && (
                    <div className="flex items-center gap-1.5 text-xs text-medio/50">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sol pensando...
                    </div>
                  )}
                  <div ref={fimRef} />
                </div>
                {erro && (
                  <div className="border-t border-black/5 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                    {erro}
                  </div>
                )}
                <div className="flex items-end gap-2 border-t border-black/5 bg-white p-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void enviar();
                      }
                    }}
                    rows={1}
                    placeholder="Escreva como se fosse este cliente..."
                    className="scroll-fino max-h-24 flex-1 resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
                  />
                  <button
                    onClick={() => void enviar()}
                    disabled={enviando || !input.trim()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tiffany text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-50"
                    aria-label="Enviar"
                  >
                    {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
