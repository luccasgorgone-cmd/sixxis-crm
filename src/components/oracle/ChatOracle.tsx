"use client";

// Chat do Oracle — agente de inteligencia de gestao. UI limpa e profissional:
// perguntas do usuario a direita, respostas do Oracle a esquerda (em blocos
// legiveis, com numeros/listas). Respeita o escopo do usuario (aplicado no
// backend); a nota de escopo deixa isso claro. Dark mode, responsivo.
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Loader2, ShieldCheck, Building2 } from "lucide-react";

type Bolha =
  | { autor: "user"; texto: string }
  | { autor: "oracle"; mensagens: string[] };

const SUGESTOES = [
  "Como foram as vendas do mes?",
  "Como esta meu funil?",
  "Qual estado tem mais oportunidade?",
  "Como estao minhas metas?",
];

export function ChatOracle({ papel }: { papel: string }) {
  const ehAdmin = papel === "ADMIN";
  const [mensagens, setMensagens] = useState<Bolha[]>([]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens, enviando]);

  async function perguntar(texto: string) {
    const t = texto.trim();
    if (!t || enviando) return;
    setErro(null);
    const historico = [
      ...mensagens.map((m) =>
        m.autor === "user"
          ? { autor: "user", texto: m.texto }
          : { autor: "oracle", texto: m.mensagens.join("\n\n") },
      ),
      { autor: "user" as const, texto: t },
    ];
    setMensagens((prev) => [...prev, { autor: "user", texto: t }]);
    setInput("");
    setEnviando(true);
    try {
      const r = await fetch("/api/oracle/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historico }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setErro(d?.erro ?? "Nao foi possivel consultar o Oracle.");
        return;
      }
      const msgs: string[] = Array.isArray(d?.mensagens)
        ? (d.mensagens as unknown[]).filter(
            (x): x is string => typeof x === "string" && x.trim() !== "",
          )
        : [];
      setMensagens((prev) => [...prev, { autor: "oracle", mensagens: msgs }]);
    } catch {
      setErro("Falha de conexao.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-fundo">
      {/* Cabecalho */}
      <header className="flex shrink-0 items-center gap-3 border-b border-black/5 bg-white px-4 py-3 sm:px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tiffany/10 text-tiffany">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-escuro">Oracle</h1>
          <p className="truncate text-xs text-medio/60">
            Inteligencia de gestao — pergunte sobre vendas, clientes, funil e metas
          </p>
        </div>
        <span
          className={`hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${
            ehAdmin
              ? "bg-tiffany/10 text-tiffany"
              : "bg-black/5 text-medio/70"
          }`}
        >
          {ehAdmin ? (
            <>
              <Building2 className="h-3.5 w-3.5" /> Visao geral da empresa
            </>
          ) : (
            <>
              <ShieldCheck className="h-3.5 w-3.5" /> Dados da sua carteira
            </>
          )}
        </span>
      </header>

      {/* Conversa */}
      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {mensagens.length === 0 && !enviando ? (
            <Boasvindas ehAdmin={ehAdmin} onSugestao={(s) => void perguntar(s)} />
          ) : (
            mensagens.map((m, i) =>
              m.autor === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-sm bg-tiffany px-4 py-2.5 text-sm text-white">
                    {m.texto}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex flex-col items-start gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-tiffany-escuro">
                    <Sparkles className="h-3.5 w-3.5" /> Oracle
                  </div>
                  {m.mensagens.length > 0 ? (
                    m.mensagens.map((bloco, k) => (
                      <div
                        key={k}
                        className="max-w-[92%] whitespace-pre-line rounded-2xl rounded-bl-sm border border-black/5 bg-white px-4 py-3 text-sm leading-relaxed text-escuro"
                      >
                        {bloco}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-black/5 bg-white px-4 py-3 text-sm italic text-medio/60">
                      Nao consegui gerar uma analise para isso.
                    </div>
                  )}
                </div>
              ),
            )
          )}
          {enviando && (
            <div className="flex items-center gap-2 text-sm text-medio/60">
              <Loader2 className="h-4 w-4 animate-spin text-tiffany" />
              Oracle analisando...
            </div>
          )}
          <div ref={fimRef} />
        </div>
      </div>

      {/* Erro */}
      {erro && (
        <div className="border-t border-black/5 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200 sm:px-6">
          {erro}
        </div>
      )}

      {/* Compositor */}
      <div className="border-t border-black/5 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void perguntar(input);
              }
            }}
            rows={1}
            placeholder="Pergunte ao Oracle..."
            className="scroll-fino max-h-32 flex-1 resize-none rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-tiffany"
          />
          <button
            onClick={() => void perguntar(input)}
            disabled={enviando || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tiffany text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-50"
            aria-label="Perguntar"
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mx-auto mt-1.5 max-w-3xl text-[11px] text-medio/40">
          O Oracle analisa dados reais do seu escopo. So leitura — nao altera nada.
        </p>
      </div>
    </div>
  );
}

function Boasvindas({
  ehAdmin,
  onSugestao,
}: {
  ehAdmin: boolean;
  onSugestao: (s: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-tiffany/10 text-tiffany">
        <Sparkles className="h-7 w-7" />
      </span>
      <div>
        <p className="text-base font-semibold text-escuro">
          Ola! Sou o Oracle, seu analista de gestao.
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-medio/60">
          Pergunte sobre suas vendas, clientes, funil, metas, mapa e mercado.
          {ehAdmin
            ? " Voce tem a visao geral da empresa."
            : " Mostro os dados da sua carteira."}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {SUGESTOES.map((s) => (
          <button
            key={s}
            onClick={() => onSugestao(s)}
            className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
