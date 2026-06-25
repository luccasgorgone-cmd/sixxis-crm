"use client";

// Envio em massa para clientes SELECIONADOS. Compositor de texto com variaveis
// e preview + gate de seguranca (mostra total e amostra dos destinos antes de
// enviar; bloqueia se vazio). Reusa /api/campanhas (+/preview) com leadIds.
import { useState, useEffect } from "react";
import {
  X,
  Send,
  Loader2,
  Users,
  Eye,
  AlertTriangle,
  Ban,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  detectarVariaveis,
  aplicarModelo,
  INFO_VARIAVEL,
  VARIAVEIS_AUTOMATICAS,
} from "@/lib/modelos";

type Preview = {
  total: number;
  amostra: { nomeEfetivo: string; destino: string }[];
  pulados: { optOut: number; semCanal: number; total: number };
};

export function ModalEnvioSelecao({
  leadIds,
  ehAdmin,
  onFechar,
}: {
  leadIds: string[];
  ehAdmin: boolean;
  onFechar: () => void;
}) {
  const toast = useToast();
  const [finalidade, setFinalidade] = useState<"VENDA" | "POS_VENDA">("VENDA");
  const [mensagem, setMensagem] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [fase, setFase] = useState<"compor" | "confirmar">("compor");

  // Escopo: admin envia para os selecionados sem travar por dono; demais usam a
  // propria carteira (so veem/possuem os proprios clientes).
  const corpoBase = {
    finalidade,
    canal: "WHATSAPP",
    leadIds,
    escopo: ehAdmin ? "todos" : undefined,
  };

  const usadas = detectarVariaveis(mensagem);
  const previewTexto = aplicarModelo(mensagem || "", {
    lead: {
      nomeEfetivo: "Maria Silva",
      empresa: "Acme",
      produto: INFO_VARIAVEL.produto.exemplo,
    },
    agente: { nome: INFO_VARIAVEL.vendedor.exemplo },
  });

  // Carrega o preview (total/amostra/pulados) ao mudar finalidade/selecao.
  useEffect(() => {
    let vivo = true;
    setCarregandoPreview(true);
    fetch("/api/campanhas/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpoBase),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo) setPreview(d);
      })
      .catch(() => undefined)
      .finally(() => vivo && setCarregandoPreview(false));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalidade, leadIds.length]);

  function inserirVariavel(v: string) {
    setMensagem((m) => `${m}{${v}}`);
  }

  async function enviar() {
    if (!mensagem.trim()) {
      toast.erro("Escreva a mensagem.");
      return;
    }
    if (!preview || preview.total === 0) {
      toast.erro("Nenhum destinatario valido na selecao.");
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch("/api/campanhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...corpoBase, mensagem: mensagem.trim() }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        toast.sucesso(`Envio iniciado para ${d?.campanha?.total ?? preview.total} clientes.`);
        onFechar();
      } else {
        toast.erro(d?.erro ?? "Nao foi possivel enviar.");
        setEnviando(false);
      }
    } catch {
      toast.erro("Falha de conexao.");
      setEnviando(false);
    }
  }

  const podeAvancar = mensagem.trim().length > 0 && (preview?.total ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fade-in absolute inset-0 bg-black/30" onClick={onFechar} />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-black/5 px-5 py-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-escuro">
            <Send className="h-5 w-5 text-tiffany" /> Envio em massa
            <span className="rounded-full bg-tiffany/10 px-2 py-0.5 text-xs font-semibold text-tiffany">
              {leadIds.length} selecionados
            </span>
          </h3>
          <button
            onClick={onFechar}
            className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="scroll-fino flex-1 space-y-4 overflow-y-auto p-5">
          {fase === "compor" ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-medio/70">
                  Finalidade
                </label>
                <select
                  value={finalidade}
                  onChange={(e) =>
                    setFinalidade(e.target.value as "VENDA" | "POS_VENDA")
                  }
                  className="campo w-full"
                >
                  <option value="VENDA">Venda</option>
                  <option value="POS_VENDA">Pos-venda</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-medio/70">
                  Mensagem
                </label>
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  rows={5}
                  placeholder="Escreva a mensagem. Use variaveis como {primeiro_nome}."
                  className="campo scroll-fino w-full resize-none"
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {VARIAVEIS_AUTOMATICAS.map((v) => (
                    <button
                      key={v}
                      onClick={() => inserirVariavel(v)}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        usadas.automaticas.includes(v)
                          ? "border-tiffany bg-tiffany/10 text-tiffany"
                          : "border-black/10 text-medio/70 hover:border-tiffany hover:text-tiffany"
                      }`}
                    >
                      {`{${v}}`}
                    </button>
                  ))}
                </div>
              </div>

              {mensagem.trim() && (
                <div className="rounded-xl border border-black/5 bg-fundo p-3">
                  <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-medio/50">
                    <Eye className="h-3 w-3" /> Previa
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-escuro">
                    {previewTexto}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 rounded-xl bg-tiffany/5 p-3 text-sm text-medio/80">
                <Users className="h-4 w-4 shrink-0 text-tiffany" />
                {carregandoPreview ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando
                    destinatarios...
                  </span>
                ) : (
                  <span>
                    <strong className="text-escuro">{preview?.total ?? 0}</strong>{" "}
                    destinatarios validos
                    {(preview?.pulados.total ?? 0) > 0 && (
                      <span className="text-medio/60">
                        {" "}
                        · {preview?.pulados.total} pulados (opt-out/sem numero)
                      </span>
                    )}
                  </span>
                )}
              </div>
            </>
          ) : (
            <ConfirmacaoEnvio preview={preview} mensagem={previewTexto} />
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-black/5 px-5 py-3">
          {fase === "confirmar" ? (
            <button
              onClick={() => setFase("compor")}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-medio hover:bg-black/5"
            >
              Voltar
            </button>
          ) : (
            <span className="text-xs text-medio/50">
              Respeita opt-out e finalidade.
            </span>
          )}

          {fase === "compor" ? (
            <button
              onClick={() => setFase("confirmar")}
              disabled={!podeAvancar}
              className="flex items-center gap-1.5 rounded-lg bg-tiffany px-4 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-50"
            >
              Revisar envio
            </button>
          ) : (
            <button
              onClick={() => void enviar()}
              disabled={enviando || (preview?.total ?? 0) === 0}
              className="flex items-center gap-1.5 rounded-lg bg-tiffany px-4 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-50"
            >
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar para {preview?.total ?? 0}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function ConfirmacaoEnvio({
  preview,
  mensagem,
}: {
  preview: Preview | null;
  mensagem: string;
}) {
  if (!preview || preview.total === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Ban className="h-8 w-8 text-erro/60" />
        <p className="text-sm font-medium text-escuro">
          Nenhum destinatario valido
        </p>
        <p className="text-xs text-medio/60">
          Revise a selecao ou a finalidade.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Você vai enviar para <strong>{preview.total}</strong> clientes. Esta
          ação dispara mensagens reais.
        </span>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-medio/50">
          Amostra dos destinos
        </p>
        <ul className="space-y-1">
          {preview.amostra.map((a, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg bg-fundo px-3 py-1.5 text-sm"
            >
              <span className="truncate text-escuro">{a.nomeEfetivo}</span>
              <span className="ml-2 shrink-0 text-xs text-medio/60">
                {a.destino}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-black/5 bg-fundo p-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-medio/50">
          Mensagem (exemplo)
        </p>
        <p className="whitespace-pre-wrap text-sm text-escuro">{mensagem}</p>
      </div>
    </div>
  );
}
