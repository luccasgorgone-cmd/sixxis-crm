"use client";

// Coluna central: cabecalho do contato, mensagens (bolhas) e o compositor.
import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Mic,
  Image as ImageIcon,
  Video as VideoIcon,
  FileText,
  Bot,
  User as UserIcon,
  Trash2,
  Ban,
  Eye,
  Smile,
  Loader2,
  RefreshCw,
  Download,
  AlertTriangle,
} from "lucide-react";
import type { ConversaItem, MensagemItem } from "./tipos";
import { Compositor } from "./Compositor";
import { useToast } from "@/components/ui/Toast";
import { BadgeFinalidade } from "@/components/BadgeFinalidade";
import { AvatarCliente } from "@/components/AvatarCliente";
import {
  horaCurta,
  rotuloDia,
  chaveDia,
  formatarTelefone,
} from "@/lib/format";

export function Thread({
  conversa,
  mensagens,
  carregando,
  onEnviada,
  onExcluida,
  somenteLeitura = false,
  ehAdmin = false,
  embutida = false,
}: {
  conversa: ConversaItem;
  mensagens: MensagemItem[];
  carregando: boolean;
  onEnviada?: (msg: MensagemItem) => void;
  onExcluida?: () => void;
  somenteLeitura?: boolean;
  ehAdmin?: boolean;
  // Quando embutida no painel do Kanban, o nome/avatar e a finalidade ja
  // aparecem na barra do painel; o cabecalho fica slim (so telefone/instancia,
  // selo IA/Humano e excluir) para nao repetir o nome do cliente.
  embutida?: boolean;
}) {
  const fimRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  async function excluirConversa() {
    setExcluindo(true);
    try {
      const r = await fetch(`/api/conversas/${conversa.id}`, { method: "DELETE" });
      if (r.ok) {
        toast.sucesso("Conversa excluida.");
        setConfirmarExcluir(false);
        onExcluida?.();
      } else {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel excluir.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setExcluindo(false);
    }
  }

  // Auto-scroll para o fim quando chegam/abrem mensagens.
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens, carregando]);

  const nome = conversa.leadNome?.trim() || conversa.leadTelefone;

  // Selo IA/Humano e botao excluir: unicos deste cabecalho (nao existem na barra
  // do painel), reusados tanto no cabecalho completo quanto no slim (embutido).
  const seloAtendimento = (
    <span
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        conversa.atendidoPor === "IA"
          ? "bg-tiffany/10 text-tiffany"
          : "bg-medio/10 text-medio"
      }`}
    >
      {conversa.atendidoPor === "IA" ? (
        <Bot className="h-3.5 w-3.5" />
      ) : (
        <UserIcon className="h-3.5 w-3.5" />
      )}
      {conversa.atendidoPor === "IA" ? "IA" : "Humano"}
    </span>
  );

  // Exclusao da conversa: SOMENTE admin (o endpoint tambem barra).
  const botaoExcluir = ehAdmin ? (
    <button
      onClick={() => setConfirmarExcluir(true)}
      title="Excluir conversa (permanente)"
      aria-label="Excluir conversa"
      className="shrink-0 rounded-lg p-1.5 text-medio/60 transition-colors hover:bg-erro/10 hover:text-erro"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  ) : null;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-fundo">
      {/* Cabecalho: slim quando embutido no painel (nome/avatar/finalidade ja
          aparecem na barra do painel); completo no uso standalone (Inbox). */}
      {embutida ? (
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-black/5 bg-white px-4">
          <p className="min-w-0 flex-1 truncate text-xs text-medio/60">
            {formatarTelefone(conversa.leadTelefone)}
            {conversa.instanciaNome ? ` · ${conversa.instanciaNome}` : ""}
          </p>
          {seloAtendimento}
          {botaoExcluir}
        </header>
      ) : (
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/5 bg-white px-4">
          <AvatarCliente
            nome={conversa.leadNome}
            telefone={conversa.leadTelefone}
            fotoUrl={conversa.leadFoto}
            tamanho={36}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-escuro">{nome}</p>
            <p className="truncate text-xs text-medio/60">
              {formatarTelefone(conversa.leadTelefone)}
              {conversa.instanciaNome ? ` · ${conversa.instanciaNome}` : ""}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {conversa.finalidade && (
              <BadgeFinalidade
                finalidade={conversa.finalidade}
                className="px-2.5 py-1 text-xs"
              />
            )}
            {seloAtendimento}
            {botaoExcluir}
          </div>
        </header>
      )}

      {/* Modal de confirmacao de exclusao (irreversivel). */}
      {confirmarExcluir && (
        <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="modal-in scroll-fino max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-erro" />
              <h3 className="text-sm font-semibold text-escuro">Excluir conversa</h3>
            </div>
            <p className="text-sm text-medio/80">
              Tem certeza? Esta acao remove{" "}
              <strong className="text-escuro">PERMANENTEMENTE</strong> este
              atendimento: a conversa e suas{" "}
              <strong className="text-escuro">{mensagens.length}</strong>{" "}
              mensagem(ns), alem do cliente e seus negocios (some do Inbox,
              Kanban, Carteira e Clientes). Nao pode ser desfeita.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmarExcluir(false)}
                disabled={excluindo}
                className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
              >
                Cancelar
              </button>
              <button
                onClick={() => void excluirConversa()}
                disabled={excluindo}
                className="flex items-center gap-1.5 rounded-lg bg-erro px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
              >
                {excluindo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Excluir permanentemente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mensagens */}
      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {carregando ? (
          <SkeletonThread />
        ) : mensagens.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-medio/50">
              Nenhuma mensagem ainda. Comece a conversa.
            </p>
          </div>
        ) : (
          <ListaMensagens
            mensagens={mensagens}
            ehAdmin={ehAdmin}
            podeApagar={!somenteLeitura}
          />
        )}
        <div ref={fimRef} />
      </div>

      {somenteLeitura ? (
        <div className="border-t border-black/5 bg-white px-4 py-3 text-center text-xs text-medio/50">
          Modo inspecao (somente leitura)
        </div>
      ) : (
        <Compositor
          conversaId={conversa.id}
          onEnviada={onEnviada ?? (() => undefined)}
          ehAdmin={ehAdmin}
          finalidade={conversa.finalidade}
          instanciaIdAtual={conversa.instanciaId}
          lead={{
            nomeEfetivo: conversa.leadNome?.trim() || conversa.leadTelefone,
          }}
        />
      )}
    </div>
  );
}

function ListaMensagens({
  mensagens,
  ehAdmin,
  podeApagar,
}: {
  mensagens: MensagemItem[];
  ehAdmin: boolean;
  podeApagar: boolean;
}) {
  const blocos: { dia: string; itens: MensagemItem[] }[] = [];
  let chaveAtual = "";
  for (const m of mensagens) {
    const k = chaveDia(m.hora);
    if (k !== chaveAtual) {
      chaveAtual = k;
      blocos.push({ dia: rotuloDia(m.hora), itens: [m] });
    } else {
      blocos[blocos.length - 1].itens.push(m);
    }
  }

  return (
    <div className="space-y-4">
      {blocos.map((bloco, i) => (
        <div key={i} className="space-y-2">
          <div className="flex justify-center">
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-medio/60 shadow-sm">
              {bloco.dia}
            </span>
          </div>
          {bloco.itens.map((m) => (
            <Bolha key={m.id} mensagem={m} ehAdmin={ehAdmin} podeApagar={podeApagar} />
          ))}
        </div>
      ))}
    </div>
  );
}

const ICONE_MIDIA: Record<string, typeof Mic> = {
  AUDIO: Mic,
  IMAGEM: ImageIcon,
  VIDEO: VideoIcon,
  DOCUMENTO: FileText,
};
const ROTULO_MIDIA: Record<string, string> = {
  AUDIO: "Mensagem de audio",
  IMAGEM: "Imagem",
  VIDEO: "Video",
  DOCUMENTO: "Documento",
  OUTRO: "Mensagem",
};

const TIPOS_MIDIA = new Set(["IMAGEM", "VIDEO", "AUDIO", "DOCUMENTO"]);

// Legenda placeholder gerada na ingestao ("[imagem]", "[audio]"...): nao deve
// ser exibida como texto/legenda real do cliente.
const RE_PLACEHOLDER = /^\[(imagem|video|audio|documento|figurinha|localizacao|contato|contatos)\]/i;

// Emojis de reacao padrao do WhatsApp.
const EMOJIS_REACAO = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
function legendaReal(conteudo: string | null): string | null {
  if (!conteudo) return null;
  const t = conteudo.trim();
  return t && !RE_PLACEHOLDER.test(t) ? t : null;
}

function Bolha({
  mensagem,
  ehAdmin,
  podeApagar,
}: {
  mensagem: MensagemItem;
  ehAdmin: boolean;
  podeApagar: boolean;
}) {
  const toast = useToast();
  const ehOut = mensagem.direcao === "OUT";
  const ehTipoMidia = TIPOS_MIDIA.has(mensagem.tipo);
  const legenda = legendaReal(mensagem.conteudo);

  // Estado local de apagamento (otimista) + expandir original (admin).
  const [apagadaLocal, setApagadaLocal] = useState(false);
  const [verOriginal, setVerOriginal] = useState(false);
  const [apagando, setApagando] = useState(false);
  // mediaUrl pode chegar depois (socket) ou via reprocessamento manual (admin).
  const [mediaLocal, setMediaLocal] = useState<string | null>(null);
  const mediaUrl = mensagem.mediaUrl || mediaLocal;
  const apagada = mensagem.apagada || apagadaLocal;
  const apagadaPor = mensagem.apagadaPor ?? (apagadaLocal ? "COLABORADOR" : null);

  // Reacao (emoji) — otimista. reacaoLocal=undefined => usa a da mensagem.
  const [reacaoLocal, setReacaoLocal] = useState<string | null | undefined>(undefined);
  const [pickerReacao, setPickerReacao] = useState(false);
  const [reagindo, setReagindo] = useState(false);
  const reacao = reacaoLocal !== undefined ? reacaoLocal : mensagem.reacao ?? null;
  const reacaoCliente = mensagem.reacaoDeCliente ?? null;
  // Reagir a mensagens nao apagadas (o backend valida o id real do WhatsApp).
  const podeReagir = !apagada;

  async function reagir(emoji: string) {
    if (reagindo) return;
    setPickerReacao(false);
    setReagindo(true);
    const anterior = reacao;
    // Otimista (toggle): mesmo emoji remove.
    setReacaoLocal(anterior === emoji ? null : emoji);
    try {
      const r = await fetch(`/api/mensagens/${mensagem.id}/reagir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (r.ok) {
        const d = await r.json().catch(() => null);
        setReacaoLocal(d?.reacao ?? null);
      } else {
        setReacaoLocal(anterior); // reverte
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel reagir.");
      }
    } catch {
      setReacaoLocal(anterior);
      toast.erro("Falha de conexao.");
    } finally {
      setReagindo(false);
    }
  }

  // So pode revogar a propria mensagem enviada, recente e ainda nao apagada.
  const podeRevogar =
    podeApagar &&
    ehOut &&
    !apagada &&
    (mensagem.statusEnvio === "ENVIADA" || mensagem.statusEnvio === "ENTREGUE");

  async function apagar() {
    setApagando(true);
    try {
      const r = await fetch(`/api/mensagens/${mensagem.id}/apagar`, {
        method: "POST",
      });
      if (r.ok) {
        setApagadaLocal(true);
        toast.sucesso("Mensagem apagada para o cliente.");
      } else {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel apagar.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setApagando(false);
    }
  }

  const rotuloApagada =
    apagadaPor === "CLIENTE"
      ? "Mensagem apagada pelo cliente"
      : "Mensagem apagada";

  return (
    <div
      className={`group flex items-center gap-1.5 ${ehOut ? "justify-end" : "justify-start"} ${
        reacao || reacaoCliente ? "mb-2.5" : ""
      }`}
    >
      {/* Acoes auxiliares (reagir / apagar) — aparecem no hover. */}
      {podeReagir && (
        <div className="relative order-1 shrink-0">
          <button
            onClick={() => setPickerReacao((v) => !v)}
            disabled={reagindo}
            title="Reagir"
            aria-label="Reagir"
            className="rounded-full p-1 text-medio/40 opacity-0 transition-opacity hover:bg-black/5 hover:text-tiffany group-hover:opacity-100"
          >
            {reagindo ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Smile className="h-3.5 w-3.5" />
            )}
          </button>
          {pickerReacao && (
            <div className="absolute bottom-full left-1/2 z-20 mb-1 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-black/10 bg-white px-1.5 py-1 shadow-lg">
              {EMOJIS_REACAO.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => void reagir(e)}
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none transition-transform hover:scale-125 ${
                    reacao === e ? "bg-tiffany/15" : "hover:bg-fundo"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Acao apagar (so na propria mensagem enviada) */}
      {podeRevogar && (
        <button
          onClick={() => void apagar()}
          disabled={apagando}
          title="Apagar para todos"
          aria-label="Apagar para todos"
          className="order-1 shrink-0 rounded-full p-1 text-medio/40 opacity-0 transition-opacity hover:bg-black/5 hover:text-erro group-hover:opacity-100"
        >
          {apagando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      <div
        className={`relative order-2 max-w-[75%] rounded-xl px-3 py-2 text-sm shadow-sm ${
          apagada
            ? "border border-dashed border-black/15 bg-black/5 text-medio/70"
            : ehOut
              ? "rounded-br-sm bg-tiffany text-white"
              : "rounded-bl-sm bg-white text-escuro"
        }`}
      >
        {/* Selo da(s) reacao(oes), sobreposto na borda inferior (estilo WhatsApp).
            A do cliente e a nossa; ambas podem coexistir. */}
        {(reacao || reacaoCliente) && (
          <span
            className={`absolute -bottom-2.5 flex items-center gap-0.5 rounded-full border border-black/10 bg-white px-1 py-0.5 text-xs shadow-sm dark:bg-white ${
              ehOut ? "right-1.5" : "left-1.5"
            }`}
          >
            {reacaoCliente && <span title="Reacao do cliente">{reacaoCliente}</span>}
            {reacao && <span title="Sua reacao">{reacao}</span>}
          </span>
        )}
        {apagada ? (
          <div>
            <span className="flex items-center gap-1.5 italic text-medio/60">
              <Ban className="h-3.5 w-3.5" /> {rotuloApagada}
            </span>
            {/* Conteudo original visivel apenas ao ADMIN (auditoria). */}
            {ehAdmin && (mensagem.conteudo || mensagem.apagadaEm) && (
              <div className="mt-1">
                <button
                  onClick={() => setVerOriginal((v) => !v)}
                  className="flex items-center gap-1 text-[11px] font-medium text-medio/60 hover:text-escuro"
                >
                  <Eye className="h-3 w-3" />
                  {verOriginal ? "Ocultar" : "Ver conteudo original (admin)"}
                </button>
                {verOriginal && (
                  <div className="mt-1 rounded-md bg-white/70 p-2 text-xs text-escuro">
                    <p className="whitespace-pre-wrap break-words">
                      {mensagem.conteudo || ROTULO_MIDIA[mensagem.tipo] || "—"}
                    </p>
                    {mensagem.apagadaEm && (
                      <p className="mt-1 text-[10px] text-medio/50">
                        {apagadaPor === "CLIENTE" ? "Pelo cliente" : "Pelo colaborador"}{" "}
                        em {horaCurta(mensagem.apagadaEm)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : ehTipoMidia ? (
          <div className="space-y-1">
            <Midia
              mensagem={mensagem}
              mediaUrl={mediaUrl}
              ehOut={ehOut}
              ehAdmin={ehAdmin}
              onRecarregada={(url) => setMediaLocal(url)}
            />
            {legenda && (
              <span className="block whitespace-pre-wrap break-words">
                {legenda}
              </span>
            )}
          </div>
        ) : (
          <span className="whitespace-pre-wrap break-words">
            {mensagem.conteudo}
          </span>
        )}

        <span
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
            apagada ? "text-medio/40" : ehOut ? "text-white/70" : "text-medio/50"
          }`}
        >
          {/* Selo interno: mensagem enviada pela Luna (IA). So a equipe ve. */}
          {ehOut && mensagem.viaIA && (
            <span
              className="flex items-center gap-0.5 font-medium opacity-90"
              title="Enviada automaticamente pela Sol (IA)"
            >
              <Bot className="h-3 w-3" /> Sol ·
            </span>
          )}
          {/* Numero (instancia) por onde a mensagem entrou/saiu. */}
          {mensagem.instanciaRotulo && (
            <span className="truncate opacity-80" title={`Numero: ${mensagem.instanciaRotulo}`}>
              {mensagem.instanciaRotulo} ·
            </span>
          )}
          {horaCurta(mensagem.hora)}
          {ehOut && !apagada && <StatusEnvio status={mensagem.statusEnvio} />}
        </span>
      </div>
    </div>
  );
}

// Renderiza a midia exibivel (R2) por tipo. Sem mediaUrl: mostra placeholder e,
// para ADMIN, o botao "Recarregar midia" (reprocessa download+upload).
function Midia({
  mensagem,
  mediaUrl,
  ehOut,
  ehAdmin,
  onRecarregada,
}: {
  mensagem: MensagemItem;
  mediaUrl: string | null | undefined;
  ehOut: boolean;
  ehAdmin: boolean;
  onRecarregada: (url: string) => void;
}) {
  const toast = useToast();
  const [recarregando, setRecarregando] = useState(false);
  const IconeMidia = ICONE_MIDIA[mensagem.tipo];

  async function recarregar() {
    setRecarregando(true);
    try {
      const r = await fetch(`/api/mensagens/${mensagem.id}/reprocessar-midia`, {
        method: "POST",
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.mediaUrl) {
        onRecarregada(d.mediaUrl as string);
        toast.sucesso("Midia recuperada.");
      } else {
        toast.erro(d?.erro ?? "Nao foi possivel recuperar a midia.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setRecarregando(false);
    }
  }

  if (mediaUrl) {
    if (mensagem.tipo === "IMAGEM") {
      return (
        <a href={mediaUrl} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt={ROTULO_MIDIA[mensagem.tipo] ?? "Imagem"}
            className="max-h-72 w-auto max-w-full rounded-lg object-cover"
          />
        </a>
      );
    }
    if (mensagem.tipo === "VIDEO") {
      return (
        <video
          src={mediaUrl}
          controls
          className="max-h-72 w-full max-w-xs rounded-lg"
        />
      );
    }
    if (mensagem.tipo === "AUDIO") {
      return <audio src={mediaUrl} controls className="w-56 max-w-full" />;
    }
    // DOCUMENTO
    return (
      <a
        href={mediaUrl}
        target="_blank"
        rel="noreferrer"
        className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium ${
          ehOut ? "bg-white/15 text-white hover:bg-white/25" : "bg-fundo text-escuro hover:bg-black/5"
        }`}
      >
        <FileText className="h-4 w-4 shrink-0" />
        <span className="truncate">{legendaReal(mensagem.conteudo) ?? "Documento"}</span>
        <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
      </a>
    );
  }

  // Sem mediaUrl: placeholder + (admin) recarregar.
  return (
    <div className="space-y-1.5">
      <span
        className={`flex items-center gap-2 italic ${
          ehOut ? "text-white/90" : "text-medio/70"
        }`}
      >
        {IconeMidia && <IconeMidia className="h-4 w-4" />}
        {ROTULO_MIDIA[mensagem.tipo] ?? "Mensagem"}
      </span>
      {ehAdmin && (
        <button
          onClick={() => void recarregar()}
          disabled={recarregando}
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium ${
            ehOut
              ? "bg-white/15 text-white hover:bg-white/25"
              : "bg-black/5 text-medio hover:bg-black/10"
          } disabled:opacity-60`}
        >
          {recarregando ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Recarregar midia
        </button>
      )}
    </div>
  );
}

function StatusEnvio({ status }: { status: MensagemItem["statusEnvio"] }) {
  switch (status) {
    case "ENVIANDO":
      return <Clock className="h-3 w-3" />;
    case "ENVIADA":
      return <Check className="h-3 w-3" />;
    case "ENTREGUE":
      return <CheckCheck className="h-3 w-3" />;
    case "ERRO":
      return <AlertCircle className="h-3 w-3 text-red-200" />;
    default:
      return null;
  }
}

function SkeletonThread() {
  const larguras = ["w-40", "w-56", "w-32", "w-48", "w-44"];
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
