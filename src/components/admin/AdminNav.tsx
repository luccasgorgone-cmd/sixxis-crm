"use client";

// Sub-navegacao do painel administrativo. Realca a secao atual (rota exata ou
// subrota), para nao acender dois itens ao mesmo tempo.
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
  BarChart3,
  Target,
  type LucideIcon,
} from "lucide-react";

type Secao = {
  rotulo: string;
  href: string;
  icone: LucideIcon;
};

const SECOES: Secao[] = [
  { rotulo: "Painel", href: "/admin/dashboard", icone: LayoutDashboard },
  { rotulo: "Colaboradores", href: "/admin/colaboradores", icone: Eye },
  { rotulo: "Equipe", href: "/admin/vendedores", icone: Users },
  { rotulo: "Metas", href: "/admin/metas", icone: Target },
  { rotulo: "Numeros WhatsApp", href: "/admin/numeros", icone: Smartphone },
  { rotulo: "Etapas", href: "/admin/etapas", icone: Columns3 },
  { rotulo: "Etiquetas", href: "/admin/etiquetas", icone: Tags },
  { rotulo: "Observacoes", href: "/admin/observacoes", icone: StickyNote },
  { rotulo: "Roteamento", href: "/admin/roteamento", icone: Route },
  { rotulo: "Respostas rapidas", href: "/admin/respostas", icone: Zap },
  { rotulo: "Geral e horario", href: "/admin/geral", icone: Clock },
  { rotulo: "Evolution", href: "/admin/evolution", icone: MessageSquareDot },
  { rotulo: "Agente IA", href: "/admin/ia", icone: Bot },
  { rotulo: "Relatorios", href: "/admin/relatorios", icone: BarChart3 },
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
          const ativo =
            pathname === s.href || pathname.startsWith(`${s.href}/`);
          return (
            <Link
              key={s.rotulo}
              href={s.href}
              aria-current={ativo ? "page" : undefined}
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
