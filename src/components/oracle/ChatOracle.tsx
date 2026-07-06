"use client";

// Chat do Oracle — agente de inteligencia de gestao. UI limpa e profissional:
// perguntas do usuario a direita, respostas do Oracle a esquerda (em blocos
// legiveis, com numeros/listas). Respeita o escopo do usuario (aplicado no
// backend); a nota de escopo deixa isso claro. Dark mode, responsivo.
import { useCallback, useEffect, useRef, useState } from "react";
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
  LayoutGrid,
  Trash2,
  Zap,
  ScanLine,
  Stethoscope,
  History,
  Plus,
  BookmarkPlus,
  X,
  Pencil,
  Archive,
  Check,
  type LucideIcon,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";

// Comandos rapidos (chips acima do compositor): atalhos de periodo e acoes.
// `Icone`/`destaque` opcionais dao enfase a um atalho especial (ex.: varredura).
const COMANDOS: { rotulo: string; pergunta: string; Icone?: LucideIcon; destaque?: boolean; admin?: boolean }[] = [
  {
    rotulo: "Diagnóstico do sistema",
    Icone: Stethoscope,
    admin: true,
    pergunta:
      "Rode a ferramenta diagnosticar_sistema e interprete os resultados. Para cada ALERTA, explique em linguagem de negocio o que significa e o impacto, e sugira a correcao (processo ou ajuste no sistema). Ao final, liste as PRIORIDADES de melhoria em ordem de importancia.",
  },
  {
    rotulo: "Varredura de atendimentos",
    Icone: ScanLine,
    destaque: true,
    pergunta:
      "Faca uma varredura completa dos atendimentos. Use as ferramentas de analise de conversas (amostrar_conversas e analisar_padroes_atendimento). Me diga: (1) como estao os atendimentos no geral; (2) o que os clientes MAIS falam e MAIS pedem; (3) as principais duvidas e objecoes; (4) quantas perguntas ficam SEM resposta e em quais temas (onde estamos falhando); (5) como as duvidas costumam ser respondidas (as boas respostas); e (6) gere um GUIA DE ATENDIMENTO acionavel para a IA (Sol): principais perguntas com as melhores respostas modelo, tom ideal, o que fazer e o que evitar. Seja completo e pratico.",
  },
  {
    rotulo: "Diagnostico de tempo de resposta",
    pergunta:
      "Use a ferramenta consultar_tempo_resposta nos ultimos 30 dias. Me diga a mediana e o p90 do tempo de resposta ao cliente, os piores dias da semana e faixas de horario, e o percentual de mensagens sem resposta em 24h. Se for admin, mostre tambem a quebra por agente. Aponte onde precisamos melhorar.",
  },
  { rotulo: "Resumo do dia", pergunta: "Me de um resumo do dia de hoje: vendas, atendimentos e o que precisa de atencao." },
  { rotulo: "O que priorizar", pergunta: "Com base nos dados, o que devo priorizar hoje? Liste as 3 acoes mais importantes." },
  { rotulo: "Hoje", pergunta: "Como estao as vendas e os atendimentos de hoje?" },
  { rotulo: "Esta semana", pergunta: "Como foi esta semana em vendas e atendimentos?" },
  { rotulo: "Este mes", pergunta: "Faca um resumo deste mes: vendas, metas e clientes." },
];

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

type ConversaLista = { id: string; titulo: string; atualizadoEm: string };
type ComandoUsuario = { id: string; rotulo: string; pergunta: string };

// Data relativa curta (agora / 12 min / 3h / 2d / dd/mm) para a lista de conversas.
function dataRelativa(iso: string): string {
  const t = new Date(iso).getTime();
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const dias = Math.floor(h / 24);
  if (dias < 7) return `${dias}d`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function ChatOracle({ papel }: { papel: string }) {
  const ehAdmin = papel === "ADMIN";
  const toast = useToast();
  const [mensagens, setMensagens] = useState<Bolha[]>([]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [painelRelatorios, setPainelRelatorios] = useState(false);
  // Persistencia (Fatia 2.93): conversa atual, lista de conversas e comandos.
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [conversas, setConversas] = useState<ConversaLista[]>([]);
  const [comandos, setComandos] = useState<ComandoUsuario[]>([]);
  const [painelConversas, setPainelConversas] = useState(false);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [arqConfirmId, setArqConfirmId] = useState<string | null>(null);
  const [salvarComandoDe, setSalvarComandoDe] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  const temConversa = mensagens.length > 0;

  const carregarConversas = useCallback(async () => {
    try {
      const r = await fetch("/api/oracle/conversas");
      const d = await r.json().catch(() => null);
      if (r.ok) setConversas(d?.conversas ?? []);
    } catch {
      // silencioso
    }
  }, []);

  const carregarComandos = useCallback(async () => {
    try {
      const r = await fetch("/api/oracle/comandos");
      const d = await r.json().catch(() => null);
      if (r.ok) setComandos(d?.comandos ?? []);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    void carregarConversas();
    void carregarComandos();
  }, [carregarConversas, carregarComandos]);

  function novaConversa() {
    setMensagens([]);
    setConversaId(null);
    setErro(null);
    setPainelRelatorios(false);
    setPainelConversas(false);
  }

  async function abrirConversa(id: string) {
    setPainelConversas(false);
    setErro(null);
    try {
      const r = await fetch(`/api/oracle/conversas/${id}`);
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setErro(d?.erro ?? "Nao foi possivel abrir a conversa.");
        return;
      }
      const bolhas: Bolha[] = (d?.mensagens ?? []).map(
        (m: { autor: string; texto: string }) =>
          m.autor === "oracle"
            ? { autor: "oracle", mensagens: m.texto.split("\n\n") }
            : { autor: "user", texto: m.texto },
      );
      setMensagens(bolhas);
      setConversaId(id);
    } catch {
      setErro("Falha de conexao.");
    }
  }

  async function arquivarConversa(id: string) {
    try {
      await fetch(`/api/oracle/conversas/${id}/arquivar`, { method: "POST" });
      setConversas((prev) => prev.filter((c) => c.id !== id));
      if (id === conversaId) novaConversa();
    } catch {
      toast.erro("Nao foi possivel arquivar.");
    }
  }

  async function confirmarRenomear(id: string) {
    const titulo = novoTitulo.trim().slice(0, 80);
    setRenomeando(null);
    if (!titulo) return;
    setConversas((prev) => prev.map((c) => (c.id === id ? { ...c, titulo } : c)));
    try {
      await fetch(`/api/oracle/conversas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo }),
      });
    } catch {
      void carregarConversas();
    }
  }

  async function salvarComando(rotulo: string, pergunta: string) {
    const r = await fetch("/api/oracle/comandos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotulo, pergunta }),
    });
    const d = await r.json().catch(() => null);
    if (r.ok && d?.comando) {
      setComandos((prev) => [d.comando, ...prev]);
      toast.sucesso("Comando salvo.");
    } else {
      toast.erro(d?.erro ?? "Nao foi possivel salvar o comando.");
    }
  }

  async function excluirComando(id: string) {
    setComandos((prev) => prev.filter((c) => c.id !== id));
    try {
      await fetch(`/api/oracle/comandos/${id}`, { method: "DELETE" });
    } catch {
      void carregarComandos();
    }
  }

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens, enviando]);

  async function perguntar(texto: string) {
    const t = texto.trim();
    if (!t || enviando) return;
    setErro(null);
    setMensagens((prev) => [...prev, { autor: "user", texto: t }]);
    setInput("");
    setEnviando(true);
    try {
      const r = await fetch("/api/oracle/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pergunta: t,
          ...(conversaId ? { conversaId } : {}),
        }),
      });
      const d = await r.json().catch(() => null);
      if (d?.conversaId && !conversaId) setConversaId(d.conversaId);
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
      void carregarConversas();
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
          className={`hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium md:inline-flex ${
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
        {/* Conversas salvas (drawer). */}
        <button
          onClick={() => setPainelConversas((v) => !v)}
          title="Conversas"
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            painelConversas
              ? "border-tiffany bg-tiffany/10 text-tiffany"
              : "border-black/10 text-medio hover:bg-black/5 hover:text-escuro"
          }`}
        >
          <History className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Conversas</span>
        </button>
        {/* Nova conversa. */}
        <button
          onClick={novaConversa}
          title="Nova conversa"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-medium text-medio transition-colors hover:bg-black/5 hover:text-escuro"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Nova</span>
        </button>
        {/* Relatorios: sempre acessivel (colapsa apos a 1a pergunta). */}
        {temConversa && (
          <button
            onClick={() => setPainelRelatorios((v) => !v)}
            title="Relatorios rapidos"
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              painelRelatorios
                ? "border-tiffany bg-tiffany/10 text-tiffany"
                : "border-black/10 text-medio hover:bg-black/5 hover:text-escuro"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Relatorios</span>
          </button>
        )}
      </header>

      {/* Drawer de conversas (overlay a direita; vira tela cheia no mobile). */}
      {painelConversas && (
        <div
          className="fixed inset-0 z-40 flex"
          onClick={() => setPainelConversas(false)}
        >
          <div className="flex-1 bg-black/30" />
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-72 max-w-[85vw] flex-col border-l border-black/10 bg-white shadow-xl dark:bg-escuro"
          >
            <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-escuro">
                <History className="h-4 w-4 text-tiffany" /> Conversas
              </h2>
              <button
                onClick={() => setPainelConversas(false)}
                className="rounded-lg p-1 text-medio/60 hover:bg-black/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={novaConversa}
              className="m-2 flex items-center gap-2 rounded-lg border border-tiffany/40 bg-tiffany/10 px-3 py-2 text-sm font-medium text-tiffany hover:bg-tiffany/15"
            >
              <Plus className="h-4 w-4" /> Nova conversa
            </button>
            <div className="scroll-fino min-h-0 flex-1 overflow-y-auto px-1 pb-2">
              {conversas.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-medio/50">
                  Nenhuma conversa salva ainda.
                </p>
              ) : (
                conversas.map((c) => (
                  <div
                    key={c.id}
                    className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 ${
                      c.id === conversaId ? "bg-tiffany/10" : "hover:bg-black/5"
                    }`}
                  >
                    {renomeando === c.id ? (
                      <input
                        value={novoTitulo}
                        onChange={(e) => setNovoTitulo(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void confirmarRenomear(c.id);
                          if (e.key === "Escape") setRenomeando(null);
                        }}
                        onBlur={() => void confirmarRenomear(c.id)}
                        autoFocus
                        maxLength={80}
                        className="min-w-0 flex-1 rounded border border-tiffany bg-white px-2 py-1 text-sm text-escuro outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => void abrirConversa(c.id)}
                        className="flex min-w-0 flex-1 flex-col items-start text-left"
                      >
                        <span className="w-full truncate text-sm text-escuro">
                          {c.titulo}
                        </span>
                        <span className="text-[11px] text-medio/50">
                          {dataRelativa(c.atualizadoEm)}
                        </span>
                      </button>
                    )}
                    {renomeando !== c.id &&
                      (arqConfirmId === c.id ? (
                        <button
                          onClick={() => {
                            setArqConfirmId(null);
                            void arquivarConversa(c.id);
                          }}
                          title="Confirmar arquivar"
                          className="shrink-0 rounded p-1 text-xs font-semibold text-erro hover:bg-black/5"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => {
                              setRenomeando(c.id);
                              setNovoTitulo(c.titulo);
                            }}
                            title="Renomear"
                            className="rounded p-1 text-medio/50 hover:bg-black/5 hover:text-tiffany"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setArqConfirmId(c.id)}
                            title="Arquivar"
                            className="rounded p-1 text-medio/50 hover:bg-black/5 hover:text-erro"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Painel colapsavel de relatorios (apos a 1a pergunta) */}
      {temConversa && painelRelatorios && (
        <div className="shrink-0 border-b border-black/5 bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <CardsRelatorio
              ehAdmin={ehAdmin}
              onRelatorio={(p) => {
                setPainelRelatorios(false);
                void perguntar(p);
              }}
            />
          </div>
        </div>
      )}

      {/* Conversa */}
      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {mensagens.length === 0 && !enviando ? (
            <Boasvindas ehAdmin={ehAdmin} onRelatorio={(p) => void perguntar(p)} />
          ) : (
            mensagens.map((m, i) =>
              m.autor === "user" ? (
                <div key={i} className="group flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => setSalvarComandoDe(m.texto)}
                    title="Salvar como comando"
                    className="shrink-0 rounded-lg p-1.5 text-medio/40 opacity-0 transition-opacity hover:bg-black/5 hover:text-tiffany group-hover:opacity-100"
                  >
                    <BookmarkPlus className="h-4 w-4" />
                  </button>
                  <div className="max-w-[85%] whitespace-pre-line break-words rounded-2xl rounded-br-sm bg-tiffany px-4 py-2.5 text-sm text-white">
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
                        className="max-w-[92%] break-words rounded-2xl rounded-bl-sm border border-black/5 bg-white px-4 py-3 text-sm text-escuro"
                      >
                        <Bloco texto={bloco} />
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

      {/* Comandos rapidos (atalhos) */}
      <div className="border-t border-black/5 bg-white px-4 pt-2.5 sm:px-6">
        <div className="scroll-fino mx-auto flex max-w-3xl items-center gap-1.5 overflow-x-auto pb-0.5">
          <Zap className="h-3.5 w-3.5 shrink-0 text-tiffany" />
          {COMANDOS.filter((c) => !c.admin || ehAdmin).map((c) => (
            <button
              key={c.rotulo}
              onClick={() => void perguntar(c.pergunta)}
              disabled={enviando}
              className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                c.destaque
                  ? "border-tiffany/50 bg-tiffany/10 text-tiffany hover:bg-tiffany/15"
                  : "border-black/10 bg-white text-medio hover:border-tiffany hover:text-tiffany"
              }`}
            >
              {c.Icone && <c.Icone className="h-3.5 w-3.5 shrink-0" />}
              {c.rotulo}
            </button>
          ))}
          {comandos.length > 0 && (
            <span className="mx-0.5 h-4 w-px shrink-0 bg-black/10" />
          )}
          {comandos.map((c) => (
            <span
              key={c.id}
              className="flex shrink-0 items-center rounded-full border border-tiffany/40 bg-white text-xs font-medium text-tiffany"
            >
              <button
                onClick={() => void perguntar(c.pergunta)}
                disabled={enviando}
                title={c.pergunta}
                className="max-w-40 truncate py-1 pl-2.5 pr-1 disabled:opacity-50"
              >
                {c.rotulo}
              </button>
              <button
                onClick={() => void excluirComando(c.id)}
                title="Excluir comando"
                className="py-1 pl-0.5 pr-2 text-tiffany/50 hover:text-erro"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Compositor */}
      <div className="bg-white px-4 py-3 sm:px-6">
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

      {salvarComandoDe !== null && (
        <ModalSalvarComando
          pergunta={salvarComandoDe}
          onFechar={() => setSalvarComandoDe(null)}
          onSalvar={async (rotulo) => {
            await salvarComando(rotulo, salvarComandoDe);
            setSalvarComandoDe(null);
          }}
        />
      )}
    </div>
  );
}

// Mini-modal para salvar a pergunta como comando reutilizavel. Rotulo pre-preenchido
// com os primeiros 40 chars da pergunta. Fatia 2.93.
function ModalSalvarComando({
  pergunta,
  onSalvar,
  onFechar,
}: {
  pergunta: string;
  onSalvar: (rotulo: string) => void | Promise<void>;
  onFechar: () => void;
}) {
  const [rotulo, setRotulo] = useState(pergunta.replace(/\s+/g, " ").trim().slice(0, 40));
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!rotulo.trim() || salvando) return;
    setSalvando(true);
    await onSalvar(rotulo.trim());
    setSalvando(false);
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-escuro">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
            <BookmarkPlus className="h-4 w-4 text-tiffany" /> Salvar como comando
          </h3>
          <button onClick={onFechar} className="rounded-lg p-1 text-medio/60 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="mb-1 block text-xs font-medium text-medio/70">Rotulo</label>
        <input
          value={rotulo}
          onChange={(e) => setRotulo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void salvar();
          }}
          autoFocus
          maxLength={40}
          placeholder="Ex.: Vendas do mes"
          className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-escuro outline-none focus:border-tiffany"
        />
        <p className="mt-1.5 line-clamp-2 text-[11px] text-medio/50">{pergunta}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onFechar}
            disabled={salvando}
            className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={() => void salvar()}
            disabled={salvando || !rotulo.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
            Salvar
          </button>
        </div>
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

// Renderiza um bloco de texto do Oracle com formatacao leve: **negrito**, listas
// com "- "/"•" (viram bullets) e "1) "/"1." (numeradas), e subtitulos (linha
// curta terminando em ":"). Deixa a resposta estruturada e legivel.
function inline(texto: string): React.ReactNode {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((p, i) => {
    const m = p.match(/^\*\*([^*]+)\*\*$/);
    return m ? (
      <strong key={i} className="font-semibold text-escuro">
        {m[1]}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    );
  });
}

function Bloco({ texto }: { texto: string }) {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let lista: { tipo: "ul" | "ol"; itens: string[] } | null = null;
  const flush = () => {
    if (!lista) return;
    const l = lista;
    nodes.push(
      <ul key={`l${nodes.length}`} className="my-1 space-y-1">
        {l.itens.map((it, i) => (
          <li key={i} className="flex gap-2">
            {l.tipo === "ol" ? (
              <span className="shrink-0 font-semibold text-tiffany">{i + 1}.</span>
            ) : (
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-tiffany" />
            )}
            <span className="min-w-0 leading-relaxed">{inline(it)}</span>
          </li>
        ))}
      </ul>,
    );
    lista = null;
  };
  for (const raw of linhas) {
    const l = raw.trimEnd();
    const mUl = l.match(/^\s*[-•]\s+(.*)$/);
    const mOl = l.match(/^\s*\d+[.)]\s+(.*)$/);
    if (mUl) {
      if (lista?.tipo !== "ul") {
        flush();
        lista = { tipo: "ul", itens: [] };
      }
      lista.itens.push(mUl[1]);
      continue;
    }
    if (mOl) {
      if (lista?.tipo !== "ol") {
        flush();
        lista = { tipo: "ol", itens: [] };
      }
      lista.itens.push(mOl[1]);
      continue;
    }
    flush();
    if (l.trim() === "") continue;
    if (/:$/.test(l) && l.length <= 60) {
      nodes.push(
        <p key={`p${nodes.length}`} className="mt-1.5 font-semibold text-escuro">
          {inline(l)}
        </p>,
      );
      continue;
    }
    nodes.push(
      <p key={`p${nodes.length}`} className="leading-relaxed">
        {inline(l)}
      </p>,
    );
  }
  flush();
  return <div className="space-y-1">{nodes}</div>;
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
