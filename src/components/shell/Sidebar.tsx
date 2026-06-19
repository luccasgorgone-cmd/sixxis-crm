"use client";

// Barra lateral do app. Inbox e Kanban ativos; Metas/Admin "em breve".
// Cliente para destacar a rota atual via usePathname.
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox as InboxIcon,
  KanbanSquare,
  Target,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";

type Item = {
  rotulo: string;
  href: string;
  icone: LucideIcon;
  emBreve?: boolean;
};

const ITENS: Item[] = [
  { rotulo: "Inbox", href: "/inbox", icone: InboxIcon },
  { rotulo: "Kanban", href: "/kanban", icone: KanbanSquare },
  { rotulo: "Metas", href: "#", icone: Target, emBreve: true },
  { rotulo: "Admin", href: "#", icone: Shield, emBreve: true },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-16 flex-col items-center border-r border-black/5 bg-escuro py-4 md:w-56 md:items-stretch md:px-3">
      <div className="mb-6 flex items-center justify-center md:justify-start md:px-2">
        <Logo tom="claro" className="text-lg" />
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {ITENS.map((item) => {
          const Icone = item.icone;
          const base =
            "flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors justify-center md:justify-start";

          if (item.emBreve) {
            return (
              <div
                key={item.rotulo}
                title="Em breve"
                className={`${base} cursor-not-allowed text-white/35`}
              >
                <Icone className="h-5 w-5 shrink-0" />
                <span className="hidden md:inline">{item.rotulo}</span>
                <span className="ml-auto hidden rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-normal text-white/50 md:inline">
                  em breve
                </span>
              </div>
            );
          }

          const ativo = pathname.startsWith(item.href);
          return (
            <Link
              key={item.rotulo}
              href={item.href}
              className={`${base} ${
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
