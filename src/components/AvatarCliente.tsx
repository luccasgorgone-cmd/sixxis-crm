"use client";

// Avatar do cliente: foto do WhatsApp (fotoUrl) com fallback elegante para
// iniciais coloridas (cor estavel derivada do nome/telefone). Usado no inbox,
// kanban, painel e supervisao. Se a foto falhar/expirar, cai pro fallback.
import { useState, useEffect } from "react";
import { iniciais } from "@/lib/format";

// Paleta de fundos para o fallback (texto branco). Tons saturados e legiveis.
const PALETA = [
  "#3cbfb3", // tiffany
  "#7c3aed", // roxo pos-venda
  "#0ea5e9",
  "#f59e0b",
  "#ef4444",
  "#10b981",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

function corDeChave(chave: string): string {
  let h = 0;
  for (let i = 0; i < chave.length; i++) {
    h = (h * 31 + chave.charCodeAt(i)) >>> 0;
  }
  return PALETA[h % PALETA.length];
}

export function AvatarCliente({
  nome,
  telefone,
  fotoUrl,
  tamanho = 44,
  className = "",
}: {
  nome: string | null;
  telefone: string;
  fotoUrl?: string | null;
  tamanho?: number;
  className?: string;
}) {
  const [erro, setErro] = useState(false);
  // Reseta o estado de erro quando a URL muda (refresh da foto).
  useEffect(() => setErro(false), [fotoUrl]);

  const mostrarFoto = !!fotoUrl && !erro;
  const ini = iniciais(nome, telefone);
  const cor = corDeChave(nome?.trim() || telefone || "?");

  return (
    <div
      style={{ width: tamanho, height: tamanho }}
      className={`relative shrink-0 overflow-hidden rounded-full ${className}`}
    >
      {mostrarFoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fotoUrl as string}
          alt={ini}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setErro(true)}
        />
      ) : (
        <div
          style={{ backgroundColor: cor, fontSize: tamanho * 0.4 }}
          className="flex h-full w-full items-center justify-center font-semibold text-white"
        >
          {ini}
        </div>
      )}
    </div>
  );
}
