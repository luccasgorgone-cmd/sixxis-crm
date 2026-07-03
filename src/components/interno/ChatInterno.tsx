"use client";

// Chat interno da secao "Sixxis": lista de grupos a esquerda, conversa do grupo
// a direita, tempo real via socket (grupo:mensagem / grupo:atualizado /
// grupo:removido). ISOLADO — nao usa Conversa/Lead nem entra em metricas.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessagesSquare,
  Send,
  Loader2,
  Archive,
  LogOut,
  AlertTriangle,
  Users2,
  FileText,
  Download,
  X,
} from "lucide-react";
import { AvatarCliente } from "@/components/AvatarCliente";
import { useToast } from "@/components/ui/Toast";
import { getSocket } from "@/lib/socketClient";
import { horaCurta, rotuloDia, chaveDia } from "@/lib/format";

type UltimaMensagem = {
  conteudo: string | null;
  tipo: string;
  autorNome: string | null;
  direcao: "IN" | "OUT";
  hora: string;
} | null;

type Grupo = {
  id: string;
  jid: string;
  nome: string | null;
  fotoUrl: string | null;
  instancia: string;
  ultimaMensagemEm: string | null;
  totalMensagens: number;
  ultimaMensagem: UltimaMensagem;
};

type MensagemGrupo = {
  id: string;
  direcao: "IN" | "OUT";
  tipo: string;
  conteudo: string | null;
  mediaUrl: string | null;
  autorJid: string | null;
  autorNome: string | null;
  hora: string;
};

const TIPOS_MIDIA = new Set(["IMAGEM", "VIDEO", "AUDIO", "DOCUMENTO"]);

// Legenda placeholder gerada na ingestao ("[imagem]"...): nao exibir como texto.
const RE_PLACEHOLDER =
  /^\[(imagem|video|audio|documento|figurinha|localizacao|contato|contatos)\]/i;
function legendaReal(conteudo: string | null): string | null {
  if (!conteudo) return null;
  const t = conteudo.trim();
  return t && !RE_PLACEHOLDER.test(t) ? t : null;
}

const ROTULO_TIPO: Record<string, string> = {
  AUDIO: "Audio",
  IMAGEM: "Imagem",
  VIDEO: "Video",
  DOCUMENTO: "Documento",
  OUTRO: "Mensagem",
};

function previa(m: UltimaMensagem): string {
  if (!m) return "Sem mensagens ainda";
  const corpo = m.conteudo?.trim() || ROTULO_TIPO[m.tipo] || "Mensagem";
  const autor = m.direcao === "OUT" ? "Voce" : m.autorNome;
  return autor ? `${autor}: ${corpo}` : corpo;
}

function nomeGrupo(g: { nome: string | null; jid: string }): string {
  return g.nome?.trim() || "Grupo sem nome";
}

export function ChatInterno() {
  const toast = useToast();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selecionado;

  const carregarGrupos = useCallback(async () => {
    try {
      const r = await fetch("/api/interno/grupos");
      if (r.ok) setGrupos((await r.json()).grupos ?? []);
    } catch {
      // silencioso: a lista apenas nao atualiza
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarGrupos();
  }, [carregarGrupos]);

  // Tempo real: eventos dedicados dos grupos (nao interferem no inbox).
  useEffect(() => {
    const socket = getSocket();
    const onMensagem = () => void carregarGrupos();
    const onAtualizado = () => void carregarGrupos();
    const onRemovido = (e: { grupoId: string }) => {
      setGrupos((prev) => prev.filter((g) => g.id !== e.grupoId));
      if (selRef.current === e.grupoId) setSelecionado(null);
    };
    socket.on("grupo:mensagem", onMensagem);
    socket.on("grupo:atualizado", onAtualizado);
    socket.on("grupo:removido", onRemovido);
    return () => {
      socket.off("grupo:mensagem", onMensagem);
      socket.off("grupo:atualizado", onAtualizado);
      socket.off("grupo:removido", onRemovido);
    };
  }, [carregarGrupos]);

  const grupoAtual = useMemo(
    () => grupos.find((g) => g.id === selecionado) ?? null,
    [grupos, selecionado],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Cabecalho da secao: deixa explicito que e area interna. */}
      <header className="flex shrink-0 items-center gap-2 border-b border-black/5 bg-white px-5 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tiffany/10 text-tiffany">
          <MessagesSquare className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-sm font-semibold text-escuro">Sixxis</h1>
          <p className="text-xs text-medio/60">
            Comunicacao interna — grupos da empresa
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Lista de grupos */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-black/5 bg-white">
          <div className="scroll-fino min-h-0 flex-1 overflow-y-auto p-2">
            {carregando ? (
              <ListaSkeleton />
            ) : grupos.length === 0 ? (
              <VazioLista />
            ) : (
              grupos.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelecionado(g.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    g.id === selecionado
                      ? "bg-tiffany/10"
                      : "hover:bg-black/5"
                  }`}
                >
                  <AvatarCliente
                    nome={nomeGrupo(g)}
                    telefone={g.jid}
                    fotoUrl={g.fotoUrl}
                    tamanho={40}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium text-escuro">
                        {nomeGrupo(g)}
                      </p>
                      {g.ultimaMensagemEm && (
                        <span className="shrink-0 text-[10px] text-medio/50">
                          {horaCurta(g.ultimaMensagemEm)}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-medio/60">
                      {previa(g.ultimaMensagem)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Conversa do grupo */}
        <div className="flex min-w-0 flex-1 flex-col bg-fundo">
          {grupoAtual ? (
            <ThreadGrupo
              grupo={grupoAtual}
              onAcao={() => void carregarGrupos()}
              toast={toast}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-medio/50">
              <MessagesSquare className="h-8 w-8 text-medio/30" />
              <p className="max-w-xs text-sm">
                Selecione um grupo para ver as mensagens.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Conversa de um grupo ----
function ThreadGrupo({
  grupo,
  onAcao,
  toast,
}: {
  grupo: Grupo;
  onAcao: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [mensagens, setMensagens] = useState<MensagemGrupo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmarSair, setConfirmarSair] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/interno/grupos/${grupo.id}/mensagens`);
      if (r.ok) setMensagens((await r.json()).mensagens ?? []);
    } catch {
      // silencioso
    } finally {
      setCarregando(false);
    }
  }, [grupo.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Ao vivo: novas mensagens deste grupo E atualizacoes (midia persistida).
  useEffect(() => {
    const socket = getSocket();
    const recarregar = (e: { grupoId: string }) => {
      if (e.grupoId !== grupo.id) return;
      void (async () => {
        const r = await fetch(`/api/interno/grupos/${grupo.id}/mensagens`);
        if (r.ok) setMensagens((await r.json()).mensagens ?? []);
      })();
    };
    socket.on("grupo:mensagem", recarregar);
    socket.on("grupo:atualizado", recarregar);
    return () => {
      socket.off("grupo:mensagem", recarregar);
      socket.off("grupo:atualizado", recarregar);
    };
  }, [grupo.id]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens, carregando]);

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/interno/grupos/${grupo.id}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: t }),
      });
      if (r.ok) {
        setTexto("");
        await carregar();
        onAcao();
      } else {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel enviar.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setEnviando(false);
    }
  }

  async function arquivar() {
    try {
      const r = await fetch(`/api/interno/grupos/${grupo.id}/arquivar`, {
        method: "POST",
      });
      if (r.ok) {
        toast.sucesso("Grupo arquivado (oculto da lista).");
        onAcao();
      } else {
        toast.erro("Nao foi possivel arquivar.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    }
  }

  async function sair() {
    setSaindo(true);
    try {
      const r = await fetch(`/api/interno/grupos/${grupo.id}/sair`, {
        method: "POST",
      });
      if (r.ok) {
        toast.sucesso("Voce saiu do grupo.");
        setConfirmarSair(false);
        onAcao();
      } else {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel sair do grupo.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setSaindo(false);
    }
  }

  const blocos = agruparPorDia(mensagens);

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Cabecalho do grupo + acoes */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/5 bg-white px-4">
        <AvatarCliente
          nome={nomeGrupo(grupo)}
          telefone={grupo.jid}
          fotoUrl={grupo.fotoUrl}
          tamanho={36}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-escuro">
            {nomeGrupo(grupo)}
          </p>
          <p className="flex items-center gap-1 truncate text-xs text-medio/60">
            <Users2 className="h-3 w-3" /> Grupo interno · {grupo.instancia}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => void arquivar()}
            title="Arquivar (ocultar da lista, sem sair do grupo)"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-medio/70 transition-colors hover:bg-black/5 hover:text-escuro"
          >
            <Archive className="h-3.5 w-3.5" /> Arquivar
          </button>
          <button
            onClick={() => setConfirmarSair(true)}
            title="Sair do grupo no WhatsApp"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-erro transition-colors hover:bg-erro/10"
          >
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </div>
      </header>

      {/* Modal de confirmacao de saida */}
      {confirmarSair && (
        <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="modal-in w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-erro" />
              <h3 className="text-sm font-semibold text-escuro">
                Sair do grupo
              </h3>
            </div>
            <p className="text-sm text-medio/80">
              Voce vai sair do grupo{" "}
              <strong className="text-escuro">{nomeGrupo(grupo)}</strong> no
              WhatsApp. O grupo tambem sera removido desta lista. Confirmar?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmarSair(false)}
                disabled={saindo}
                className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
              >
                Cancelar
              </button>
              <button
                onClick={() => void sair()}
                disabled={saindo}
                className="flex items-center gap-1.5 rounded-lg bg-erro px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
              >
                {saindo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                Sair do grupo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox de imagem */}
      {lightbox && (
        <div
          className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            aria-label="Fechar"
            className="absolute right-4 top-4 rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Imagem"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
          />
        </div>
      )}

      {/* Mensagens */}
      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {carregando ? (
          <ThreadSkeleton />
        ) : mensagens.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-medio/50">
              Nenhuma mensagem neste grupo ainda.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {blocos.map((bloco, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-center">
                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-medio/60 shadow-sm">
                    {bloco.dia}
                  </span>
                </div>
                {bloco.itens.map((m) => (
                  <BolhaGrupo key={m.id} m={m} onAbrirImagem={setLightbox} />
                ))}
              </div>
            ))}
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {/* Compositor */}
      <div className="flex items-end gap-2 border-t border-black/5 bg-white p-2.5">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          rows={1}
          placeholder="Mensagem para o grupo..."
          className="scroll-fino max-h-28 flex-1 resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
        />
        <button
          onClick={() => void enviar()}
          disabled={enviando || !texto.trim()}
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
  );
}

function BolhaGrupo({
  m,
  onAbrirImagem,
}: {
  m: MensagemGrupo;
  onAbrirImagem: (url: string) => void;
}) {
  const ehOut = m.direcao === "OUT";
  const ehMidia = TIPOS_MIDIA.has(m.tipo);
  const legenda = legendaReal(m.conteudo);
  return (
    <div className={`flex ${ehOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-xl px-3 py-2 text-sm shadow-sm ${
          ehOut
            ? "rounded-br-sm bg-tiffany text-white"
            : "rounded-bl-sm bg-white text-escuro"
        }`}
      >
        {!ehOut && m.autorNome && (
          <p className="mb-0.5 text-[11px] font-semibold text-tiffany-escuro">
            {m.autorNome}
          </p>
        )}
        {ehMidia ? (
          <div className="space-y-1">
            <MidiaGrupo m={m} ehOut={ehOut} onAbrirImagem={onAbrirImagem} />
            {legenda && (
              <span className="block whitespace-pre-wrap break-words">
                {legenda}
              </span>
            )}
          </div>
        ) : (
          <span className="whitespace-pre-wrap break-words">
            {m.conteudo?.trim() || ROTULO_TIPO[m.tipo] || "Mensagem"}
          </span>
        )}
        <span
          className={`mt-1 block text-right text-[10px] ${
            ehOut ? "text-white/70" : "text-medio/50"
          }`}
        >
          {horaCurta(m.hora)}
        </span>
      </div>
    </div>
  );
}

// Renderiza a midia por tipo (imagem/video/audio/documento). Sem mediaUrl ainda
// (persistindo): placeholder discreto — o socket grupo:atualizado troca depois.
function MidiaGrupo({
  m,
  ehOut,
  onAbrirImagem,
}: {
  m: MensagemGrupo;
  ehOut: boolean;
  onAbrirImagem: (url: string) => void;
}) {
  const rotulo = (ROTULO_TIPO[m.tipo] ?? "Midia").toLowerCase();
  if (!m.mediaUrl) {
    return (
      <span
        className={`flex items-center gap-1.5 text-xs italic ${
          ehOut ? "text-white/85" : "text-medio/70"
        }`}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> carregando {rotulo}...
      </span>
    );
  }
  if (m.tipo === "IMAGEM") {
    return (
      <button onClick={() => onAbrirImagem(m.mediaUrl!)} className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={m.mediaUrl}
          alt="Imagem"
          className="max-h-64 w-auto max-w-full rounded-lg object-cover"
        />
      </button>
    );
  }
  if (m.tipo === "VIDEO") {
    return (
      <video
        src={m.mediaUrl}
        controls
        className="max-h-64 w-full max-w-xs rounded-lg"
      />
    );
  }
  if (m.tipo === "AUDIO") {
    return <audio src={m.mediaUrl} controls className="w-56 max-w-full" />;
  }
  // DOCUMENTO
  return (
    <a
      href={m.mediaUrl}
      target="_blank"
      rel="noreferrer"
      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium ${
        ehOut
          ? "bg-white/15 text-white hover:bg-white/25"
          : "bg-fundo text-escuro hover:bg-black/5"
      }`}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate">{legendaReal(m.conteudo) ?? "Documento"}</span>
      <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
    </a>
  );
}

function agruparPorDia(
  mensagens: MensagemGrupo[],
): { dia: string; itens: MensagemGrupo[] }[] {
  const blocos: { dia: string; itens: MensagemGrupo[] }[] = [];
  let chave = "";
  for (const m of mensagens) {
    const k = chaveDia(m.hora);
    if (k !== chave) {
      chave = k;
      blocos.push({ dia: rotuloDia(m.hora), itens: [m] });
    } else {
      blocos[blocos.length - 1].itens.push(m);
    }
  }
  return blocos;
}

function VazioLista() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
      <Users2 className="h-8 w-8 text-medio/30" />
      <p className="text-sm font-medium text-escuro">Nenhum grupo ainda</p>
      <p className="max-w-[16rem] text-xs text-medio/60">
        Os grupos que os numeros da Sixxis participam aparecerao aqui.
      </p>
    </div>
  );
}

function ListaSkeleton() {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2.5 py-2">
          <div className="skeleton h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3 w-28" />
            <div className="skeleton h-2.5 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ThreadSkeleton() {
  const larguras = ["w-40", "w-56", "w-32", "w-48"];
  return (
    <div className="space-y-3">
      {larguras.map((w, i) => (
        <div
          key={i}
          className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
        >
          <div className={`skeleton h-10 ${w} rounded-xl`} />
        </div>
      ))}
    </div>
  );
}
