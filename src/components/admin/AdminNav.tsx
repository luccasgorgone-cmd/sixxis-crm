"use client";

// Sub-navegacao da AREA DE CONFIGURACAO (segundo nivel, sob o "Admin"). So
// aparece nas paginas de configuracao — escondida no Painel e nas Metas, que sao
// itens de topo. Realca a secao atual (rota exata ou subrota).
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";

type Secao = {
  rotulo: string;
  href: string;
  icone: LucideIcon;
};

// Apenas itens de CONFIGURACAO (Painel e Metas vivem no menu principal).
const SECOES: Secao[] = [
  { rotulo: "Colaboradores", href: "/admin/colaboradores", icone: Eye },
  { rotulo: "Equipe", href: "/admin/vendedores", icone: Users },
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

// Rotas de topo (nao sao configuracao): nelas a sub-nav nao aparece.
const SEM_SUBNAV = ["/admin/dashboard", "/admin/metas"];

export function AdminNav() {
  const pathname = usePathname();
  if (SEM_SUBNAV.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <nav className="scroll-fino w-56 shrink-0 overflow-y-auto border-r border-black/5 bg-white p-3">
      <Link
        href="/inbox"
        className="mb-3 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-medio transition-colors hover:bg-black/5 hover:text-escuro"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" />
        Voltar ao app
      </Link>
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
