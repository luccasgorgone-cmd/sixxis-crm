"use client";

// Coluna central: cabecalho do contato, mensagens (bolhas) e o compositor.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useClickFora } from "@/lib/useClickFora";
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
  Pencil,
  X,
  Copy,
  Reply,
  Forward,
  MessageCircle,
} from "lucide-react";
import type { ConversaItem, MensagemItem, Finalidade } from "./tipos";
import { Compositor, type ViaOtimista } from "./Compositor";
import { PlayerAudio } from "./PlayerAudio";
import {
  novoClientId,
  criarBolhaOtimista,
  enviarTextoOtimista,
  ehTmp,
} from "@/lib/otimista";
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
  otimista,
}: {
  conversa: ConversaItem;
  mensagens: MensagemItem[];
  carregando: boolean;
  onEnviada?: (msg: MensagemItem) => void;
  onExcluida?: () => void;
  somenteLeitura?: boolean;
  ehAdmin?: boolean;
  // Via de render otimista do texto (Fatia 3.11): repassada ao Compositor e usada
  // pelo Reenviar. Ausente em usos somente-leitura (InspecaoConversa).
  otimista?: ViaOtimista;
  // Quando embutida no painel do Kanban, o nome/avatar e a finalidade ja
  // aparecem na barra do painel; o cabecalho fica slim (so telefone/instancia,
  // selo IA/Humano e excluir) para nao repetir o nome do cliente.
  embutida?: boolean;
}) {
  const fimRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  // Reply: mensagem sendo respondida (citada no compositor). Fatia 2.85.
  const [respondendoA, setRespondendoA] = useState<MensagemItem | null>(null);
  // Forward: mensagem sendo encaminhada (abre o seletor de conversa).
  const [encaminhando, setEncaminhando] = useState<MensagemItem | null>(null);

  // Troca de conversa: zera reply/forward/confirmacao pendentes — sao mensagens da
  // conversa ANTERIOR e nao devem vazar para a nova (o Thread nao remonta ao trocar
  // de conversa no Inbox). Fatia 3.20.
  useEffect(() => {
    setRespondendoA(null);
    setEncaminhando(null);
    setConfirmarExcluir(false);
  }, [conversa.id]);

  // Rola ate a mensagem citada (clique na citacao), destacando-a brevemente.
  function irParaMensagem(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-tiffany/50");
      setTimeout(() => el.classList.remove("ring-2", "ring-tiffany/50"), 1600);
    }
  }

  // Reenvia uma mensagem OUT que falhou (statusEnvio ERRO). Cria um NOVO envio
  // com o mesmo texto, tambem otimista (Fatia 3.11): a nova bolha "enviando"
  // aparece na hora. Se a bolha antiga era TEMPORARIA (client-only, ex.: rede
  // caiu), ela some; se era REAL persistida como ERRO, permanece (um refetch a
  // traria de volta). Sem via otimista (nao ocorre no Inbox/Kanban), cai no
  // reenvio simples de 2.89-C.
  async function reenviar(m: MensagemItem) {
    const texto = (m.conteudo ?? "").trim();
    if (!texto) return;

    if (!otimista) {
      try {
        const r = await fetch("/api/mensagens/enviar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversaId: conversa.id, texto }),
        });
        const d = await r.json().catch(() => null);
        if (r.ok && d?.mensagem) onEnviada?.(d.mensagem as MensagemItem);
        else toast.erro(d?.erro ?? "Nao foi possivel reenviar.");
      } catch {
        toast.erro("Falha de conexao.");
      }
      return;
    }

    if (ehTmp(m.id)) otimista.falhar(m.id, true);
    const clientId = novoClientId();
    otimista.adicionar(
      criarBolhaOtimista({ clientId, texto, hora: new Date().toISOString() }),
    );
    const res = await enviarTextoOtimista(otimista, clientId, {
      conversaId: conversa.id,
      texto,
      clientId,
    });
    if (res.tipo === "sem-bolha" || res.tipo === "erro-persistido") {
      toast.erro(res.erro ?? "Nao foi possivel reenviar.");
    } else if (res.tipo === "rede") {
      toast.erro("Falha de conexao.");
    }
  }

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

  // Troca de conversa: limpa o alvo de resposta/encaminhamento (nao vaza entre
  // conversas — o Thread nao remonta ao trocar de conversa no Inbox). Fatia 2.85.
  useEffect(() => {
    setRespondendoA(null);
    setEncaminhando(null);
  }, [conversa.id]);

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
            expandivel
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
            onResponder={somenteLeitura ? undefined : setRespondendoA}
            onEncaminhar={setEncaminhando}
            onIrParaMensagem={irParaMensagem}
            onReenviar={somenteLeitura ? undefined : reenviar}
            finalidade={conversa.finalidade}
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
          instanciaRespostaId={conversa.instanciaRespostaId}
          lead={{
            nomeEfetivo: conversa.leadNome?.trim() || conversa.leadTelefone,
          }}
          respondendoA={respondendoA}
          onCancelarResposta={() => setRespondendoA(null)}
          otimista={otimista}
        />
      )}

      {encaminhando && (
        <ModalEncaminhar
          mensagemId={encaminhando.id}
          onFechar={() => setEncaminhando(null)}
        />
      )}
    </div>
  );
}

function ListaMensagens({
  mensagens,
  ehAdmin,
  podeApagar,
  onResponder,
  onEncaminhar,
  onIrParaMensagem,
  onReenviar,
  finalidade,
}: {
  mensagens: MensagemItem[];
  ehAdmin: boolean;
  podeApagar: boolean;
  onResponder?: (m: MensagemItem) => void;
  onEncaminhar?: (m: MensagemItem) => void;
  onIrParaMensagem?: (id: string) => void;
  onReenviar?: (m: MensagemItem) => void;
  finalidade?: Finalidade;
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
            <Bolha
              key={m.id}
              mensagem={m}
              ehAdmin={ehAdmin}
              podeApagar={podeApagar}
              onResponder={onResponder}
              onEncaminhar={onEncaminhar}
              onIrParaMensagem={onIrParaMensagem}
              onReenviar={onReenviar}
              finalidade={finalidade}
            />
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

// A URL CRUA do WhatsApp (mmg.whatsapp.net / .enc) e criptografada/temporaria e
// NAO renderiza no browser — so a URL do R2 e exibivel. Usado para nunca tentar
// carregar a URL crua (evita imagem quebrada / pagina de erro). Fatia 2.83.
function ehUrlRenderavel(url?: string | null): boolean {
  if (!url) return false;
  return !/whatsapp\.net/i.test(url) && !/\.enc(\?|#|$)/i.test(url);
}

// Popover de reacao renderizado em PORTAL (document.body) com posicao fixa.
// Assim ele NUNCA e cortado pelo overflow do container (o drawer do Kanban tem
// rolagem propria que clipava o popover). Abre acima da ancora; se nao couber,
// abre abaixo; e sempre preso a viewport na horizontal (os 6 emojis inteiros).
// data-popover-reacao marca o no para o "clicar fora" ignorar cliques internos.
function PopoverReacao({
  anchorRef,
  reacaoAtual,
  onEscolher,
  onFechar,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  reacaoAtual: string | null;
  onEscolher: (emoji: string) => void;
  onFechar: () => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const ancora = anchorRef.current;
    const pop = popRef.current;
    if (!ancora || !pop) return;
    const a = ancora.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    const margem = 8;
    // Horizontal: centralizado na ancora, preso a viewport (nada corta).
    let left = a.left + a.width / 2 - p.width / 2;
    left = Math.max(margem, Math.min(left, window.innerWidth - p.width - margem));
    // Vertical: abre acima; se nao couber, abre abaixo.
    let top = a.top - p.height - 6;
    if (top < margem) top = a.bottom + 6;
    setPos({ top, left });
  }, [anchorRef]);

  // Rolar/redimensionar a pagina desprende a posicao fixa: fecha (estilo WhatsApp).
  useEffect(() => {
    const fechar = () => onFechar();
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [onFechar]);

  // Clicar fora do popover (na conversa, em outra bolha, etc.) fecha. O proprio
  // botao-gatilho e ignorado para poder alternar sem reabrir.
  useClickFora(onFechar, true, [popRef, anchorRef]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={popRef}
      data-popover-reacao
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
      className="z-50 flex items-center gap-0.5 rounded-full border border-black/10 bg-white px-1.5 py-1 shadow-lg"
    >
      {EMOJIS_REACAO.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onEscolher(e)}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none transition-transform hover:scale-125 ${
            reacaoAtual === e ? "bg-tiffany/15" : "hover:bg-fundo"
          }`}
        >
          {e}
        </button>
      ))}
    </div>,
    document.body,
  );
}

function Bolha({
  mensagem,
  ehAdmin,
  podeApagar,
  onResponder,
  onEncaminhar,
  onIrParaMensagem,
  onReenviar,
  finalidade,
}: {
  mensagem: MensagemItem;
  ehAdmin: boolean;
  podeApagar: boolean;
  onResponder?: (m: MensagemItem) => void;
  onEncaminhar?: (m: MensagemItem) => void;
  onIrParaMensagem?: (id: string) => void;
  onReenviar?: (m: MensagemItem) => void;
  finalidade?: Finalidade;
}) {
  const toast = useToast();
  const ehOut = mensagem.direcao === "OUT";
  // Figurinha: identificada pelo placeholder "[figurinha]" (nova = IMAGEM; antiga
  // = OUTRO). Tem tratamento PROPRIO (componente Figurinha): so exibe a imagem se
  // a mediaUrl for do R2 (renderavel) — senao mostra um placeholder limpo, nunca
  // a URL crua do WhatsApp (que quebra). Fatia 2.83.
  const ehFigurinha = (mensagem.conteudo ?? "").trim() === "[figurinha]";
  // Contato compartilhado (vCard): renderiza como CARD. Fatia 2.85.
  const ehContato = !!mensagem.contatoNome;
  const ehTipoMidia = TIPOS_MIDIA.has(mensagem.tipo) && !ehFigurinha;
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
  const reacaoBtnRef = useRef<HTMLButtonElement>(null);

  // Edicao (estilo WhatsApp) — otimista. conteudoLocal/editadaLocal refletem a
  // edicao antes do refetch; o conteudo exibido usa o local quando presente.
  const [editando, setEditando] = useState(false);
  const [textoEdicao, setTextoEdicao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [conteudoLocal, setConteudoLocal] = useState<string | null>(null);
  const [editadaLocal, setEditadaLocal] = useState(false);
  const conteudoExibido = conteudoLocal !== null ? conteudoLocal : mensagem.conteudo;
  const foiEditada = mensagem.editada === true || editadaLocal;

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

  // Edicao: so mensagens NOSSAS (OUT), de TEXTO, nao apagadas e dentro da janela
  // do WhatsApp (~15 min). O servidor tambem valida (autor/admin + tempo).
  const JANELA_EDICAO_MS = 15 * 60 * 1000;
  const podeEditar =
    podeApagar &&
    ehOut &&
    !apagada &&
    mensagem.tipo === "TEXTO" &&
    Date.now() - new Date(mensagem.hora).getTime() < JANELA_EDICAO_MS;

  function abrirEdicao() {
    setTextoEdicao(conteudoExibido ?? "");
    setEditando(true);
  }

  async function salvarEdicao() {
    const t = textoEdicao.trim();
    if (!t || salvandoEdicao) return;
    if (t === (conteudoExibido ?? "").trim()) {
      setEditando(false);
      return;
    }
    setSalvandoEdicao(true);
    try {
      const r = await fetch(`/api/mensagens/${mensagem.id}/editar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: t }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        setConteudoLocal(t);
        setEditadaLocal(true);
        setEditando(false);
        toast.sucesso("Mensagem editada.");
      } else {
        toast.erro(d?.erro ?? "Nao foi possivel editar.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  const rotuloApagada =
    apagadaPor === "CLIENTE"
      ? "Mensagem apagada pelo cliente"
      : "Mensagem apagada";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(conteudoExibido ?? "");
      toast.sucesso("Mensagem copiada.");
    } catch {
      toast.erro("Nao foi possivel copiar.");
    }
  }

  // Preview curto de uma mensagem citada (reply).
  function previewCitada(c: NonNullable<MensagemItem["citada"]>): string {
    if (c.contatoNome) return `Contato: ${c.contatoNome}`;
    const t = (c.conteudo ?? "").trim();
    if (c.tipo === "IMAGEM") return t && !t.startsWith("[") ? t : "Imagem";
    if (c.tipo === "VIDEO") return "Video";
    if (c.tipo === "AUDIO") return "Audio";
    if (c.tipo === "DOCUMENTO") return t || "Documento";
    return t || "Mensagem";
  }

  const podeCopiar = !apagada && (mensagem.tipo === "TEXTO" || !!legenda);

  return (
    <div
      id={`msg-${mensagem.id}`}
      className={`group flex items-center gap-1.5 rounded-lg transition-shadow ${ehOut ? "justify-end" : "justify-start"} ${
        reacao || reacaoCliente ? "mb-2.5" : ""
      }`}
    >
      {/* Cluster de acoes (estilo WhatsApp) — aparece no hover, no lado INTERNO
          da bolha (voltado ao centro): a ESQUERDA na nossa (OUT, order-1) e a
          DIREITA na do cliente (IN, order-3). Responder, Encaminhar, Copiar,
          Reagir e — so nas nossas — Editar (na janela) e Apagar. */}
      {!apagada && !editando && (
        <div
          className={`flex shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100 ${
            ehOut ? "order-1" : "order-3"
          }`}
        >
          {onResponder && (
            <button
              onClick={() => onResponder(mensagem)}
              title="Responder"
              aria-label="Responder"
              className="rounded-full p-1 text-medio/40 hover:bg-black/5 hover:text-tiffany"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
          )}
          {onEncaminhar && (
            <button
              onClick={() => onEncaminhar(mensagem)}
              title="Encaminhar"
              aria-label="Encaminhar"
              className="rounded-full p-1 text-medio/40 hover:bg-black/5 hover:text-tiffany"
            >
              <Forward className="h-3.5 w-3.5" />
            </button>
          )}
          {podeCopiar && (
            <button
              onClick={() => void copiar()}
              title="Copiar"
              aria-label="Copiar"
              className="rounded-full p-1 text-medio/40 hover:bg-black/5 hover:text-tiffany"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          {podeReagir && (
            <div className="relative">
              <button
                ref={reacaoBtnRef}
                onClick={() => setPickerReacao((v) => !v)}
                disabled={reagindo}
                title="Reagir"
                aria-label="Reagir"
                className="rounded-full p-1 text-medio/40 hover:bg-black/5 hover:text-tiffany"
              >
                {reagindo ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Smile className="h-3.5 w-3.5" />
                )}
              </button>
              {pickerReacao && (
                <PopoverReacao
                  anchorRef={reacaoBtnRef}
                  reacaoAtual={reacao}
                  onEscolher={(e) => void reagir(e)}
                  onFechar={() => setPickerReacao(false)}
                />
              )}
            </div>
          )}
          {podeEditar && (
            <button
              onClick={abrirEdicao}
              title="Editar mensagem"
              aria-label="Editar mensagem"
              className="rounded-full p-1 text-medio/40 hover:bg-black/5 hover:text-tiffany"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {podeRevogar && (
            <button
              onClick={() => void apagar()}
              disabled={apagando}
              title="Apagar para todos"
              aria-label="Apagar para todos"
              className="rounded-full p-1 text-medio/40 hover:bg-black/5 hover:text-erro"
            >
              {apagando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
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
        {/* Citacao (reply): preview da mensagem respondida, clicavel. */}
        {mensagem.citada && (
          <button
            onClick={() => onIrParaMensagem?.(mensagem.citada!.id)}
            className={`mb-1 flex w-full items-stretch gap-2 overflow-hidden rounded-md border-l-2 py-1 pl-2 pr-2 text-left text-xs ${
              ehOut
                ? "border-white/70 bg-white/15 text-white/90"
                : "border-tiffany bg-black/[0.04] text-medio/80"
            }`}
          >
            <span className="truncate">
              <span className="font-semibold">
                {mensagem.citada.direcao === "OUT" ? "Voce" : "Cliente"}
              </span>
              <span className="ml-1 opacity-80">
                {previewCitada(mensagem.citada)}
              </span>
            </span>
          </button>
        )}
        {/* Marca "Encaminhada" (forward). */}
        {mensagem.encaminhada && !apagada && (
          <span
            className={`mb-0.5 flex items-center gap-1 text-[11px] italic ${
              ehOut ? "text-white/70" : "text-medio/50"
            }`}
          >
            <Forward className="h-3 w-3" /> Encaminhada
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
        ) : ehFigurinha ? (
          <Figurinha ehOut={ehOut} />
        ) : ehContato ? (
          <CartaoContato
            nome={mensagem.contatoNome ?? "Contato"}
            telefone={mensagem.contatoTelefone ?? null}
            ehOut={ehOut}
            finalidade={finalidade}
          />
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
        ) : editando ? (
          // Edicao inline (estilo WhatsApp): textarea + salvar/cancelar.
          <div className="space-y-1.5">
            <textarea
              value={textoEdicao}
              onChange={(e) => setTextoEdicao(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void salvarEdicao();
                }
                if (e.key === "Escape") setEditando(false);
              }}
              rows={2}
              autoFocus
              className="scroll-fino w-full resize-none rounded-lg border border-white/40 bg-white/10 px-2 py-1.5 text-sm text-white outline-none placeholder:text-white/50 focus:border-white/70"
            />
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => setEditando(false)}
                disabled={salvandoEdicao}
                title="Cancelar"
                className="rounded-full p-1 text-white/80 hover:bg-white/15"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => void salvarEdicao()}
                disabled={salvandoEdicao || !textoEdicao.trim()}
                title="Salvar edicao"
                className="rounded-full p-1 text-white hover:bg-white/15 disabled:opacity-50"
              >
                {salvandoEdicao ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        ) : (
          <span className="whitespace-pre-wrap break-words">
            {conteudoExibido}
          </span>
        )}

        <span
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
            apagada ? "text-medio/40" : ehOut ? "text-white/70" : "text-medio/50"
          }`}
        >
          {/* Marca "editada" (estilo WhatsApp). */}
          {foiEditada && !apagada && (
            <span className="italic opacity-80">editada</span>
          )}
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
        {/* Falha de envio (estilo WhatsApp): nao finge entrega. Mostra "Nao
            enviada" e, em texto, um botao de reenviar. Fatia 2.89-C. */}
        {ehOut && !apagada && mensagem.statusEnvio === "ERRO" && (
          <div className="mt-1 flex items-center gap-1.5 border-t border-white/20 pt-1 text-[11px] text-red-100">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>Nao enviada</span>
            {mensagem.tipo === "TEXTO" && onReenviar && (
              <button
                onClick={() => onReenviar(mensagem)}
                className="ml-auto font-semibold underline hover:no-underline"
              >
                Reenviar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Card de CONTATO compartilhado (vCard). Avatar com inicial, nome e telefone,
// com acao de COPIAR o numero. Estilo WhatsApp. Fatia 2.85.
function CartaoContato({
  nome,
  telefone,
  ehOut,
  finalidade,
}: {
  nome: string;
  telefone: string | null;
  ehOut: boolean;
  finalidade?: Finalidade;
}) {
  const toast = useToast();
  const router = useRouter();
  const [conversando, setConversando] = useState(false);
  const inicial = (nome.trim()[0] ?? "?").toUpperCase();

  async function copiar() {
    if (!telefone) return;
    try {
      await navigator.clipboard.writeText(telefone);
      toast.sucesso("Numero copiado.");
    } catch {
      toast.erro("Nao foi possivel copiar.");
    }
  }

  // Cadastra/encontra o lead e abre a conversa no Inbox (na finalidade atual).
  // Nao "assume" cliente de outro colaborador (409 -> usa o existente; iniciar
  // 404 -> pertence a outro). Nenhum disparo ao numero. Fatia 2.96.
  async function conversar() {
    if (!telefone || conversando) return;
    setConversando(true);
    const fin = finalidade ?? "VENDA";
    try {
      const rl = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, telefone, finalidade: fin }),
      });
      const dl = await rl.json().catch(() => null);
      let leadId: string | null = null;
      if (rl.ok && dl?.leadId) {
        leadId = dl.leadId;
      } else if (rl.status === 409 && dl?.leadId) {
        // Telefone ja cadastrado: usa o lead existente (sem assumir/roubar).
        leadId = dl.leadId;
      } else {
        toast.erro(dl?.erro ?? "Nao foi possivel cadastrar o contato.");
        return;
      }
      const ri = await fetch("/api/conversas/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, finalidade: fin }),
      });
      if (ri.ok) {
        router.push(`/inbox?lead=${leadId}`);
      } else if (ri.status === 404) {
        toast.erro("Cliente pertence a outro colaborador.");
      } else {
        const di = await ri.json().catch(() => null);
        toast.erro(di?.erro ?? "Nao foi possivel abrir a conversa.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setConversando(false);
    }
  }

  return (
    <div className="min-w-56 space-y-1.5">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            ehOut ? "bg-white/20 text-white" : "bg-tiffany/15 text-tiffany"
          }`}
        >
          {inicial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{nome}</p>
          {telefone && (
            <p className={`truncate text-xs ${ehOut ? "text-white/80" : "text-medio/70"}`}>
              {formatarTelefone(telefone)}
            </p>
          )}
        </div>
      </div>
      {telefone && (
        <button
          onClick={() => void copiar()}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors ${
            ehOut ? "bg-white/15 text-white hover:bg-white/25" : "bg-black/5 text-medio hover:bg-black/10"
          }`}
        >
          <Copy className="h-3.5 w-3.5" /> Copiar numero
        </button>
      )}
      {telefone && (
        <button
          onClick={() => void conversar()}
          disabled={conversando}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
            ehOut ? "bg-white/15 text-white hover:bg-white/25" : "bg-black/5 text-medio hover:bg-black/10"
          }`}
        >
          {conversando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageCircle className="h-3.5 w-3.5" />
          )}
          Conversar
        </button>
      )}
    </div>
  );
}

// Figurinha (sticker) recebida: exibida APENAS como texto "Figurinha" (Fatia
// 2.97). A imagem nao e baixada — a Evolution nao-oficial nao serve o .webp
// (getBase64FromMediaMessage falha); retomar a exibicao apos a API oficial da
// Meta. ehFigurinha (conteudo === "[figurinha]") decide usar este render.
function Figurinha({ ehOut }: { ehOut: boolean }) {
  return (
    <span
      className={`italic ${ehOut ? "text-white/90" : "text-medio/70"}`}
    >
      Figurinha
    </span>
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
      return <PlayerAudio mediaUrl={mediaUrl} ehOut={ehOut} />;
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

// Seletor de conversa para ENCAMINHAR (forward): lista as conversas do usuario,
// busca por nome/telefone, e reenvia o conteudo ao destino escolhido. Fatia 2.85.
function ModalEncaminhar({
  mensagemId,
  onFechar,
}: {
  mensagemId: string;
  onFechar: () => void;
}) {
  const toast = useToast();
  const [conversas, setConversas] = useState<
    { id: string; leadNome: string | null; leadTelefone: string; leadFoto: string | null }[]
  >([]);
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/conversas")
      .then((r) => (r.ok ? r.json() : { conversas: [] }))
      .then((d) => setConversas(d.conversas ?? []))
      .catch(() => undefined);
  }, []);

  async function encaminhar(conversaDestinoId: string) {
    setEnviando(conversaDestinoId);
    try {
      const r = await fetch("/api/mensagens/encaminhar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagemId, conversaDestinoId }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        toast.sucesso("Mensagem encaminhada.");
        onFechar();
      } else {
        toast.erro(d?.erro ?? "Nao foi possivel encaminhar.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setEnviando(null);
    }
  }

  const q = busca.trim().toLowerCase();
  const qd = busca.replace(/\D/g, "");
  const filtradas = conversas.filter((c) => {
    if (!q && !qd) return true;
    const nome = (c.leadNome ?? "").toLowerCase();
    const tel = c.leadTelefone.replace(/\D/g, "");
    return nome.includes(q) || (qd.length > 0 && tel.includes(qd));
  });

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
            <Forward className="h-4 w-4 text-tiffany" /> Encaminhar para
          </h3>
          <button onClick={onFechar} className="rounded-lg p-1 text-medio/60 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-black/5 p-3">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar conversa"
            className="w-full rounded-lg border border-black/10 bg-fundo px-3 py-2 text-sm outline-none focus:border-tiffany"
          />
        </div>
        <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">
          {filtradas.length === 0 ? (
            <p className="p-4 text-center text-sm text-medio/50">Nenhuma conversa.</p>
          ) : (
            filtradas.map((c) => (
              <button
                key={c.id}
                onClick={() => void encaminhar(c.id)}
                disabled={enviando !== null}
                className="flex w-full items-center gap-3 border-b border-black/5 px-3 py-2.5 text-left transition-colors hover:bg-fundo disabled:opacity-60"
              >
                <AvatarCliente
                  nome={c.leadNome}
                  telefone={c.leadTelefone}
                  fotoUrl={c.leadFoto}
                  tamanho={36}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-escuro">
                  {c.leadNome?.trim() || formatarTelefone(c.leadTelefone)}
                </span>
                {enviando === c.id && <Loader2 className="h-4 w-4 animate-spin text-tiffany" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
