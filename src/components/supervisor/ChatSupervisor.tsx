"use client";

// Chat com o Supervisor Comercial (Camada 2). O gestor pergunta sobre o funil; a
// IA responde com diagnóstico e, quando cabe, PROPÕE uma ação (um CardAcao). A IA
// nunca escreve nada: toda mutação passa pela confirmação do gestor no card. O
// histórico enviado à API contém só as trocas gestor/assistente (notas de sistema
// são locais, para o gestor ver o que aconteceu — nunca vão ao modelo).
import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Sparkles, Info, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Markdown } from "@/components/ui/Markdown";
import { CardAcao, type AcaoProposta, type ResolucaoAcao } from "./CardAcao";

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

// Sugestões compactas que seguem disponíveis durante a conversa (não só no
// estado vazio) — ajudam o gestor a continuar sem pensar no fraseado.
const SUGESTOES_CONTINUAS = [
  "Resuma o funil agora",
  "Quem está sem próximo passo?",
  "Onde perdemos mais?",
  "O que priorizar hoje?",
];

// Histórico do chat persiste na sessão do navegador — não some ao trocar de aba.
const CHAVE_CHAT = "supervisor.chat.v1";

function carregarHistorico(): Mensagem[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.sessionStorage.getItem(CHAVE_CHAT);
    if (!bruto) return [];
    const dados = JSON.parse(bruto) as Mensagem[];
    return Array.isArray(dados) ? dados.slice(-60) : [];
  } catch {
    return [];
  }
}

let contador = 0;
const novoId = () => `m${Date.now()}-${contador++}`;

export function ChatSupervisor() {
  const toast = useToast();
  const [mensagens, setMensagens] = useState<Mensagem[]>(carregarHistorico);
  const [entrada, setEntrada] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [acaoPendente, setAcaoPendente] = useState<AcaoProposta | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, acaoPendente]);

  // Persiste o histórico (cap defensivo) a cada mudança.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        CHAVE_CHAT,
        JSON.stringify(mensagens.slice(-60)),
      );
    } catch {
      // storage cheio/indisponível: segue sem persistir
    }
  }, [mensagens]);

  const limparConversa = useCallback(() => {
    setMensagens([]);
    setAcaoPendente(null);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(CHAVE_CHAT);
      } catch {
        /* ignore */
      }
    }
  }, []);

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
        const notaFalha =
          corpo.acao && corpo.acao.status === "FALHOU"
            ? `Não consegui aplicar a ação${corpo.acao.erro ? `: ${corpo.acao.erro}` : "."}`
            : null;
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
          ...(notaFalha
            ? [{ id: novoId(), autor: "sistema" as const, texto: notaFalha }]
            : []),
        ]);
        // Mostra o card só quando há algo a decidir (PROPOSTO) ou desfazer
        // (EXECUTADO por comando). FALHOU já virou nota de sistema acima.
        if (corpo.acao && corpo.acao.status !== "FALHOU") setAcaoPendente(corpo.acao);
      } catch {
        toast.erro("Falha de conexão com o consultor.");
      } finally {
        setEnviando(false);
      }
    },
    [mensagens, enviando, toast],
  );

  function aoResolver(resultado: ResolucaoAcao) {
    setAcaoPendente(null);
    setMensagens((prev) => [
      ...prev,
      { id: novoId(), autor: "sistema", texto: resultado.mensagem },
    ]);
    if (resultado.status === "EXECUTADO" || resultado.status === "REVERTIDO") {
      toast.sucesso(resultado.mensagem);
    }
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
                Ele lê os indicadores e sugere o próximo passo. Quando você
                mandar agir, ele faz na hora — e dá pra desfazer.
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
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                    m.autor === "gestor"
                      ? "whitespace-pre-wrap bg-tiffany text-white"
                      : "border border-black/5 bg-white text-escuro"
                  }`}
                >
                  {m.autor === "gestor" ? m.texto : <Markdown texto={m.texto} />}
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
        {/* Sugestões contínuas + limpar — só quando há conversa e o campo está
            vazio, para não poluir enquanto o gestor digita. */}
        {!vazio && !entrada.trim() && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {SUGESTOES_CONTINUAS.map((s) => (
              <button
                key={s}
                onClick={() => void enviar(s)}
                disabled={enviando}
                className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] text-medio transition-colors hover:border-tiffany hover:text-tiffany disabled:opacity-40"
              >
                {s}
              </button>
            ))}
            <button
              onClick={limparConversa}
              disabled={enviando}
              className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-medio/60 transition-colors hover:text-erro disabled:opacity-40"
              aria-label="Limpar conversa"
            >
              <Trash2 className="h-3 w-3" /> Limpar
            </button>
          </div>
        )}
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
