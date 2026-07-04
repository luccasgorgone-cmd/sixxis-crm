"use client";

// Avatar do cliente: foto do WhatsApp (fotoUrl) com fallback elegante para
// iniciais coloridas (cor estavel derivada do nome/telefone). Usado no inbox,
// kanban, painel e supervisao. Se a foto falhar/expirar, cai pro fallback.
// Com `expandivel`, clicar na FOTO abre um lightbox (estilo WhatsApp). Fatia 2.85.
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
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
  expandivel = false,
}: {
  nome: string | null;
  telefone: string;
  fotoUrl?: string | null;
  tamanho?: number;
  className?: string;
  // Clicar na FOTO abre um lightbox ampliado (so quando ha foto real).
  expandivel?: boolean;
}) {
  const [erro, setErro] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  // Reseta o estado de erro quando a URL muda (refresh da foto).
  useEffect(() => setErro(false), [fotoUrl]);

  const mostrarFoto = !!fotoUrl && !erro;
  const ini = iniciais(nome, telefone);
  const cor = corDeChave(nome?.trim() || telefone || "?");
  const podeAmpliar = expandivel && mostrarFoto;

  return (
    <>
      <div
        style={{ width: tamanho, height: tamanho }}
        className={`relative shrink-0 overflow-hidden rounded-full ${className} ${
          podeAmpliar ? "cursor-zoom-in" : ""
        }`}
        onClick={podeAmpliar ? () => setLightbox(true) : undefined}
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

      {lightbox && podeAmpliar && (
        <LightboxFoto
          src={fotoUrl as string}
          alt={nome?.trim() || telefone}
          onFechar={() => setLightbox(false)}
        />
      )}
    </>
  );
}

// Lightbox (estilo WhatsApp): imagem grande centralizada, fundo escurecido, fecha
// no X, ao clicar fora e com Esc. Portal para escapar de overflow/containers.
function LightboxFoto({
  src,
  alt,
  onFechar,
}: {
  src: string;
  alt: string;
  onFechar: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fade-in fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-6"
      onClick={onFechar}
    >
      <button
        onClick={onFechar}
        aria-label="Fechar"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
      />
    </div>,
    document.body,
  );
}
