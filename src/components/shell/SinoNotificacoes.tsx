"use client";

// Sino de NOTIFICACOES do topo (centro de notificacoes). Badge = nao lidas,
// ao vivo via socket + revalidacao periodica. Dropdown lista as notificacoes
// (nao lidas em destaque), com marcar como lida, marcar todas e navegacao ao
// item (cliente/agenda). Fonte: /api/notificacoes.
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  CheckCheck,
  Cake,
  AlarmClock,
  CalendarClock,
} from "lucide-react";
import { getSocket } from "@/lib/socketClient";
import { tempoDesde } from "@/lib/format";

type Notificacao = {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  link: string | null;
  lida: boolean;
  leadId: string | null;
  criadoEm: string;
};

function iconeTipo(tipo: string) {
  if (tipo === "ANIVERSARIO") return Cake;
  if (tipo === "LEMBRETE") return AlarmClock;
  if (tipo === "TAREFA") return CalendarClock;
  return Bell;
}

export function SinoNotificacoes() {
  const router = useRouter();
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<Notificacao[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const carregarContador = useCallback(async () => {
    try {
      const r = await fetch("/api/notificacoes?contador=1");
      if (r.ok) setNaoLidas((await r.json()).naoLidas ?? 0);
    } catch {
      // silencioso
    }
  }, []);

  const carregarLista = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/notificacoes");
      if (r.ok) {
        const d = await r.json();
        setItens(d.notificacoes ?? []);
        setNaoLidas(d.naoLidas ?? 0);
      }
    } catch {
      // silencioso
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarContador();
    const socket = getSocket();
    const atualizar = () => {
      void carregarContador();
      if (aberto) void carregarLista();
    };
    socket.on("notificacao:nova", atualizar);
    const intervalo = setInterval(() => void carregarContador(), 60_000);
    return () => {
      socket.off("notificacao:nova", atualizar);
      clearInterval(intervalo);
    };
  }, [carregarContador, carregarLista, aberto]);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [aberto]);

  function abrir() {
    setAberto(true);
    void carregarLista();
  }

  async function marcarLida(id: string) {
    setItens((prev) =>
      prev ? prev.map((n) => (n.id === id ? { ...n, lida: true } : n)) : prev,
    );
    setNaoLidas((c) => Math.max(0, c - 1));
    await fetch("/api/notificacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  async function marcarTodas() {
    setItens((prev) => (prev ? prev.map((n) => ({ ...n, lida: true })) : prev));
    setNaoLidas(0);
    await fetch("/api/notificacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todas: true }),
    });
  }

  function aoClicar(n: Notificacao) {
    if (!n.lida) void marcarLida(n.id);
    if (n.link) {
      setAberto(false);
      router.push(n.link);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => (aberto ? setAberto(false) : abrir())}
        title="Notificacoes"
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
          aberto
            ? "border-tiffany bg-tiffany/10 text-tiffany"
            : "border-black/10 text-medio hover:bg-black/5"
        }`}
      >
        <Bell className="h-5 w-5" />
        {naoLidas > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl sm:w-96">
          <header className="flex items-center justify-between border-b border-black/5 px-4 py-2.5">
            <p className="text-sm font-semibold text-escuro">Notificacoes</p>
            {naoLidas > 0 && (
              <button
                onClick={() => void marcarTodas()}
                className="flex items-center gap-1 text-xs font-medium text-tiffany hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
              </button>
            )}
          </header>

          <div className="scroll-fino max-h-[70vh] overflow-y-auto">
            {carregando && !itens ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton h-14 rounded-lg" />
                ))}
              </div>
            ) : !itens || itens.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                <Bell className="h-7 w-7 text-medio/30" />
                <p className="text-sm font-medium text-escuro">
                  Nenhuma notificacao
                </p>
                <p className="max-w-[16rem] text-xs text-medio/60">
                  Aniversarios e alertas dos seus compromissos aparecem aqui.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-black/5">
                {itens.map((n) => {
                  const Icone = iconeTipo(n.tipo);
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => aoClicar(n)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.03] ${
                          n.lida ? "" : "bg-tiffany/[0.05]"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            n.lida
                              ? "bg-black/5 text-medio/60"
                              : "bg-tiffany/15 text-tiffany"
                          }`}
                        >
                          <Icone className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-escuro">
                              {n.titulo}
                            </span>
                            {!n.lida && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-tiffany" />
                            )}
                          </span>
                          {n.descricao && (
                            <span className="mt-0.5 block truncate text-xs text-medio/70">
                              {n.descricao}
                            </span>
                          )}
                          <span className="mt-0.5 block text-[11px] text-medio/40">
                            {tempoDesde(n.criadoEm)}
                          </span>
                        </span>
                        {!n.lida && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              void marcarLida(n.id);
                            }}
                            title="Marcar como lida"
                            className="mt-0.5 shrink-0 rounded p-1 text-medio/40 hover:bg-black/5 hover:text-tiffany"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
