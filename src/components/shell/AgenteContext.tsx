"use client";

// Contexto leve com o colaborador logado (id/nome/papel), provido uma vez no
// layout autenticado. Usado por componentes-cliente que precisam do nome do
// atendente sem prop drilling — ex.: o Compositor resolve {vendedor} com ele.
import { createContext, useContext } from "react";

export type AgenteAtual = {
  id: string;
  nome: string | null;
  papel: string;
  acessoVenda: boolean;
  acessoPosVenda: boolean;
};

const AgenteCtx = createContext<AgenteAtual | null>(null);

export function AgenteProvider({
  valor,
  children,
}: {
  valor: AgenteAtual;
  children: React.ReactNode;
}) {
  return <AgenteCtx.Provider value={valor}>{children}</AgenteCtx.Provider>;
}

export function useAgente(): AgenteAtual | null {
  return useContext(AgenteCtx);
}
