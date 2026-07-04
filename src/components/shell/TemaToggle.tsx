"use client";

// Alternador de tema (claro / escuro / sistema). A preferencia fica em
// localStorage 'tema' e e aplicada na classe .dark do <html>. O boot inicial
// (sem flash) e feito por um script no layout; aqui sincronizamos e reagimos a
// mudancas do sistema quando o modo escolhido e "sistema".
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

type Tema = "claro" | "escuro" | "sistema";

const OPCOES: { valor: Tema; rotulo: string; Icone: typeof Sun }[] = [
  { valor: "claro", rotulo: "Claro", Icone: Sun },
  { valor: "escuro", rotulo: "Escuro", Icone: Moon },
  { valor: "sistema", rotulo: "Sistema", Icone: Monitor },
];

// Converte o valor salvo (compat: aceita 'light'/'dark' do script de boot). Sem
// nada salvo (primeiro acesso), o DEFAULT e ESCURO — igual ao boot no layout.
// Fatia 2.88.
function lerTema(): Tema {
  if (typeof window === "undefined") return "escuro";
  const t = localStorage.getItem("tema");
  if (t === "dark" || t === "escuro") return "escuro";
  if (t === "light" || t === "claro") return "claro";
  if (t === "sistema" || t === "system") return "sistema";
  return "escuro";
}

function aplicar(tema: Tema): void {
  const escuro =
    tema === "escuro" ||
    (tema === "sistema" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", escuro);
}

export function TemaToggle() {
  const [tema, setTema] = useState<Tema>("escuro");
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    setTema(lerTema());
  }, []);

  // Reage a mudanca do sistema enquanto o modo for "sistema".
  useEffect(() => {
    if (tema !== "sistema") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const ouvir = () => aplicar("sistema");
    mq.addEventListener("change", ouvir);
    return () => mq.removeEventListener("change", ouvir);
  }, [tema]);

  function escolher(novo: Tema) {
    setTema(novo);
    localStorage.setItem("tema", novo);
    aplicar(novo);
    setAberto(false);
  }

  const Atual = OPCOES.find((o) => o.valor === tema)?.Icone ?? Monitor;

  return (
    <div className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        title="Tema"
        aria-label="Alternar tema"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-medio transition-colors hover:bg-black/5"
      >
        <Atual className="h-5 w-5" />
      </button>
      {aberto && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setAberto(false)}
          />
          <div className="absolute right-0 z-50 mt-1 w-40 overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-lg">
            {OPCOES.map(({ valor, rotulo, Icone }) => (
              <button
                key={valor}
                onClick={() => escolher(valor)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-black/5 ${
                  tema === valor ? "font-semibold text-tiffany" : "text-escuro"
                }`}
              >
                <Icone className="h-4 w-4" />
                {rotulo}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
