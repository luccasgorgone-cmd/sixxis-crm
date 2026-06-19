"use client";

// Barra superior: titulo da area (pela rota) + identificacao e logout.
import { usePathname } from "next/navigation";
import { LogoutButton } from "./LogoutButton";

const ROTULO_PAPEL: Record<string, string> = {
  ADMIN: "Administrador",
  VENDEDOR: "Vendedor",
  POS_VENDA: "Pos-venda",
};

const TITULO_ROTA: { prefixo: string; titulo: string }[] = [
  { prefixo: "/inbox", titulo: "Inbox" },
  { prefixo: "/kanban", titulo: "Kanban" },
];

export function Topbar({
  nome,
  papel,
}: {
  nome: string | null | undefined;
  papel: string;
}) {
  const pathname = usePathname();
  const titulo =
    TITULO_ROTA.find((r) => pathname.startsWith(r.prefixo))?.titulo ?? "Sixxis";
  const inicial = (nome?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-black/5 bg-white px-4">
      <h1 className="text-sm font-semibold text-escuro">{titulo}</h1>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-tiffany/15 text-sm font-semibold text-tiffany">
            {inicial}
          </div>
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-medium text-escuro">{nome ?? "Usuario"}</p>
            <p className="text-xs text-medio/60">
              {ROTULO_PAPEL[papel] ?? papel}
            </p>
          </div>
        </div>
        <LogoutButton />
      </div>
    </header>
  );
}
