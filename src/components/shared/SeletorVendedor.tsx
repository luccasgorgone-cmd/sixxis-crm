"use client";

// Seletor compacto de vendedor (SO ADMIN) para as telas Mapa/Clima. Permite
// alternar entre Todos, um vendedor especifico ou Sem dono (orfaos). A escolha
// vira ?agenteId=X ou ?semDono=1 (via paramsEscopo). Estilo Sixxis, dark mode.
import { Users } from "lucide-react";
import { SEM_DONO } from "@/lib/escopo";

export type OpcaoVendedor = { id: string; nome: string };

export function SeletorVendedor({
  valor,
  vendedores,
  onChange,
}: {
  valor: string;
  vendedores: OpcaoVendedor[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="flex items-center gap-1 font-medium text-medio/70">
        <Users className="h-3.5 w-3.5" />
        Vendedor:
      </span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-tiffany"
      >
        <option value="">Todos</option>
        {vendedores.map((v) => (
          <option key={v.id} value={v.id}>
            {v.nome}
          </option>
        ))}
        <option value={SEM_DONO}>Sem dono</option>
      </select>
    </label>
  );
}
