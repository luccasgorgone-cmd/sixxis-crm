"use client";

// Chat com o Supervisor Comercial (Camada 2). O gestor pergunta sobre o funil; a
// IA responde com diagnóstico e, quando cabe, PROPÕE uma ação (um CardAcao). A IA
// nunca escreve nada: toda mutação passa pela confirmação do gestor no card. O
// histórico enviado à API contém só as trocas gestor/assistente (notas de sistema
// são locais, para o gestor ver o que aconteceu — nunca vão ao modelo).
import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Sparkles, Info } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { CardAcao, type AcaoProposta } from "./CardAcao";

type Autor = "gestor" | "assistente" | "sistema";
type Mensagem = { id: string; autor: Autor; texto: string };

type RespostaChat = {
  resposta: string;
  acao: AcaoProposta | null;
  propostaRejeitada: string | null;
};

const SUGESTOES = [
  "Como está o funil de vendas nos últimos 30 dias?",
  "Quais negócios estão parados há mais tempo?",
  "Quem está com mais negócios sem próximo passo?",
  "Onde estamos perdendo mais no funil?",
];

let contador = 0;
const novoId = () => `m${Date.now()}-${contador++}`;

export function ChatSupervisor() {
  const toast = useToast();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [entrada, setEntrada] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [acaoPendente, setAcaoPendente] = useState<AcaoProposta | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, acaoPendente]);

  const enviar = useCallback(
    async (texto: string) => {
      const limpo = texto.trim();
      if (!limpo || enviando) return;

      const msgGestor: Mensagem = { id: novoId(), autor: "gestor", texto: limpo };
      // A partir do estado atual, monta o próximo (otimista) e o histórico p/ API.
      setEntrada("");
      setEnviando(true);
      // Card antigo não resolvido perde a validade quando a conversa avança.
      setAcaoPendente(null);

      const base = [...mensagens, msgGestor];
      setMensagens(base);

      const historico = base
        .filter((m) => m.autor === "gestor" || m.autor === "assistente")
        .map((m) => ({ autor: m.autor, texto: m.texto }));

      try {
        const r = await fetch("/api/admin/supervisor/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ historico }),
        });
        const corpo = (await r.json().catch(() => null)) as RespostaChat | null;
        if (!r.ok || !corpo) {
          toast.erro("O consultor não respondeu. Tente de novo.");
          setMensagens((prev) => [
            ...prev,
            {
              id: novoId(),
              autor: "sistema",
              texto: "Não foi possível obter a resposta agora.",
            },
          ]);
          return;
        }
        setMensagens((prev) => [
          ...prev,
          { id: novoId(), autor: "assistente", texto: corpo.resposta },
          ...(corpo.propostaRejeitada
            ? [
                {
                  id: novoId(),
                  autor: "sistema" as const,
                  texto: `Sugestão não aplicável: ${corpo.propostaRejeitada}`,
                },
              ]
            : []),
        ]);
        if (corpo.acao) setAcaoPendente(corpo.acao);
      } catch {
        toast.erro("Falha de conexão com o consultor.");
      } finally {
        setEnviando(false);
      }
    },
    [mensagens, enviando, toast],
  );

  function aoResolver(resultado: {
    status: "EXECUTADO" | "DESCARTADO";
    mensagem: string;
  }) {
    setAcaoPendente(null);
    setMensagens((prev) => [
      ...prev,
      { id: novoId(), autor: "sistema", texto: resultado.mensagem },
    ]);
    if (resultado.status === "EXECUTADO") toast.sucesso(resultado.mensagem);
  }

  const vazio = mensagens.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Thread */}
      <div className="scroll-fino min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {vazio ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tiffany/10">
              <Sparkles className="h-6 w-6 text-tiffany" />
            </div>
            <div>
              <p className="text-sm font-medium text-escuro">
                Pergunte ao consultor comercial
              </p>
              <p className="mt-0.5 text-xs text-medio/60">
                Ele lê os indicadores e sugere o próximo passo. Nada é
                executado sem a sua confirmação.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  onClick={() => void enviar(s)}
                  className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-medio transition-colors hover:border-tiffany hover:text-tiffany"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          mensagens.map((m) =>
            m.autor === "sistema" ? (
              <div
                key={m.id}
                className="flex items-center justify-center gap-1.5 text-xs text-medio/60"
              >
                <Info className="h-3 w-3 shrink-0" />
                {m.texto}
              </div>
            ) : (
              <div
                key={m.id}
                className={`flex ${
                  m.autor === "gestor" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                    m.autor === "gestor"
                      ? "bg-tiffany text-white"
                      : "border border-black/5 bg-white text-escuro"
                  }`}
                >
                  {m.texto}
                </div>
              </div>
            ),
          )
        )}

        {acaoPendente && (
          <div className="pt-1">
            <CardAcao acao={acaoPendente} onResolvido={aoResolver} />
          </div>
        )}

        {enviando && (
          <div className="flex items-center gap-2 text-xs text-medio/60">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando o funil…
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-black/5 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar(entrada);
              }
            }}
            rows={1}
            placeholder="Pergunte sobre o funil, um vendedor, um negócio…"
            className="scroll-fino max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-escuro outline-none transition-colors focus:border-tiffany"
          />
          <button
            onClick={() => void enviar(entrada)}
            disabled={enviando || !entrada.trim()}
            aria-label="Enviar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tiffany text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-40"
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
