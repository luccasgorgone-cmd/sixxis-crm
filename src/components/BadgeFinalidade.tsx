// Cores e badge de finalidade, consistentes em todo o app.
// VENDA = tiffany (#3cbfb3) ; POS_VENDA = roxo (#7c3aed / violet-600).

export type Finalidade = "VENDA" | "POS_VENDA";

export const CORES_FINALIDADE: Record<
  Finalidade,
  {
    rotulo: string;
    hex: string;
    badge: string; // fundo + texto
    ponto: string; // bolinha
    texto: string;
    borda: string;
    barra: string; // fundo solido p/ risca/cabecalho
    suave: string; // fundo bem leve
  }
> = {
  VENDA: {
    rotulo: "Venda",
    hex: "#3cbfb3",
    badge: "bg-tiffany/10 text-tiffany",
    ponto: "bg-tiffany",
    texto: "text-tiffany",
    borda: "border-tiffany",
    barra: "bg-tiffany",
    suave: "bg-tiffany/5",
  },
  POS_VENDA: {
    rotulo: "Pos-venda",
    hex: "#7c3aed",
    badge: "bg-violet-100 text-violet-700",
    ponto: "bg-violet-600",
    texto: "text-violet-700",
    borda: "border-violet-500",
    barra: "bg-violet-600",
    suave: "bg-violet-50",
  },
};

export function corFinalidade(f: string | null | undefined) {
  return f === "POS_VENDA" ? CORES_FINALIDADE.POS_VENDA : CORES_FINALIDADE.VENDA;
}

// Badge compacto com a cor da finalidade.
export function BadgeFinalidade({
  finalidade,
  className = "",
}: {
  finalidade: string | null | undefined;
  className?: string;
}) {
  if (!finalidade) return null;
  const c = corFinalidade(finalidade);
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.badge} ${className}`}
    >
      {c.rotulo}
    </span>
  );
}
