"use client";

// Sino de lembretes no topo. Badge = vencidos + hoje (ao vivo via socket +
// revalidacao periodica, para um "proximo" virar "vencido" sem refresh). Abre um
// painel com 3 grupos (Vencidos / Hoje / Proximos) e acoes por item: marcar
// feito, remarcar (snooze: +1h, amanha, escolher), abrir cliente.
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bell,
  X,
  Check,
  Clock4,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  AlarmClock,
} from "lucide-react";
import { AvatarCliente } from "@/components/AvatarCliente";
import { BadgeFinalidade } from "@/components/badges";
import { PainelNegocio } from "@/components/kanban/PainelNegocio";
import type { Etapa, EtiquetaChip, AgenteResumo } from "@/components/kanban/tipos";
import { getSocket } from "@/lib/socketClient";
import { useToast } from "@/components/ui/Toast";

type LembreteItem = {
  id: string;
  leadId: string;
  negocioId: string | null;
  finalidade: "VENDA" | "POS_VENDA";
  dataHora: string;
  nota: string | null;
  status: string;
  cliente: { nomeEfetivo: string; telefone: string; fotoUrl: string | null };
  agente: string | null;
};

type Grupos = {
  vencidos: LembreteItem[];
  hoje: LembreteItem[];
  proximos: LembreteItem[];
};

function quando(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// +1h, amanha 09:00 (local) e ISO escolhido.
function maisUmaHora(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}
function amanha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export function SinoLembretes({
  papel,
  agenteId,
}: {
  papel: string;
  agenteId: string;
}) {
  const ehAdmin = papel === "ADMIN";
  const escopo = ehAdmin ? "todos" : "meus";
  const toast = useToast();

  const [contador, setContador] = useState({ vencidos: 0, hoje: 0 });
  const [aberto, setAberto] = useState(false);
  const [grupos, setGrupos] = useState<Grupos | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [snoozeId, setSnoozeId] = useState<string | null>(null);

  // Painel do cliente (drilldown). Listas auxiliares carregadas sob demanda.
  const [painelId, setPainelId] = useState<string | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [etiquetas, setEtiquetas] = useState<EtiquetaChip[]>([]);
  const [agentes, setAgentes] = useState<AgenteResumo[]>([]);
  const auxCarregada = useRef(false);

  const carregarContador = useCallback(async () => {
    try {
      const r = await fetch(`/api/lembretes/contador?escopo=${escopo}`);
      if (r.ok) setContador(await r.json());
    } catch {
      // silencioso
    }
  }, [escopo]);

  const carregarGrupos = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/lembretes?escopo=${escopo}`);
      if (r.ok) setGrupos(await r.json());
    } catch {
      // silencioso
    } finally {
      setCarregando(false);
    }
  }, [escopo]);

  // Contador: ao montar, ao vivo (socket) e a cada 60s (vira de proximo->vencido).
  useEffect(() => {
    void carregarContador();
    const socket = getSocket();
    const atualizar = () => {
      void carregarContador();
      if (aberto) void carregarGrupos();
    };
    socket.on("lembrete:novo", atualizar);
    socket.on("lembrete:atualizado", atualizar);
    const intervalo = setInterval(() => void carregarContador(), 60_000);
    return () => {
      socket.off("lembrete:novo", atualizar);
      socket.off("lembrete:atualizado", atualizar);
      clearInterval(intervalo);
    };
  }, [carregarContador, carregarGrupos, aberto]);

  // Listas do painel (uma vez, ao precisar abrir um cliente).
  function garantirAux() {
    if (auxCarregada.current) return;
    auxCarregada.current = true;
    fetch("/api/etapas")
      .then((r) => (r.ok ? r.json() : { etapas: [] }))
      .then((d) => setEtapas(d.etapas ?? []))
      .catch(() => undefined);
    fetch("/api/etiquetas")
      .then((r) => (r.ok ? r.json() : { etiquetas: [] }))
      .then((d) => setEtiquetas(d.etiquetas ?? []))
      .catch(() => undefined);
    if (ehAdmin) {
      fetch("/api/agentes")
        .then((r) => (r.ok ? r.json() : { agentes: [] }))
        .then((d) => setAgentes(d.agentes ?? []))
        .catch(() => undefined);
    }
  }

  function abrir() {
    setAberto(true);
    void carregarGrupos();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      const r = await fetch(`/api/lembretes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        await Promise.all([carregarGrupos(), carregarContador()]);
      } else {
        toast.erro("Nao foi possivel atualizar o lembrete.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    }
  }

  function abrirCliente(l: LembreteItem) {
    if (!l.negocioId) {
      toast.erro("Sem negocio vinculado para abrir.");
      return;
    }
    garantirAux();
    setAberto(false);
    setPainelId(l.negocioId);
  }

  const total = contador.vencidos + contador.hoje;

  return (
    <>
      <button
        onClick={() => (aberto ? setAberto(false) : abrir())}
        title="Lembretes"
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
          aberto
            ? "border-tiffany bg-tiffany/10 text-tiffany"
            : "border-black/10 text-medio hover:bg-black/5"
        }`}
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span
            className={`absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white ${
              contador.vencidos > 0 ? "bg-red-500" : "bg-tiffany"
            }`}
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {aberto && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="fade-in absolute inset-0 bg-black/30" onClick={() => setAberto(false)} />
          <aside className="drawer-in relative flex h-full w-full max-w-md flex-col bg-fundo shadow-xl">
            <header className="flex shrink-0 items-center justify-between border-b border-black/5 bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <AlarmClock className="h-5 w-5 text-tiffany" />
                <p className="text-sm font-semibold text-escuro">Lembretes</p>
                {total > 0 && (
                  <span className="rounded-full bg-tiffany/10 px-2 py-0.5 text-xs font-semibold text-tiffany">
                    {total} a contatar
                  </span>
                )}
              </div>
              <button
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="scroll-fino flex-1 space-y-5 overflow-y-auto p-4">
              {carregando && !grupos ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="skeleton h-16 rounded-xl" />
                  ))}
                </div>
              ) : !grupos ||
                (grupos.vencidos.length === 0 &&
                  grupos.hoje.length === 0 &&
                  grupos.proximos.length === 0) ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <Bell className="h-8 w-8 text-medio/30" />
                  <p className="text-sm font-medium text-escuro">Nenhum lembrete</p>
                  <p className="max-w-xs text-xs text-medio/60">
                    Agende um contato no painel do cliente para ser lembrado aqui.
                  </p>
                </div>
              ) : (
                <>
                  <Grupo
                    titulo="Vencidos"
                    icone={Clock4}
                    cor="text-red-600"
                    itens={grupos.vencidos}
                    snoozeId={snoozeId}
                    setSnoozeId={setSnoozeId}
                    onPatch={patch}
                    onAbrir={abrirCliente}
                  />
                  <Grupo
                    titulo="Hoje"
                    icone={CalendarClock}
                    cor="text-amber-600"
                    itens={grupos.hoje}
                    snoozeId={snoozeId}
                    setSnoozeId={setSnoozeId}
                    onPatch={patch}
                    onAbrir={abrirCliente}
                  />
                  <Grupo
                    titulo="Proximos"
                    icone={CalendarPlus}
                    cor="text-tiffany"
                    itens={grupos.proximos}
                    snoozeId={snoozeId}
                    setSnoozeId={setSnoozeId}
                    onPatch={patch}
                    onAbrir={abrirCliente}
                  />
                </>
              )}
            </div>
          </aside>
        </div>
      )}

      {painelId && (
        <PainelNegocio
          negocioId={painelId}
          papel={papel}
          agenteIdAtual={agenteId}
          agentes={agentes}
          etiquetas={etiquetas}
          etapas={etapas}
          onFechar={() => setPainelId(null)}
          onAtualizado={() => {
            void carregarContador();
          }}
        />
      )}
    </>
  );
}

function Grupo({
  titulo,
  icone: Icone,
  cor,
  itens,
  snoozeId,
  setSnoozeId,
  onPatch,
  onAbrir,
}: {
  titulo: string;
  icone: typeof Clock4;
  cor: string;
  itens: LembreteItem[];
  snoozeId: string | null;
  setSnoozeId: (id: string | null) => void;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onAbrir: (l: LembreteItem) => void;
}) {
  if (itens.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${cor}`}>
        <Icone className="h-3.5 w-3.5" /> {titulo}
        <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] text-medio/70">
          {itens.length}
        </span>
      </h3>
      <div className="space-y-2">
        {itens.map((l) => (
          <div
            key={l.id}
            className="rounded-xl border border-black/5 bg-white p-3"
          >
            <div className="flex items-start gap-3">
              <AvatarCliente
                nome={l.cliente.nomeEfetivo}
                telefone={l.cliente.telefone}
                fotoUrl={l.cliente.fotoUrl}
                tamanho={36}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-escuro">
                    {l.cliente.nomeEfetivo}
                  </p>
                  <BadgeFinalidade finalidade={l.finalidade} />
                </div>
                <p className="flex items-center gap-1 text-xs text-medio/60">
                  <CalendarClock className="h-3 w-3" /> {quando(l.dataHora)}
                </p>
                {l.nota && (
                  <p className="mt-0.5 truncate text-xs text-medio/80">{l.nota}</p>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => onPatch(l.id, { status: "feito" })}
                className="flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-green-200 hover:bg-green-100"
              >
                <Check className="h-3.5 w-3.5" /> Feito
              </button>
              <button
                onClick={() => setSnoozeId(snoozeId === l.id ? null : l.id)}
                className="flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1 text-xs font-medium text-medio hover:bg-black/10"
              >
                <AlarmClock className="h-3.5 w-3.5" /> Remarcar
              </button>
              <button
                onClick={() => onAbrir(l)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-tiffany hover:bg-tiffany/10"
              >
                Abrir <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onPatch(l.id, { status: "cancelar" })}
                className="ml-auto rounded-lg px-2 py-1 text-xs font-medium text-medio/50 hover:bg-black/5 hover:text-erro"
              >
                Cancelar
              </button>
            </div>

            {snoozeId === l.id && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-fundo p-2">
                <button
                  onClick={() => {
                    onPatch(l.id, { dataHora: maisUmaHora() });
                    setSnoozeId(null);
                  }}
                  className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium text-escuro hover:bg-black/5"
                >
                  +1 hora
                </button>
                <button
                  onClick={() => {
                    onPatch(l.id, { dataHora: amanha() });
                    setSnoozeId(null);
                  }}
                  className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium text-escuro hover:bg-black/5"
                >
                  Amanha 09h
                </button>
                <input
                  type="datetime-local"
                  onChange={(e) => {
                    if (!e.target.value) return;
                    onPatch(l.id, {
                      dataHora: new Date(e.target.value).toISOString(),
                    });
                    setSnoozeId(null);
                  }}
                  className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-tiffany"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
