"use client";

// Badge de alertas de SLA (negocios parados) no topo + aviso SONORO ao surgir
// um novo alerta para o agente conectado. Respeita a politica de autoplay do
// navegador: o som so toca apos a 1a interacao do usuario na pagina.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing } from "lucide-react";
import { getSocket } from "@/lib/socketClient";
import { arquivoSom } from "@/lib/sons";

export function SinoAlertasSla({
  agenteId,
  papel,
}: {
  agenteId: string;
  papel: string;
}) {
  const router = useRouter();
  const ehAdmin = papel === "ADMIN";
  const [total, setTotal] = useState(0);
  const interagiu = useRef(false);

  async function atualizar() {
    try {
      const r = await fetch("/api/alertas/contador");
      if (r.ok) setTotal((await r.json()).total ?? 0);
    } catch {
      /* silencioso */
    }
  }

  // Libera o audio apos a 1a interacao (autoplay policy).
  useEffect(() => {
    const marcar = () => {
      interagiu.current = true;
    };
    window.addEventListener("pointerdown", marcar, { once: true });
    window.addEventListener("keydown", marcar, { once: true });
    return () => {
      window.removeEventListener("pointerdown", marcar);
      window.removeEventListener("keydown", marcar);
    };
  }, []);

  useEffect(() => {
    void atualizar();
    const socket = getSocket();
    const aoNovo = (p: { agenteId?: string | null; som?: string | null }) => {
      void atualizar();
      // Toca o som se o alerta e meu (ou sou admin) e ja houve interacao.
      const meu = ehAdmin || p?.agenteId === agenteId;
      if (meu && interagiu.current) {
        try {
          const audio = new Audio(arquivoSom(p?.som));
          audio.volume = 0.6;
          void audio.play().catch(() => undefined);
        } catch {
          /* ignora */
        }
      }
    };
    socket.on("alerta:novo", aoNovo);
    socket.on("alerta:atualizado", atualizar);
    return () => {
      socket.off("alerta:novo", aoNovo);
      socket.off("alerta:atualizado", atualizar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenteId, ehAdmin]);

  if (total === 0) return null;

  return (
    <button
      onClick={() => router.push("/kanban")}
      title={`${total} alerta(s) de tempo (SLA)`}
      aria-label="Alertas de SLA"
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50"
    >
      <BellRing className="h-5 w-5" />
      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
        {total > 99 ? "99+" : total}
      </span>
    </button>
  );
}
