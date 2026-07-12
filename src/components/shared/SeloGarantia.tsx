"use client";

// Selo de GARANTIA derivada (Fatia F): usa a lib pura para mostrar, por pedido/
// orcamento, "Garantia ate dd/mm/aaaa" (verde, vigente), "Garantia expirada"
// (cinza) ou "Garantia: sem NF vinculada". Visivel em venda e pos-venda. Padrao
// da casa: Lucide monocromatico, sem emoji.
import { ShieldCheck } from "lucide-react";
import { calcularGarantiaPedido } from "@/lib/garantia";

export function SeloGarantia({
  finalidade,
  dataNF,
  itens,
}: {
  finalidade: string;
  // Data da NF vinculada (ISO) ou null quando nao ha NF.
  dataNF: string | null;
  itens: { descricao: string; garantia: boolean }[];
}) {
  const resumo = calcularGarantiaPedido({
    finalidade,
    dataNF: dataNF ? new Date(dataNF) : null,
    itens,
  });

  if (!resumo.temNF) {
    return (
      <p className="flex items-center gap-1 text-[11px] text-medio/50">
        <ShieldCheck className="h-3 w-3" /> Garantia: sem NF vinculada
      </p>
    );
  }

  const validade = resumo.validadeFinal;
  if (resumo.algumVigente && validade) {
    return (
      <p className="flex items-center gap-1 text-[11px] font-medium text-green-600">
        <ShieldCheck className="h-3 w-3" /> Garantia até{" "}
        {validade.toLocaleDateString("pt-BR")}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1 text-[11px] text-medio/50">
      <ShieldCheck className="h-3 w-3" /> Garantia expirada
      {validade ? ` em ${validade.toLocaleDateString("pt-BR")}` : ""}
    </p>
  );
}
