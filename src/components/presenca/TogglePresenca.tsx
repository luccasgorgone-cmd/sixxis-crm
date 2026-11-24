"use client";

// Toggle de PRESENCA (online/offline) no header — estado novo, separado do
// Agente.ativo (conta). Clicavel para alternar. Enquanto online, monitora
// inatividade: 15 min sem atividade -> modal com 1 min de contagem -> se nao
// confirmar, vai para offline automaticamente. Ver
// docs/DESIGN_PRESENCA_ONLINE_ROTEAMENTO.md.
import { useState, useEffect, useRef, useCallback } from "react";
import { ModalInatividade } from "./ModalInatividade";

const INATIVIDADE_MS = 14 * 60 * 1000; // 14 minutos sem atividade -> pergunta
const COUNTDOWN_S = 60; // 1 minuto pra responder; sem resposta -> offline
const HEARTBEAT_MS = 60 * 1000; // 60s — renova a presenca viva no servidor

export function TogglePresenca() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [modal, setModal] = useState(false);
  const [segundos, setSegundos] = useState(COUNTDOWN_S);
  const timerInat = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerCount = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerBatida = useRef<ReturnType<typeof setInterval> | null>(null);

  const definir = useCallback(async (v: boolean) => {
    try {
      const r = await fetch("/api/me/presenca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online: v }),
      });
      if (r.ok) setOnline(!!(await r.json()).online);
    } catch {
      /* rede: mantem estado atual */
    }
  }, []);

  // Heartbeat: renova a presenca viva (PUT) e mantem no rodizio. O servidor
  // derruba quem para de bater (fechou a aba) via varredura.
  const baterPresenca = useCallback(async () => {
    try {
      const r = await fetch("/api/me/presenca", { method: "PUT" });
      if (r.ok) setOnline(!!(await r.json()).online);
    } catch {
      /* rede: ignora esta batida */
    }
  }, []);

  // Ao abrir o app = ficar online (bate uma vez). Depois o efeito de heartbeat
  // mantem vivo. Assim quem esta com o CRM aberto esta no rodizio sem precisar
  // achar um toggle — e a inatividade/fechar-aba e que tira.
  useEffect(() => {
    void baterPresenca();
  }, [baterPresenca]);

  // Enquanto online, bate a cada HEARTBEAT_MS (roda tambem em aba de fundo,
  // throttled; o limite do servidor tem folga pra isso).
  useEffect(() => {
    if (!online) return;
    timerBatida.current = setInterval(() => void baterPresenca(), HEARTBEAT_MS);
    return () => {
      if (timerBatida.current) clearInterval(timerBatida.current);
    };
  }, [online, baterPresenca]);

  const continuarOnline = useCallback(() => {
    if (timerCount.current) clearInterval(timerCount.current);
    setModal(false);
  }, []);

  const irOffline = useCallback(() => {
    if (timerCount.current) clearInterval(timerCount.current);
    setModal(false);
    void definir(false);
  }, [definir]);

  // Monitor de inatividade: so quando online e sem modal aberto.
  useEffect(() => {
    if (!online) return;
    function reiniciar() {
      if (modal) return;
      if (timerInat.current) clearTimeout(timerInat.current);
      timerInat.current = setTimeout(() => {
        setSegundos(COUNTDOWN_S);
        setModal(true);
      }, INATIVIDADE_MS);
    }
    const eventos = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    eventos.forEach((e) => window.addEventListener(e, reiniciar, { passive: true }));
    reiniciar();
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, reiniciar));
      if (timerInat.current) clearTimeout(timerInat.current);
    };
  }, [online, modal]);

  // Contagem regressiva do modal.
  useEffect(() => {
    if (!modal) return;
    timerCount.current = setInterval(() => {
      setSegundos((s) => {
        if (s <= 1) {
          irOffline();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerCount.current) clearInterval(timerCount.current);
    };
  }, [modal, irOffline]);

  if (online === null) return null;

  return (
    <>
      <button
        onClick={() => void definir(!online)}
        title={
          online
            ? "Online — recebendo novos leads. Clique para ficar offline (sai do rodízio e pausa a contagem de presença)."
            : "Offline — não recebe novos leads. Clique para ficar online e voltar ao rodízio."
        }
        aria-pressed={online}
        className="flex items-center gap-1.5 rounded-lg border border-black/5 px-2 py-1 text-xs font-medium transition-colors hover:bg-black/[0.03]"
      >
        <span
          className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-medio/40"}`}
          aria-hidden
        />
        <span className={online ? "text-escuro" : "text-medio"}>
          {online ? "Online" : "Offline"}
        </span>
      </button>
      <ModalInatividade
        aberto={modal}
        segundos={segundos}
        onContinuar={continuarOnline}
        onOffline={irOffline}
      />
    </>
  );
}
