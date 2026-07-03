"use client";

// Sandbox de teste da Luna (SO ADMIN). O dono conversa como se fosse o cliente e
// ve a Luna responder, com o selo da ACAO decidida (responder / handoff /
// silenciar). AMBIENTE DE TESTE: nada e enviado a clientes nem gravado — chama
// POST /api/admin/ia/testar, que e efemero.
import { useRef, useState, useEffect } from "react";
import {
  Loader2,
  Send,
  Trash2,
  FlaskConical,
  MessageSquare,
  UserCog,
  Ban,
} from "lucide-react";

type Finalidade = "VENDA" | "POS_VENDA";
type Acao = "responder" | "handoff" | "silenciar";
// cliente: uma mensagem (texto). luna: LISTA de mensagens (uma bolha por item).
type Bolha = {
  autor: "cliente" | "luna";
  texto?: string;
  mensagens?: string[];
  acao?: Acao;
  motivo?: string;
};

const SELO: Record<Acao, { rotulo: string; classe: string; Icone: typeof Send }> = {
  responder: {
    rotulo: "Respondeu",
    classe: "bg-tiffany/10 text-tiffany",
    Icone: MessageSquare,
  },
  handoff: {
    rotulo: "Vai transferir para humano",
    classe: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    Icone: UserCog,
  },
  silenciar: {
    rotulo: "Silenciou (repassa ao humano)",
    classe: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    Icone: Ban,
  },
};

export function SandboxLuna() {
  const [finalidade, setFinalidade] = useState<Finalidade>("VENDA");
  const [mensagens, setMensagens] = useState<Bolha[]>([]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens, enviando]);

  function limpar() {
    setMensagens([]);
    setErro(null);
  }

  async function enviar() {
    const texto = input.trim();
    if (!texto || enviando) return;
    setErro(null);
    const historico = [
      ...mensagens.map((m) => ({
        autor: m.autor,
        texto: m.texto ?? (m.mensagens?.join("\n\n") ?? ""),
      })),
      { autor: "cliente" as const, texto },
    ];
    setMensagens((prev) => [...prev, { autor: "cliente", texto }]);
    setInput("");
    setEnviando(true);
    try {
      const r = await fetch("/api/admin/ia/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalidade, historico }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setErro(d?.erro ?? "Falha ao consultar a Luna.");
        return;
      }
      const mensagensLuna: string[] = Array.isArray(d?.mensagens)
        ? (d.mensagens as unknown[]).filter(
            (x): x is string => typeof x === "string" && x.trim() !== "",
          )
        : typeof d?.texto === "string" && d.texto.trim()
          ? [d.texto]
          : [];
      setMensagens((prev) => [
        ...prev,
        {
          autor: "luna",
          mensagens: mensagensLuna,
          texto:
            typeof d?.texto === "string"
              ? d.texto
              : mensagensLuna.join("\n\n"),
          acao: (d?.acao as Acao) ?? "responder",
          motivo: typeof d?.motivo === "string" ? d.motivo : undefined,
        },
      ]);
    } catch {
      setErro("Falha de conexao.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
        <FlaskConical className="h-4 w-4 text-tiffany" />
        Testar a Luna (sandbox)
      </h3>
      <p className="mb-2 text-xs text-medio/60">
        Converse como se fosse o cliente e veja a Luna responder. Usa a
        configuracao SALVA (salve antes de testar mudancas). Ambiente de teste —
        nada e enviado a clientes nem gravado.
      </p>

      <div className="overflow-hidden rounded-xl border border-black/5 bg-white">
        {/* Barra: finalidade + limpar */}
        <div className="flex items-center gap-2 border-b border-black/5 px-3 py-2">
          <span className="text-xs font-medium text-medio/70">Simular como:</span>
          <div className="flex overflow-hidden rounded-lg border border-black/10">
            {(["VENDA", "POS_VENDA"] as const).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFinalidade(f);
                  limpar();
                }}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  finalidade === f
                    ? "bg-tiffany text-white"
                    : "bg-white text-medio hover:bg-black/5"
                }`}
              >
                {f === "VENDA" ? "Venda" : "Pos-venda"}
              </button>
            ))}
          </div>
          {mensagens.length > 0 && (
            <button
              onClick={limpar}
              className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-medio/70 transition-colors hover:bg-black/5 hover:text-escuro"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar conversa
            </button>
          )}
        </div>

        {/* Janela de chat */}
        <div className="scroll-fino flex h-80 flex-col gap-2 overflow-y-auto bg-fundo p-3">
          {mensagens.length === 0 && !enviando ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-medio/50">
              <MessageSquare className="h-6 w-6 text-medio/30" />
              <p className="max-w-xs text-xs">
                Digite abaixo como se fosse o cliente. Tente pedir um produto, pedir
                um atendente, ou testar as travas (perguntar sobre o sistema).
              </p>
            </div>
          ) : (
            mensagens.map((m, i) =>
              m.autor === "cliente" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] whitespace-pre-line rounded-2xl rounded-br-sm bg-tiffany px-3 py-2 text-sm text-white">
                    {m.texto}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex flex-col items-start gap-1">
                  {m.acao && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${SELO[m.acao].classe}`}
                    >
                      {(() => {
                        const Ic = SELO[m.acao].Icone;
                        return <Ic className="h-2.5 w-2.5" />;
                      })()}
                      {SELO[m.acao].rotulo}
                    </span>
                  )}
                  {m.mensagens && m.mensagens.length > 0 ? (
                    // Uma bolha por mensagem, na ordem (como no WhatsApp).
                    m.mensagens.map((msg, k) => (
                      <div
                        key={k}
                        className="max-w-[80%] whitespace-pre-line rounded-2xl rounded-bl-sm border border-black/5 bg-white px-3 py-2 text-sm text-escuro"
                      >
                        {msg}
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] italic text-medio/50">
                      (Luna nao enviou texto — {m.acao})
                    </div>
                  )}
                  {m.motivo && (
                    <span className="text-[10px] text-medio/40">
                      motivo: {m.motivo}
                    </span>
                  )}
                </div>
              ),
            )
          )}
          {enviando && (
            <div className="flex items-center gap-1.5 text-xs text-medio/50">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Luna pensando...
            </div>
          )}
          <div ref={fimRef} />
        </div>

        {/* Erro */}
        {erro && (
          <div className="border-t border-black/5 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            {erro}
          </div>
        )}

        {/* Compositor */}
        <div className="flex items-end gap-2 border-t border-black/5 bg-white p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            rows={1}
            placeholder="Escreva como o cliente e pressione Enter..."
            className="scroll-fino max-h-28 flex-1 resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
          />
          <button
            onClick={() => void enviar()}
            disabled={enviando || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tiffany text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-50"
            aria-label="Enviar"
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
