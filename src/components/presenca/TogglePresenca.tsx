"use client";

// Toggle de PRESENCA (online/offline) no header — estado novo, separado do
// Agente.ativo (conta). Clicavel para alternar. Enquanto online, monitora
// inatividade: 15 min sem atividade -> modal com 1 min de contagem -> se nao
// confirmar, vai para offline automaticamente. Ver
// docs/DESIGN_PRESENCA_ONLINE_ROTEAMENTO.md.
import { useState, useEffect, useRef, useCallback } from "react";
import { ModalInatividade } from "./ModalInatividade";

const INATIVIDADE_MS = 15 * 60 * 1000; // 15 minutos
const COUNTDOWN_S = 60; // 1 minuto

export function TogglePresenca() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [modal, setModal] = useState(false);
  const [segundos, setSegundos] = useState(COUNTDOWN_S);
  const timerInat = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerCount = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me/presenca");
        if (r.ok) setOnline(!!(await r.json()).online);
        else setOnline(false);
      } catch {
        setOnline(false);
      }
    })();
  }, []);

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
            ? "Online — recebendo leads. Clique para ficar offline."
            : "Offline — não recebe leads. Clique para ficar online."
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
