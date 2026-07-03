"use client";

// Revisao e DISPARO de campanhas (escopo do usuario). Os rascunhos preparados
// pelo Oracle aparecem aqui; o disparo real e SEMPRE uma acao manual do usuario
// (modal de confirmacao). O Oracle nunca dispara. Dark mode, compacto.
import { useCallback, useEffect, useState } from "react";
import {
  Megaphone,
  Send,
  Trash2,
  Loader2,
  Users,
  AlertTriangle,
  Info,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";

type Campanha = {
  id: string;
  finalidade: string;
  canal: string;
  assunto: string | null;
  mensagem: string;
  total: number;
  enviados: number;
  falhas: number;
  pulados: number;
  status: string;
  criadoEm: string;
  agente: { id: string; nome: string | null } | null;
};

const CANAL: Record<string, string> = { WHATSAPP: "WhatsApp", SMS: "SMS", EMAIL: "E-mail" };
const STATUS: Record<string, { rotulo: string; classe: string }> = {
  RASCUNHO: { rotulo: "Rascunho", classe: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  ENVIANDO: { rotulo: "Enviando", classe: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  CONCLUIDA: { rotulo: "Concluida", classe: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  CANCELADA: { rotulo: "Cancelada", classe: "bg-black/5 text-medio/70" },
};

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Campanhas() {
  const toast = useToast();
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [confirmar, setConfirmar] = useState<Campanha | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    try {
      const r = await fetch("/api/campanhas");
      if (!r.ok) throw new Error();
      setCampanhas((await r.json()).campanhas ?? []);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function disparar(c: Campanha) {
    setOcupado(true);
    try {
      const r = await fetch(`/api/campanhas/${c.id}/disparar`, { method: "POST" });
      if (r.ok) {
        toast.sucesso("Campanha disparada.");
        setConfirmar(null);
        await carregar();
      } else {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel disparar.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setOcupado(false);
    }
  }

  async function descartar(c: Campanha) {
    try {
      const r = await fetch(`/api/campanhas/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelar" }),
      });
      if (r.ok) {
        toast.sucesso("Rascunho descartado.");
        await carregar();
      } else {
        toast.erro("Nao foi possivel descartar.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    }
  }

  const rascunhos = campanhas.filter((c) => c.status === "RASCUNHO");
  const outras = campanhas.filter((c) => c.status !== "RASCUNHO");

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      {/* Cabecalho */}
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tiffany/10 text-tiffany">
          <Megaphone className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-escuro">Campanhas</h2>
          <p className="text-sm text-medio/60">Revise e dispare — o disparo e sua acao</p>
        </div>
      </div>

      {/* Nota honesta */}
      <div className="flex items-start gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-xs text-medio/70">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tiffany" />
        <span>
          O Oracle pode PREPARAR rascunhos, mas NUNCA dispara. Nada e enviado ate voce
          revisar e clicar em disparar aqui.
        </span>
      </div>

      {erro ? (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          Nao foi possivel carregar as campanhas.
        </div>
      ) : carregando && campanhas.length === 0 ? (
        <ListaSkeleton />
      ) : campanhas.length === 0 ? (
        <Vazio />
      ) : (
        <div className="space-y-5">
          {rascunhos.length > 0 && (
            <section className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-medio/50">
                <Sparkles className="h-3.5 w-3.5 text-tiffany" /> Rascunhos (aguardando seu disparo)
              </p>
              {rascunhos.map((c) => (
                <CardCampanha
                  key={c.id}
                  c={c}
                  onDisparar={() => setConfirmar(c)}
                  onDescartar={() => void descartar(c)}
                />
              ))}
            </section>
          )}
          {outras.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-medio/50">
                Enviadas e em andamento
              </p>
              {outras.map((c) => (
                <CardCampanha key={c.id} c={c} />
              ))}
            </section>
          )}
        </div>
      )}

      {/* Modal de confirmacao de disparo */}
      {confirmar && (
        <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="modal-in w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-erro" />
              <h3 className="text-sm font-semibold text-escuro">Disparar campanha</h3>
            </div>
            <p className="text-sm text-medio/80">
              Voce vai ENVIAR esta mensagem para{" "}
              <strong className="text-escuro">{confirmar.total}</strong>{" "}
              {confirmar.total === 1 ? "pessoa" : "pessoas"} via{" "}
              {CANAL[confirmar.canal] ?? confirmar.canal}. Esta acao envia de verdade e
              nao pode ser desfeita. Confirmar?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmar(null)}
                disabled={ocupado}
                className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
              >
                Cancelar
              </button>
              <button
                onClick={() => void disparar(confirmar)}
                disabled={ocupado}
                className="flex items-center gap-1.5 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
              >
                {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Disparar agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CardCampanha({
  c,
  onDisparar,
  onDescartar,
}: {
  c: Campanha;
  onDisparar?: () => void;
  onDescartar?: () => void;
}) {
  const st = STATUS[c.status] ?? STATUS.RASCUNHO;
  const ehRascunho = c.status === "RASCUNHO";
  const concluida = c.status === "CONCLUIDA";
  return (
    <div className="rounded-xl border border-black/5 bg-white p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.classe}`}>
            {st.rotulo}
          </span>
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium text-medio/70">
            {c.finalidade === "POS_VENDA" ? "Pos-venda" : "Venda"}
          </span>
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium text-medio/70">
            {CANAL[c.canal] ?? c.canal}
          </span>
        </div>
        <span className="shrink-0 text-[11px] text-medio/50">{dataCurta(c.criadoEm)}</span>
      </div>

      <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-escuro">
        {c.mensagem}
      </p>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs text-medio/70">
          <Users className="h-3.5 w-3.5 text-medio/40" />
          {c.total} {c.total === 1 ? "pessoa" : "pessoas"}
          {!ehRascunho && (
            <span className="text-medio/50">
              {" "}
              · {c.enviados} enviadas{c.falhas > 0 ? ` · ${c.falhas} falhas` : ""}
            </span>
          )}
        </span>
        {ehRascunho ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onDescartar}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-medio/70 transition-colors hover:bg-black/5 hover:text-erro"
            >
              <Trash2 className="h-3.5 w-3.5" /> Descartar
            </button>
            <button
              onClick={onDisparar}
              className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-tiffany-escuro"
            >
              <Send className="h-3.5 w-3.5" /> Revisar e disparar
            </button>
          </div>
        ) : concluida ? (
          <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Concluida
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Vazio() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-black/10 bg-white py-16 text-center">
      <Megaphone className="h-8 w-8 text-medio/30" />
      <p className="text-sm font-medium text-escuro">Nenhuma campanha ainda</p>
      <p className="max-w-xs text-xs text-medio/60">
        Peca ao Oracle para preparar uma campanha, ou crie um envio em massa. Os
        rascunhos aparecem aqui para voce revisar e disparar.
      </p>
    </div>
  );
}

function ListaSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-black/5 bg-white p-3.5">
          <div className="skeleton mb-2 h-4 w-40" />
          <div className="skeleton h-3 w-full" />
        </div>
      ))}
    </div>
  );
}
