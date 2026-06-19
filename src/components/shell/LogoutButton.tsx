"use client";

// Botao de sair: encerra a sessao do NextAuth e volta para /login.
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      title="Sair"
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-medio transition-colors hover:bg-black/5 hover:text-escuro"
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden sm:inline">Sair</span>
    </button>
  );
}
