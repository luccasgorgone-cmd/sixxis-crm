"use client";

// Barra lateral do app. Realca a rota atual (maior prefixo correspondente, para
// nao acender dois itens ao mesmo tempo). Admin so aparece para ADMIN.
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox as InboxIcon,
  KanbanSquare,
  LayoutDashboard,
  Target,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";

type Item = {
  rotulo: string;
  href: string;
  icone: LucideIcon;
};

export function Sidebar({ papel }: { papel: string }) {
  const pathname = usePathname();
  const ehAdmin = papel === "ADMIN";

  const itens: Item[] = [
    {
      rotulo: "Painel",
      href: ehAdmin ? "/admin/dashboard" : "/dashboard",
      icone: LayoutDashboard,
    },
    { rotulo: "Inbox", href: "/inbox", icone: InboxIcon },
    { rotulo: "Kanban", href: "/kanban", icone: KanbanSquare },
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
        <Logo tom="claro" className="text-lg" />
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {itens.map((item) => {
          const Icone = item.icone;
          const ativo = item.href === ativoHref;
          return (
            <Link
              key={item.rotulo}
              href={item.href}
              aria-current={ativo ? "page" : undefined}
              title={item.rotulo}
              className={`flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors justify-center md:justify-start ${
                ativo
                  ? "bg-tiffany text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icone className="h-5 w-5 shrink-0" />
              <span className="hidden md:inline">{item.rotulo}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
