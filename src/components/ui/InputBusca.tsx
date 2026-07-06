"use client";

// Campo de busca com lupa (Fatia 3.09). Componente unico para todo o sistema: a
// lupa fica sobreposta a esquerda e o input usa `!pl-9` (important) para VENCER o
// padding-left do shorthand `.campo` (padding: .5rem .75rem) — sem isso, o
// placeholder comecava EM CIMA do icone. pointer-events-none deixa o clique passar.
import { Search } from "lucide-react";

export function InputBusca({
  valor,
  onChange,
  placeholder,
  className,
  autoFocus,
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-medio/40" />
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="campo w-full !pl-9"
      />
    </div>
  );
}
