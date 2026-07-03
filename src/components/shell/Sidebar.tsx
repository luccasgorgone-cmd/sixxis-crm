"use client";

// Barra lateral do app. Realca a rota atual (maior prefixo correspondente, para
// nao acender dois itens ao mesmo tempo). Admin so aparece para ADMIN. O Inbox
// mostra um badge com o total de conversas nao lidas, atualizado ao vivo.
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox as InboxIcon,
  MessagesSquare,
  Sparkles,
  KanbanSquare,
  LayoutDashboard,
  Target,
  Briefcase,
  Contact,
  CalendarDays,
  CloudSun,
  MapPin,
  TrendingUp,
  Shield,
  Wrench,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import type { Marca } from "@/lib/marca";
import { getSocket } from "@/lib/socketClient";

type Item = {
  rotulo: string;
  href: string;
  icone: LucideIcon;
};

export function Sidebar({ papel, marca }: { papel: string; marca?: Marca }) {
  const pathname = usePathname();
  const ehAdmin = papel === "ADMIN";
  const [naoLidas, setNaoLidas] = useState(0);

  const carregarNaoLidas = useCallback(async () => {
    try {
      const r = await fetch("/api/conversas/nao-lidas");
      if (r.ok) setNaoLidas((await r.json()).total ?? 0);
    } catch {
      // silencioso: o badge apenas nao atualiza
    }
  }, []);

  useEffect(() => {
    void carregarNaoLidas();
    const socket = getSocket();
    const atualizar = () => void carregarNaoLidas();
    socket.on("mensagem:nova", atualizar);
    socket.on("conversa:lida", atualizar);
    socket.on("conversa:atualizada", atualizar);
    return () => {
      socket.off("mensagem:nova", atualizar);
      socket.off("conversa:lida", atualizar);
      socket.off("conversa:atualizada", atualizar);
    };
  }, [carregarNaoLidas]);

  // Reconfere ao navegar (ex.: abriu/leu uma conversa).
  useEffect(() => {
    void carregarNaoLidas();
  }, [pathname, carregarNaoLidas]);

  const itens: Item[] = [
    {
      rotulo: "Painel",
      href: ehAdmin ? "/admin/dashboard" : "/dashboard",
      icone: LayoutDashboard,
    },
    { rotulo: "Oracle", href: "/oracle", icone: Sparkles },
    { rotulo: "Inbox", href: "/inbox", icone: InboxIcon },
    { rotulo: "Sixxis", href: "/interno", icone: MessagesSquare },
    { rotulo: "Kanban", href: "/kanban", icone: KanbanSquare },
    { rotulo: "Clientes", href: "/clientes", icone: Contact },
    { rotulo: "Agenda", href: "/agenda", icone: CalendarDays },
    { rotulo: "Minha carteira", href: "/carteira", icone: Briefcase },
    { rotulo: "Clima", href: "/inteligencia", icone: CloudSun },
    { rotulo: "Google Trends", href: "/google-trends", icone: TrendingUp },
    { rotulo: "Mapa", href: "/mapa", icone: MapPin },
    // Parceiros (tecnicos): ferramenta de pos-venda — visivel a ADMIN e POS_VENDA.
    ...(ehAdmin || papel === "POS_VENDA"
      ? [{ rotulo: "Parceiros", href: "/parceiros", icone: Wrench }]
      : []),
    { rotulo: "Campanhas", href: "/campanhas", icone: Megaphone },
    { rotulo: "Metas", href: ehAdmin ? "/admin/metas" : "/metas", icone: Target },
    ...(ehAdmin
      ? [{ rotulo: "Admin", href: "/admin", icone: Shield }]
      : []),
  ];

  // Item ativo = o de maior href que e prefixo da rota atual (evita 2 acesos).
  const ativoHref = itens
    .filter(
      (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <aside className="flex h-full w-16 flex-col items-center border-r border-black/5 bg-escuro py-4 md:w-56 md:items-stretch md:px-3">
      <div className="mb-6 flex items-center justify-center md:justify-start md:px-2">
        <Logo
          tom="claro"
          className="text-lg"
          temLogo={marca?.temLogo}
          logoEm={marca?.logoEm}
          nomeEmpresa={marca?.nomeEmpresa}
          alturaImg="h-8"
        />
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {itens.map((item) => {
          const Icone = item.icone;
          const ativo = item.href === ativoHref;
          const mostrarBadge = item.rotulo === "Inbox" && naoLidas > 0;
          return (
            <Link
              key={item.rotulo}
              href={item.href}
              aria-current={ativo ? "page" : undefined}
              title={
                mostrarBadge
                  ? `${item.rotulo} (${naoLidas} nao lidas)`
                  : item.rotulo
              }
              className={`relative flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors justify-center md:justify-start ${
                ativo
                  ? "bg-tiffany text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="relative shrink-0">
                <Icone className="h-5 w-5" />
                {mostrarBadge && (
                  <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-tiffany px-1 text-[10px] font-semibold text-white ring-2 ring-escuro md:hidden">
                    {naoLidas > 99 ? "99+" : naoLidas}
                  </span>
                )}
              </span>
              <span className="hidden md:inline">{item.rotulo}</span>
              {mostrarBadge && (
                <span
                  className={`ml-auto hidden h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold md:inline-flex ${
                    ativo ? "bg-white text-tiffany" : "bg-tiffany text-white"
                  }`}
                >
                  {naoLidas > 99 ? "99+" : naoLidas}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
