"use client";

// Icone de CHAMADAS no topo: link para a aba /chamadas com badge de nao vistas
// (do contador escopado). Atualiza ao vivo (socket "chamada:nova"), ao navegar,
// e quando a aba marca as vistas (evento "chamadas:vistas").
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PhoneIncoming } from "lucide-react";
import { getSocket } from "@/lib/socketClient";

export function SinoChamadas() {
  const pathname = usePathname();
  const [total, setTotal] = useState(0);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/chamadas/contador");
      if (r.ok) setTotal((await r.json()).total ?? 0);
    } catch {
      // silencioso: o badge apenas nao atualiza
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar, pathname]);

  useEffect(() => {
    const socket = getSocket();
    const atualizar = () => void carregar();
    socket.on("chamada:nova", atualizar);
    window.addEventListener("chamadas:vistas", atualizar);
    return () => {
      socket.off("chamada:nova", atualizar);
      window.removeEventListener("chamadas:vistas", atualizar);
    };
  }, [carregar]);

  return (
    <Link
      href="/chamadas"
      title={total > 0 ? `Chamadas (${total} nao vistas)` : "Chamadas"}
      aria-label="Chamadas"
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-medio/70 transition-colors hover:bg-black/5 hover:text-escuro"
    >
      <PhoneIncoming className="h-5 w-5" />
      {total > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-tiffany px-1 text-[10px] font-semibold text-white ring-2 ring-white">
          {total > 99 ? "99+" : total}
        </span>
      )}
    </Link>
  );
}
