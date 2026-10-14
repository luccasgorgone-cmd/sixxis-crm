"use client";

// Card de uma ação da IA. Dois estados, conforme SPEC §3:
//  • PROPOSTO (a IA sugeriu por conta própria): Confirmar / Descartar — nada foi
//    escrito ainda; o gestor decide (human-in-the-loop).
//  • EXECUTADO (o gestor COMANDOU: o comando é a autorização): já aplicada; o
//    card mostra "Feito ✓" + Desfazer (reverter via o snapshot antes/depois).
// Tudo chama /api/admin/supervisor/acao/confirmar (decisao confirmar/descartar/
// reverter), que revalida no servidor. O card é efêmero: some ao resolver.
import { useState } from "react";
import { Check, X, Loader2, Wand2, Undo2, CheckCircle2 } from "lucide-react";

export type StatusAcao = "PROPOSTO" | "EXECUTADO" | "FALHOU";

export type AcaoProposta = {
  id: string;
  ferramenta: string;
  preview: string;
  status?: StatusAcao; // ausente = PROPOSTO
  erro?: string;
};

export type ResolucaoAcao = {
  status: "EXECUTADO" | "DESCARTADO" | "REVERTIDO";
  mensagem: string;
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
  definir_config: "Alterar configuração",
};

async function decidir(acaoId: string, decisao: "confirmar" | "descartar" | "reverter") {
  const r = await fetch("/api/admin/supervisor/acao/confirmar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acaoId, decisao }),
  });
  const corpo = (await r.json().catch(() => null)) as
    | { ok?: boolean; status?: string; erro?: string }
    | null;
  return { ok: r.ok && corpo?.ok === true, erro: corpo?.erro };
}

export function CardAcao({
  acao,
  onResolvido,
}: {
  acao: AcaoProposta;
  onResolvido: (resultado: ResolucaoAcao) => void;
}) {
  const executada = acao.status === "EXECUTADO";
  const [processando, setProcessando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const rotulo = ROTULO_ACAO[acao.ferramenta] ?? acao.ferramenta;

  async function aoDecidir(decisao: "confirmar" | "descartar" | "reverter") {
    if (processando) return;
    setProcessando(decisao);
    setErro(null);
    try {
      const r = await decidir(acao.id, decisao);
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível concluir. Tente de novo.");
        setProcessando(null);
        return;
      }
      if (decisao === "confirmar") onResolvido({ status: "EXECUTADO", mensagem: "Ação aplicada." });
      else if (decisao === "reverter") onResolvido({ status: "REVERTIDO", mensagem: "Ação desfeita." });
      else onResolvido({ status: "DESCARTADO", mensagem: "Sugestão descartada." });
    } catch {
      setErro("Falha de conexão. Tente de novo.");
      setProcessando(null);
    }
  }

  // ── EXECUTADO: já aplicada por comando do gestor. Mostra feito + Desfazer. ──
  if (executada) {
    return (
      <div className="rounded-xl border border-sucesso/30 bg-sucesso/5 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sucesso">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Feito · {rotulo}
        </div>
        <p className="text-sm text-escuro">{acao.preview}</p>
        {erro && <p className="mt-2 text-xs text-erro">{erro}</p>}
        <div className="mt-3">
          <button
            onClick={() => aoDecidir("reverter")}
            disabled={processando !== null}
            className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-medio transition-colors hover:border-escuro hover:text-escuro disabled:opacity-50"
          >
            {processando === "reverter" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Undo2 className="h-3.5 w-3.5" />
            )}
            Desfazer
          </button>
        </div>
      </div>
    );
  }

  // ── PROPOSTO: a IA sugeriu. Confirmar / Descartar. ──
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
          onClick={() => aoDecidir("confirmar")}
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
          onClick={() => aoDecidir("descartar")}
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
