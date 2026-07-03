"use client";

// Chat do Oracle — agente de inteligencia de gestao. UI limpa e profissional:
// perguntas do usuario a direita, respostas do Oracle a esquerda (em blocos
// legiveis, com numeros/listas). Respeita o escopo do usuario (aplicado no
// backend); a nota de escopo deixa isso claro. Dark mode, responsivo.
import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  ShieldCheck,
  Building2,
  DollarSign,
  Filter,
  Trophy,
  MapPin,
  Users,
  Target,
  Headset,
  Activity,
  type LucideIcon,
} from "lucide-react";

type Bolha =
  | { autor: "user"; texto: string }
  | { autor: "oracle"; mensagens: string[] };

type Relatorio = {
  id: string;
  titulo: string;
  descricao: string;
  Icone: LucideIcon;
  pergunta: string;
};

// Relatorios prontos: cada card dispara uma pergunta bem formulada ao Oracle
// (reusa /api/oracle/chat). O escopo e aplicado no backend — os cards apenas se
// adaptam ao papel no rotulo/pergunta (ex.: equipe x proprio).
function relatorios(ehAdmin: boolean): Relatorio[] {
  return [
    {
      id: "vendas",
      titulo: "Vendas do periodo",
      descricao: "Total, ganhos, perdidos e ticket medio",
      Icone: DollarSign,
      pergunta:
        "Como foram as vendas neste mes? Traga total vendido, negocios ganhos, perdidos, em aberto e o ticket medio.",
    },
    {
      id: "funil",
      titulo: "Funil de conversao",
      descricao: "Negocios por etapa e onde travam",
      Icone: Filter,
      pergunta:
        "Analise meu funil: negocios abertos por etapa (quantidade e valor) e aponte onde estao travando.",
    },
    {
      id: "desempenho",
      titulo: ehAdmin ? "Desempenho da equipe" : "Meu desempenho",
      descricao: ehAdmin ? "Ranking de vendedores no periodo" : "Seus resultados no periodo",
      Icone: Trophy,
      pergunta: ehAdmin
        ? "Mostre o ranking de desempenho dos vendedores neste mes, por valor vendido."
        : "Como esta o meu desempenho de vendas neste mes?",
    },
    {
      id: "mapa",
      titulo: "Oportunidades no mapa",
      descricao: "Clima quente cruzado com clientes",
      Icone: MapPin,
      pergunta:
        "Onde tenho mais oportunidade? Cruze o indice de oportunidade (clima) com a minha distribuicao de clientes por estado e recomende prioridades.",
    },
    {
      id: "clientes",
      titulo: ehAdmin ? "Clientes da empresa" : "Meus clientes",
      descricao: "Resumo por segmento e estado",
      Icone: Users,
      pergunta:
        "Faca um resumo dos clientes: total, por segmento (varejo/atacado) e destaque os estados com mais clientes.",
    },
    {
      id: "metas",
      titulo: "Metas e progresso",
      descricao: "Onde estou frente ao alvo",
      Icone: Target,
      pergunta: "Como estao as metas e o progresso ate agora?",
    },
    {
      id: "atendimentos",
      titulo: "Atendimentos",
      descricao: "Volume de conversas no periodo",
      Icone: Headset,
      pergunta: "Qual o volume de atendimentos e mensagens recebidas neste mes?",
    },
    {
      id: "diagnostico",
      titulo: "Diagnostico geral",
      descricao: "Cruza tudo e aponta prioridades",
      Icone: Activity,
      pergunta:
        "Faca um diagnostico geral do meu cenario: cruze vendas, funil, metas e oportunidades de mercado, e aponte as 3 prioridades da semana.",
    },
  ];
}

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
            <Boasvindas ehAdmin={ehAdmin} onRelatorio={(p) => void perguntar(p)} />
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
  onRelatorio,
}: {
  ehAdmin: boolean;
  onRelatorio: (pergunta: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5 py-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-tiffany/10 text-tiffany">
          <Sparkles className="h-7 w-7" />
        </span>
        <div>
          <p className="text-base font-semibold text-escuro">
            Ola! Sou o Oracle, seu analista de gestao.
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-medio/60">
            Escolha um relatorio pronto ou faca uma pergunta.
            {ehAdmin
              ? " Voce tem a visao geral da empresa."
              : " Mostro os dados da sua carteira."}
          </p>
        </div>
      </div>

      {/* Relatorios rapidos (cards) */}
      <div>
        <p className="mb-2 px-0.5 text-xs font-semibold uppercase tracking-wide text-medio/50">
          Relatorios rapidos
        </p>
        <CardsRelatorio ehAdmin={ehAdmin} onRelatorio={onRelatorio} />
      </div>
    </div>
  );
}

function CardsRelatorio({
  ehAdmin,
  onRelatorio,
}: {
  ehAdmin: boolean;
  onRelatorio: (pergunta: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {relatorios(ehAdmin).map((r) => {
        const Icone = r.Icone;
        return (
          <button
            key={r.id}
            onClick={() => onRelatorio(r.pergunta)}
            className="flex items-start gap-3 rounded-xl border border-black/5 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-tiffany/40 hover:shadow-md"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tiffany/10 text-tiffany">
              <Icone className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-escuro">
                {r.titulo}
              </span>
              <span className="block text-xs text-medio/60">{r.descricao}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
