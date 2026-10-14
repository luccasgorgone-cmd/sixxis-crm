"use client";

// Card de CONFIRMAÇÃO de uma ação proposta pela IA (SPEC §6, human-in-the-loop).
// A IA nunca executa: ela só propõe, e é AQUI que o gestor confirma ou descarta.
// Confirmar/descartar chama /api/admin/supervisor/acao/confirmar, que revalida no
// servidor antes de qualquer escrita. O card é efêmero: some ao resolver.
import { useState } from "react";
import { Check, X, Loader2, Wand2 } from "lucide-react";

export type AcaoProposta = {
  id: string;
  ferramenta: string;
  preview: string;
};

// Nome técnico da ferramenta → rótulo humano para o gestor.
const ROTULO_ACAO: Record<string, string> = {
  mover_etapa: "Mover de etapa",
  reatribuir_vendedor: "Reatribuir vendedor",
  registrar_ganho: "Registrar ganho",
  registrar_perda: "Registrar perda",
  criar_lembrete: "Criar lembrete",
  criar_nota: "Criar nota",
  arquivar_negocio: "Arquivar negócio",
};

export function CardAcao({
  acao,
  onResolvido,
}: {
  acao: AcaoProposta;
  onResolvido: (resultado: {
    status: "EXECUTADO" | "DESCARTADO";
    mensagem: string;
  }) => void;
}) {
  const [processando, setProcessando] = useState<"confirmar" | "descartar" | null>(
    null,
  );
  const [erro, setErro] = useState<string | null>(null);

  async function decidir(decisao: "confirmar" | "descartar") {
    if (processando) return;
    setProcessando(decisao);
    setErro(null);
    try {
      const r = await fetch("/api/admin/supervisor/acao/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acaoId: acao.id, decisao }),
      });
      const corpo = (await r.json().catch(() => null)) as
        | { ok?: boolean; status?: string; erro?: string }
        | null;
      if (!r.ok || !corpo?.ok) {
        setErro(corpo?.erro ?? "Não foi possível concluir. Tente de novo.");
        setProcessando(null);
        return;
      }
      onResolvido({
        status: decisao === "confirmar" ? "EXECUTADO" : "DESCARTADO",
        mensagem:
          decisao === "confirmar"
            ? "Ação aplicada."
            : "Sugestão descartada.",
      });
    } catch {
      setErro("Falha de conexão. Tente de novo.");
      setProcessando(null);
    }
  }

  const rotulo = ROTULO_ACAO[acao.ferramenta] ?? acao.ferramenta;

  return (
    <div className="rounded-xl border border-tiffany/30 bg-tiffany/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-tiffany">
        <Wand2 className="h-3.5 w-3.5 shrink-0" />
        Ação sugerida · {rotulo}
      </div>
      <p className="text-sm text-escuro">{acao.preview}</p>
      {erro && <p className="mt-2 text-xs text-erro">{erro}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => decidir("confirmar")}
          disabled={processando !== null}
          className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-50"
        >
          {processando === "confirmar" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Confirmar
        </button>
        <button
          onClick={() => decidir("descartar")}
          disabled={processando !== null}
          className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-medio transition-colors hover:border-erro hover:text-erro disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          Descartar
        </button>
      </div>
    </div>
  );
}
