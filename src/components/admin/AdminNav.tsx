"use client";

// Sub-navegacao do painel administrativo. Secoes implementadas viram links;
// as demais ficam "em breve" (desabilitadas).
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Eye,
  Users,
  Columns3,
  Tags,
  StickyNote,
  Route,
  Smartphone,
  Zap,
  Clock,
  MessageSquareDot,
  Bot,
  Settings,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

type Secao = {
  rotulo: string;
  href: string;
  icone: LucideIcon;
  emBreve?: boolean;
};

const SECOES: Secao[] = [
  { rotulo: "Painel", href: "/admin/dashboard", icone: LayoutDashboard },
  { rotulo: "Colaboradores", href: "/admin/colaboradores", icone: Eye },
  { rotulo: "Equipe", href: "/admin/vendedores", icone: Users },
  { rotulo: "Numeros WhatsApp", href: "/admin/numeros", icone: Smartphone },
  { rotulo: "Etapas", href: "/admin/etapas", icone: Columns3 },
  { rotulo: "Etiquetas", href: "/admin/etiquetas", icone: Tags },
  { rotulo: "Observacoes", href: "/admin/observacoes", icone: StickyNote },
  { rotulo: "Roteamento", href: "/admin/roteamento", icone: Route },
  { rotulo: "Respostas rapidas", href: "#", icone: Zap, emBreve: true },
  { rotulo: "Horario", href: "#", icone: Clock, emBreve: true },
  { rotulo: "Evolution", href: "#", icone: MessageSquareDot, emBreve: true },
  { rotulo: "Agente IA", href: "#", icone: Bot, emBreve: true },
  { rotulo: "Geral", href: "#", icone: Settings, emBreve: true },
  { rotulo: "Relatorios", href: "#", icone: BarChart3, emBreve: true },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="w-56 shrink-0 overflow-y-auto border-r border-black/5 bg-white p-3 scroll-fino">
      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
        Configuracoes
      </p>
      <div className="flex flex-col gap-0.5">
        {SECOES.map((s) => {
          const Icone = s.icone;
          if (s.emBreve) {
            return (
              <div
                key={s.rotulo}
                title="Em breve"
                className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-medio/35"
              >
                <Icone className="h-4 w-4 shrink-0" />
                <span className="truncate">{s.rotulo}</span>
                <span className="ml-auto rounded bg-black/5 px-1.5 py-0.5 text-[10px]">
                  breve
                </span>
              </div>
            );
          }
          const ativo = pathname.startsWith(s.href);
          return (
            <Link
              key={s.rotulo}
              href={s.href}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                ativo
                  ? "bg-tiffany/10 text-tiffany"
                  : "text-medio hover:bg-black/5 hover:text-escuro"
              }`}
            >
              <Icone className="h-4 w-4 shrink-0" />
              {s.rotulo}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
