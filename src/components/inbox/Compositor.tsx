"use client";

// Rodape da thread: textarea de envio + respostas rapidas (botao e atalho "/").
// Enter envia, Shift+Enter quebra linha. Digitar "/" abre a lista filtravel; ao
// escolher, o texto e inserido no compositor (editavel antes de enviar).
import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import {
  Send,
  Loader2,
  Zap,
  X,
  Package,
  Mic,
  Square,
  Trash2,
  Paperclip,
  Wand2,
  Undo2,
  Smile,
  Sticker,
  FileText,
} from "lucide-react";
import type { MensagemItem } from "./tipos";
import { SeletorEmoji } from "./SeletorEmoji";
import { SeletorFigurinha } from "./SeletorFigurinha";
import { SeletorProduto, mensagemProduto } from "@/components/loja/SeletorProduto";
import type { ProdutoLoja } from "@/components/loja/tipos";
import {
  detectarVariaveis,
  aplicarModelo,
  sortearRedacao,
  INFO_VARIAVEL,
  type LeadModelo,
} from "@/lib/modelos";
import { useAgente } from "@/components/shell/AgenteContext";

type Resposta = {
  id: string;
  titulo: string;
  atalho: string | null;
  texto: string;
  categoria?: string;
  finalidade?: "VENDA" | "POS_VENDA" | null;
  variacoes?: string[];
};

type Instancia = {
  id: string;
  nome: string;
  numero: string | null;
  finalidade: "VENDA" | "POS_VENDA";
};

export function Compositor({
  conversaId,
  onEnviada,
  ehAdmin = false,
  finalidade,
  instanciaIdAtual,
  lead,
}: {
  conversaId: string;
  onEnviada: (msg: MensagemItem) => void;
  ehAdmin?: boolean;
  finalidade?: "VENDA" | "POS_VENDA";
  instanciaIdAtual?: string | null;
  lead?: LeadModelo | null;
}) {
  const agente = useAgente();
  const ctxAgente = agente ? { nome: agente.nome } : null;
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  // Botoes-gatilho dos seletores: ignorados no clique-fora (alternar sem reabrir).
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const figurinhaBtnRef = useRef<HTMLButtonElement>(null);

  // Numero de envio: as instancias ativas da finalidade da conversa. O padrao e
  // o numero que o cliente usou por ultimo (instanciaIdAtual); o atendente pode
  // escolher outro. A resposta do cliente sempre cai na conversa unificada.
  const [instancias, setInstancias] = useState<Instancia[]>([]);
  const [instanciaSel, setInstanciaSel] = useState<string | null>(
    instanciaIdAtual ?? null,
  );
  useEffect(() => {
    setInstanciaSel(instanciaIdAtual ?? null);
  }, [instanciaIdAtual, conversaId]);
  useEffect(() => {
    const qs = finalidade ? `?finalidade=${finalidade}` : "";
    fetch(`/api/instancias${qs}`)
      .then((r) => (r.ok ? r.json() : { instancias: [] }))
      .then((d) => setInstancias(d.instancias ?? []))
      .catch(() => undefined);
  }, [finalidade]);

  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [mostrar, setMostrar] = useState(false);
  const [busca, setBusca] = useState("");
  const [seletorProduto, setSeletorProduto] = useState(false);
  const [mostrarEmojis, setMostrarEmojis] = useState(false);
  const [mostrarFigurinhas, setMostrarFigurinhas] = useState(false);
  const [figurinhas, setFigurinhas] = useState<
    { id: string; nome: string; url: string; favorita?: boolean }[]
  >([]);
  const [figurinhasCarregadas, setFigurinhasCarregadas] = useState(false);
  const [enviandoFigurinha, setEnviandoFigurinha] = useState(false);

  // Varinha magica: reescreve o texto aplicando um tom (via IA). So aparece se
  // houver tons ativos (assistente ligado no admin).
  const [tons, setTons] = useState<{ id: string; nome: string; ordem: number }[]>(
    [],
  );
  const [mostrarTons, setMostrarTons] = useState(false);
  const [reescrevendo, setReescrevendo] = useState(false);
  const [textoAnterior, setTextoAnterior] = useState<string | null>(null);
  // Modelo escolhido que pede variaveis digitadas (cupom etc.). redacao = a
  // redacao sorteada (texto principal ou uma variacao).
  const [modeloPendente, setModeloPendente] = useState<{
    resposta: Resposta;
    redacao: string;
    digitadas: string[];
    valores: Record<string, string>;
  } | null>(null);

  // ---- Audio (gravacao/anexo) ----
  const [gravando, setGravando] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [enviandoAudio, setEnviandoAudio] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Anexo GERAL (clipe): MULTIPLOS arquivos numa fila, qualquer tipo. Cada um
  // com preview (miniatura/icone + nome + tamanho + remover). Envia em ordem pelo
  // /api/mensagens/enviar-arquivo. Separado da gravacao de voz (microfone). 2.85.
  type ItemFila = { file: File; preview: string | null };
  const [arquivoFila, setArquivoFila] = useState<ItemFila[]>([]);
  const [legendaArquivos, setLegendaArquivos] = useState("");
  const [enviandoFila, setEnviandoFila] = useState(false);
  const [progressoFila, setProgressoFila] = useState<{ atual: number; total: number } | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  // Limites (folga profissional, dentro do WhatsApp): ~64MB midia, ~100MB documento.
  const LIMITE_MIDIA = 64 * 1024 * 1024;
  const LIMITE_DOC = 100 * 1024 * 1024;

  function tamanhoLegivel(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function limparFila() {
    setArquivoFila((prev) => {
      prev.forEach((a) => a.preview && URL.revokeObjectURL(a.preview));
      return [];
    });
    setLegendaArquivos("");
  }

  function removerArquivo(idx: number) {
    setArquivoFila((prev) => {
      const a = prev[idx];
      if (a?.preview) URL.revokeObjectURL(a.preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function anexarArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const validos: ItemFila[] = [];
    let excedeu = false;
    for (const f of files) {
      const ehMidia = /^(image|video|audio)\//.test(f.type);
      const limite = ehMidia ? LIMITE_MIDIA : LIMITE_DOC;
      if (f.size > limite) {
        excedeu = true;
        continue;
      }
      validos.push({
        file: f,
        preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
      });
    }
    setErro(
      excedeu
        ? "Alguns arquivos passam do limite (midia 64MB, documento 100MB) e foram ignorados."
        : null,
    );
    if (validos.length > 0) setArquivoFila((prev) => [...prev, ...validos]);
  }

  async function enviarFila() {
    if (arquivoFila.length === 0 || enviandoFila) return;
    setEnviandoFila(true);
    setErro(null);
    const itens = arquivoFila;
    const total = itens.length;
    const legenda = legendaArquivos.trim();
    // Legenda geral vira caption da PRIMEIRA imagem/video (estilo WhatsApp).
    const idxLegenda = legenda
      ? itens.findIndex((a) => /^(image|video)\//.test(a.file.type))
      : -1;
    const falhas: string[] = [];
    for (let i = 0; i < itens.length; i++) {
      setProgressoFila({ atual: i + 1, total });
      const { file } = itens[i];
      try {
        const fd = new FormData();
        fd.append("conversaId", conversaId);
        if (instanciaSel) fd.append("instanciaId", instanciaSel);
        fd.append("arquivo", file, file.name);
        if (i === idxLegenda) fd.append("legenda", legenda);
        const r = await fetch("/api/mensagens/enviar-arquivo", {
          method: "POST",
          body: fd,
        });
        const d = await r.json().catch(() => null);
        if (d?.mensagem) onEnviada(d.mensagem as MensagemItem);
        if (!r.ok) falhas.push(file.name);
      } catch {
        falhas.push(file.name);
      }
    }
    // Legenda sem nenhuma midia (so documentos): manda como texto avulso.
    if (legenda && idxLegenda === -1) {
      try {
        const r = await fetch("/api/mensagens/enviar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversaId,
            texto: legenda,
            ...(instanciaSel ? { instanciaId: instanciaSel } : {}),
          }),
        });
        const d = await r.json().catch(() => null);
        if (d?.mensagem) onEnviada(d.mensagem as MensagemItem);
      } catch {
        // silencioso: os arquivos ja foram
      }
    }
    setProgressoFila(null);
    setEnviandoFila(false);
    if (falhas.length > 0) {
      setErro(`Falha ao enviar: ${falhas.join(", ")}.`);
    }
    limparFila();
  }

  function pararTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function definirAudio(blob: Blob) {
    setAudioBlob(blob);
    setAudioUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return URL.createObjectURL(blob);
    });
  }

  function descartarAudio() {
    setAudioBlob(null);
    setAudioUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return null;
    });
    setSegundos(0);
  }

  async function iniciarGravacao() {
    setErro(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErro("Gravacao de audio nao suportada neste navegador.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        pararTimer();
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        if (blob.size > 0) definirAudio(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setGravando(true);
      setSegundos(0);
      timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
    } catch {
      setErro("Permissao de microfone negada.");
    }
  }

  function pararGravacao() {
    recorderRef.current?.stop();
    setGravando(false);
  }

  async function enviarAudioMsg() {
    if (!audioBlob || enviandoAudio) return;
    setEnviandoAudio(true);
    setErro(null);
    try {
      const fd = new FormData();
      fd.append("conversaId", conversaId);
      if (instanciaSel) fd.append("instanciaId", instanciaSel);
      const ext = (audioBlob.type.split("/")[1] || "webm").split(";")[0];
      fd.append("audio", audioBlob, `audio.${ext}`);
      const r = await fetch("/api/mensagens/enviar-audio", {
        method: "POST",
        body: fd,
      });
      const d = await r.json().catch(() => null);
      if (d?.mensagem) onEnviada(d.mensagem as MensagemItem);
      if (!r.ok) {
        setErro("Falha ao enviar o audio. Verifique a conexao com o WhatsApp.");
      }
      descartarAudio();
    } catch {
      setErro("Nao foi possivel enviar o audio agora.");
    } finally {
      setEnviandoAudio(false);
    }
  }

  // Limpeza da URL de preview e do timer ao desmontar.
  useEffect(() => {
    return () => {
      pararTimer();
      setAudioUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
      setArquivoFila((prev) => {
        prev.forEach((a) => a.preview && URL.revokeObjectURL(a.preview));
        return [];
      });
    };
  }, []);

  function mmss(s: number): string {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  }

  // Auto-grow do campo: cresce com o conteudo ate o teto (max-h-60), depois
  // rola internamente. A altura minima (min-h) mantem o campo confortavel.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [texto]);

  function inserirTexto(novoTrecho: string) {
    const base = texto.trim();
    const novo =
      base === "" || base.startsWith("/") ? novoTrecho : `${base}\n${novoTrecho}`;
    setTexto(novo);
    setMostrar(false);
    setBusca("");
    setTimeout(() => ref.current?.focus(), 0);
  }

  // Insere o emoji na posicao do cursor (ou no fim), mantendo o foco no campo.
  function inserirEmoji(emoji: string) {
    const el = ref.current;
    if (textoAnterior !== null) setTextoAnterior(null);
    if (!el) {
      setTexto((t) => t + emoji);
      return;
    }
    const start = el.selectionStart ?? texto.length;
    const end = el.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, start) + emoji + texto.slice(end));
    setTimeout(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  }

  // Fecha todos os popovers de selecao (para nao deixar dois abertos juntos).
  function fecharSeletores() {
    setMostrar(false);
    setMostrarEmojis(false);
    setMostrarFigurinhas(false);
    setMostrarTons(false);
  }

  // Abre o painel de figurinhas (carrega sob demanda na 1a vez).
  function abrirFigurinhas() {
    const abrir = !mostrarFigurinhas;
    fecharSeletores();
    setMostrarFigurinhas(abrir);
    if (!figurinhasCarregadas) {
      setFigurinhasCarregadas(true);
      fetch("/api/figurinhas")
        .then((r) => (r.ok ? r.json() : { figurinhas: [] }))
        .then((d) => setFigurinhas(d.figurinhas ?? []))
        .catch(() => undefined);
    }
  }

  // Favoritar/desfavoritar (global). Otimista + reordena (favoritas primeiro).
  async function favoritarFigurinha(figurinhaId: string) {
    setFigurinhas((prev) =>
      [...prev.map((f) => (f.id === figurinhaId ? { ...f, favorita: !f.favorita } : f))].sort(
        (a, b) => Number(b.favorita ?? false) - Number(a.favorita ?? false),
      ),
    );
    try {
      const r = await fetch(`/api/figurinhas/${figurinhaId}/favoritar`, {
        method: "POST",
      });
      if (!r.ok) {
        // reverte
        setFigurinhas((prev) =>
          [...prev.map((f) => (f.id === figurinhaId ? { ...f, favorita: !f.favorita } : f))].sort(
            (a, b) => Number(b.favorita ?? false) - Number(a.favorita ?? false),
          ),
        );
      }
    } catch {
      // silencioso
    }
  }

  async function enviarFigurinhaMsg(figurinhaId: string) {
    if (enviandoFigurinha) return;
    setEnviandoFigurinha(true);
    setErro(null);
    try {
      const r = await fetch("/api/mensagens/enviar-figurinha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversaId,
          figurinhaId,
          ...(instanciaSel ? { instanciaId: instanciaSel } : {}),
        }),
      });
      const d = await r.json().catch(() => null);
      if (d?.mensagem) onEnviada(d.mensagem as MensagemItem);
      if (!r.ok) {
        setErro("Falha ao enviar a figurinha. Verifique a conexao com o WhatsApp.");
      }
      setMostrarFigurinhas(false);
    } catch {
      setErro("Nao foi possivel enviar a figurinha agora.");
    } finally {
      setEnviandoFigurinha(false);
    }
  }

  function inserirProduto(p: ProdutoLoja) {
    const msg = mensagemProduto(p);
    const base = texto.trim();
    setTexto(base === "" || base.startsWith("/") ? msg : `${base}\n${msg}`);
    setSeletorProduto(false);
    setTimeout(() => ref.current?.focus(), 0);
  }

  useEffect(() => {
    fetch("/api/respostas")
      .then((r) => (r.ok ? r.json() : { respostas: [] }))
      .then((d) => setRespostas(d.respostas ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/assistente/tons")
      .then((r) => (r.ok ? r.json() : { tons: [] }))
      .then((d) => setTons(d.tons ?? []))
      .catch(() => undefined);
  }, []);

  // Reescreve o texto atual com o tom escolhido. Guarda o texto antes (desfazer),
  // mostra loading e degrada com mensagem amigavel se a API falhar.
  async function reescrever(tomId: string) {
    const valor = texto.trim();
    if (!valor || reescrevendo) return;
    setMostrarTons(false);
    setReescrevendo(true);
    setErro(null);
    const anterior = texto;
    try {
      const r = await fetch("/api/assistente/reescrever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: valor, tomId }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && typeof d?.textoNovo === "string" && d.textoNovo.trim()) {
        setTextoAnterior(anterior);
        setTexto(d.textoNovo);
        setTimeout(() => {
          const el = ref.current;
          if (el) {
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
          }
        }, 0);
      } else {
        setErro("Nao foi possivel reescrever agora.");
      }
    } catch {
      setErro("Nao foi possivel reescrever agora.");
    } finally {
      setReescrevendo(false);
    }
  }

  function desfazerReescrita() {
    if (textoAnterior === null) return;
    setTexto(textoAnterior);
    setTextoAnterior(null);
    setTimeout(() => ref.current?.focus(), 0);
  }

  const q = busca.toLowerCase().trim();
  const filtradas = q
    ? respostas.filter(
        (r) =>
          r.titulo.toLowerCase().includes(q) ||
          (r.atalho ?? "").toLowerCase().includes(q) ||
          r.texto.toLowerCase().includes(q),
      )
    : respostas;

  function aoMudar(v: string) {
    setTexto(v);
    // Edicao manual descarta o "desfazer" da reescrita.
    if (textoAnterior !== null) setTextoAnterior(null);
    if (v.startsWith("/")) {
      setMostrar(true);
      setBusca(v.slice(1));
    } else if (v === "") {
      setMostrar(false);
    }
  }

  function selecionar(r: Resposta) {
    // Sorteia uma redacao entre [texto, ...variacoes].
    const redacao = sortearRedacao([r.texto, ...(r.variacoes ?? [])]);
    const { digitadas } = detectarVariaveis(redacao);
    if (digitadas.length > 0) {
      // Abre mini-form para o usuario preencher cupom/desconto/etc.
      setModeloPendente({
        resposta: r,
        redacao,
        digitadas,
        valores: Object.fromEntries(digitadas.map((d) => [d, ""])),
      });
      setMostrar(false);
      setBusca("");
      return;
    }
    // So automaticas (ou nenhuma): aplica e insere direto.
    inserirTexto(aplicarModelo(redacao, { lead, agente: ctxAgente }));
  }

  function confirmarModelo() {
    if (!modeloPendente) return;
    const final = aplicarModelo(modeloPendente.redacao, {
      lead,
      agente: ctxAgente,
      valoresDigitados: modeloPendente.valores,
    });
    setModeloPendente(null);
    inserirTexto(final);
  }

  // Re-sorteia a redacao do modelo pendente (botao "variar").
  function variarRedacao() {
    setModeloPendente((m) => {
      if (!m) return m;
      const r = m.resposta;
      const nova = sortearRedacao([r.texto, ...(r.variacoes ?? [])]);
      const digitadas = detectarVariaveis(nova).digitadas;
      return {
        ...m,
        redacao: nova,
        digitadas,
        valores: Object.fromEntries(
          digitadas.map((d) => [d, m.valores[d] ?? ""]),
        ),
      };
    });
  }

  async function enviar() {
    const valor = texto.trim();
    if (!valor || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/mensagens/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversaId,
          texto: valor,
          ...(instanciaSel ? { instanciaId: instanciaSel } : {}),
        }),
      });
      const d = await r.json().catch(() => null);
      if (d?.mensagem) onEnviada(d.mensagem as MensagemItem);
      if (!r.ok) {
        setErro("Falha ao enviar. Verifique a conexao com o WhatsApp.");
      }
      setTexto("");
      setTextoAnterior(null);
      ref.current?.focus();
    } catch {
      setErro("Nao foi possivel enviar agora.");
    } finally {
      setEnviando(false);
    }
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && mostrar) {
      setMostrar(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      // Lista aberta via "/": Enter escolhe a primeira opcao.
      if (mostrar && texto.startsWith("/") && filtradas.length > 0) {
        e.preventDefault();
        selecionar(filtradas[0]);
        return;
      }
      e.preventDefault();
      void enviar();
    }
  }

  return (
    <div className="relative border-t border-black/5 bg-white p-3">
      {erro && <p className="mb-2 px-1 text-xs text-erro">{erro}</p>}

      {textoAnterior !== null && !reescrevendo && (
        <button
          onClick={desfazerReescrita}
          className="mb-2 flex items-center gap-1 px-1 text-xs font-medium text-tiffany transition-colors hover:underline"
        >
          <Undo2 className="h-3.5 w-3.5" /> Desfazer reescrita
        </button>
      )}

      {mostrarTons && tons.length > 0 && (
        <div className="absolute bottom-full right-3 z-10 mb-1 w-60 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-medio/50">
              Reescrever com IA
            </p>
            <button
              onClick={() => setMostrarTons(false)}
              className="rounded p-0.5 text-medio/50 hover:bg-black/5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="scroll-fino max-h-60 overflow-y-auto py-1">
            {tons.map((t) => (
              <button
                key={t.id}
                onClick={() => void reescrever(t.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-escuro transition-colors hover:bg-fundo"
              >
                <Wand2 className="h-3.5 w-3.5 shrink-0 text-tiffany" />
                {t.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      {mostrar && (
        <div className="absolute bottom-full left-3 right-3 mb-1 max-h-72 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-medio/50">
              Respostas rapidas
            </p>
            <div className="flex items-center gap-1.5">
              <a
                href="/minhas-respostas"
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-tiffany hover:bg-tiffany/10"
              >
                Gerenciar minhas
              </a>
              <button
                onClick={() => setMostrar(false)}
                className="rounded p-0.5 text-medio/50 hover:bg-black/5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="scroll-fino max-h-60 overflow-y-auto">
            {filtradas.length === 0 ? (
              <p className="p-4 text-center text-sm text-medio/50">
                Nenhuma resposta.
              </p>
            ) : (
              filtradas.map((r) => (
                <button
                  key={r.id}
                  onClick={() => selecionar(r)}
                  className="flex w-full flex-col gap-0.5 border-b border-black/5 px-3 py-2 text-left last:border-0 hover:bg-fundo"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-escuro">
                      {r.titulo}
                    </span>
                    {r.atalho && (
                      <span className="rounded bg-tiffany/10 px-1.5 py-0.5 text-[10px] font-medium text-tiffany">
                        {r.atalho}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs text-medio/60">
                    {r.texto}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {modeloPendente && (
        <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="modal-in scroll-fino max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-escuro">
                {modeloPendente.resposta.titulo}
              </h3>
              <button
                onClick={() => setModeloPendente(null)}
                className="rounded-lg p-1 text-medio/60 hover:bg-black/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-2 text-xs text-medio/60">
              Preencha os campos para inserir a mensagem.
            </p>
            {(modeloPendente.resposta.variacoes?.length ?? 0) > 0 && (
              <button
                type="button"
                onClick={variarRedacao}
                className="mb-3 rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium text-medio hover:bg-black/5"
              >
                Variar redacao
              </button>
            )}
            <div className="space-y-2.5">
              {modeloPendente.digitadas.map((d) => (
                <div key={d}>
                  <label className="mb-1 block text-xs font-medium text-medio/70">
                    {INFO_VARIAVEL[d]?.rotulo ?? d}
                  </label>
                  <input
                    autoFocus={d === modeloPendente.digitadas[0]}
                    value={modeloPendente.valores[d]}
                    onChange={(e) =>
                      setModeloPendente((m) =>
                        m
                          ? {
                              ...m,
                              valores: { ...m.valores, [d]: e.target.value },
                            }
                          : m,
                      )
                    }
                    placeholder={INFO_VARIAVEL[d]?.exemplo ?? ""}
                    className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setModeloPendente(null)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-medio hover:bg-black/5"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarModelo}
                className="rounded-lg bg-tiffany px-4 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro"
              >
                Inserir
              </button>
            </div>
          </div>
        </div>
      )}

      {seletorProduto && (
        <SeletorProduto
          ehAdmin={ehAdmin}
          onEscolher={inserirProduto}
          onFechar={() => setSeletorProduto(false)}
        />
      )}

      {mostrarEmojis && (
        <SeletorEmoji
          onEscolher={inserirEmoji}
          onFechar={() => setMostrarEmojis(false)}
          anchorRef={emojiBtnRef}
        />
      )}

      {mostrarFigurinhas && (
        <SeletorFigurinha
          figurinhas={figurinhas}
          carregando={!figurinhasCarregadas}
          enviando={enviandoFigurinha}
          onEscolher={(id) => void enviarFigurinhaMsg(id)}
          onFavoritar={(id) => void favoritarFigurinha(id)}
          onFechar={() => setMostrarFigurinhas(false)}
          anchorRef={figurinhaBtnRef}
        />
      )}

      {instancias.length > 1 && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="text-[11px] font-medium text-medio/60">
            Responder por:
          </span>
          <select
            value={instanciaSel ?? ""}
            onChange={(e) => setInstanciaSel(e.target.value || null)}
            className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs text-escuro outline-none focus:border-tiffany"
          >
            {!instanciaSel && <option value="">Numero padrao</option>}
            {instancias.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
                {i.numero ? ` (${i.numero})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Fila de ARQUIVOS anexados (clipe): varios de uma vez, cada um com preview
          (miniatura/icone + nome + tamanho + remover). Legenda geral opcional.
          Envia em ordem, com progresso. Aceita qualquer tipo. */}
      {arquivoFila.length > 0 && (
        <div className="mb-2 space-y-2 rounded-lg border border-black/10 bg-fundo p-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-medium text-medio/70">
              {arquivoFila.length}{" "}
              {arquivoFila.length === 1 ? "arquivo" : "arquivos"} para enviar
            </span>
            {!enviandoFila && (
              <button
                onClick={limparFila}
                className="text-[11px] font-medium text-medio/60 hover:text-erro"
              >
                Limpar tudo
              </button>
            )}
          </div>
          <div className="scroll-fino max-h-44 space-y-1.5 overflow-y-auto">
            {arquivoFila.map((it, idx) => (
              <div
                key={`${it.file.name}-${idx}`}
                className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5"
              >
                {it.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.preview}
                    alt={it.file.name}
                    className="h-10 w-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-black/5 text-medio/70">
                    <FileText className="h-5 w-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-escuro">
                    {it.file.name}
                  </p>
                  <p className="text-[11px] text-medio/60">
                    {tamanhoLegivel(it.file.size)}
                    {it.file.type ? ` · ${it.file.type}` : ""}
                  </p>
                </div>
                {!enviandoFila && (
                  <button
                    onClick={() => removerArquivo(idx)}
                    title="Remover"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-medio/60 hover:bg-black/5 hover:text-erro"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {/* Legenda geral (vai na 1a imagem/video, como no WhatsApp). */}
          <input
            value={legendaArquivos}
            onChange={(e) => setLegendaArquivos(e.target.value)}
            disabled={enviandoFila}
            placeholder="Legenda (opcional)"
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm outline-none focus:border-tiffany"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => arquivoRef.current?.click()}
              disabled={enviandoFila}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-black/10 px-3 text-sm font-medium text-medio hover:bg-black/5 disabled:opacity-50"
            >
              <Paperclip className="h-4 w-4" /> Adicionar
            </button>
            <button
              onClick={() => void enviarFila()}
              disabled={enviandoFila}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-tiffany px-3 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-50"
            >
              {enviandoFila ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {progressoFila
                ? `Enviando ${progressoFila.atual} de ${progressoFila.total}...`
                : `Enviar ${arquivoFila.length}`}
            </button>
          </div>
        </div>
      )}

      {/* Preview do audio gravado (microfone): tocar, descartar ou enviar. */}
      {audioBlob && audioUrl && !gravando && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-black/10 bg-fundo p-2">
          <audio src={audioUrl} controls className="h-9 min-w-0 flex-1" />
          <button
            onClick={descartarAudio}
            disabled={enviandoAudio}
            title="Descartar audio"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-medio hover:bg-black/5 hover:text-erro"
          >
            <Trash2 className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={() => void enviarAudioMsg()}
            disabled={enviandoAudio}
            title="Enviar audio"
            className="flex h-9 items-center gap-1.5 rounded-lg bg-tiffany px-3 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-50"
          >
            {enviandoAudio ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar
          </button>
        </div>
      )}

      {/* Anexo geral: multiplos, sem accept => abre em "Todos os Arquivos". */}
      <input
        ref={arquivoRef}
        type="file"
        multiple
        onChange={anexarArquivos}
        className="hidden"
      />

      <div className="flex items-center gap-2">
        {gravando ? (
          // Gravando: indicador + parar (substitui as acoes auxiliares).
          <div className="flex h-11 flex-1 items-center gap-3 rounded-lg border border-erro/30 bg-erro/5 px-3">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-erro" />
            <span className="text-sm font-medium text-erro">
              Gravando... {mmss(segundos)}
            </span>
            <button
              onClick={pararGravacao}
              title="Parar gravacao"
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg bg-erro text-white hover:opacity-90"
            >
              <Square className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
        {/* Acoes auxiliares em grade (2 colunas) a esquerda. */}
        <div className="grid shrink-0 grid-cols-2 gap-1">
          <button
            onClick={() => {
              const abrir = !mostrar;
              fecharSeletores();
              setMostrar(abrir);
              setBusca("");
            }}
            title="Respostas rapidas"
            aria-label="Respostas rapidas"
            className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${
              mostrar
                ? "border-tiffany bg-tiffany/10 text-tiffany"
                : "border-black/10 text-medio hover:bg-black/5"
            }`}
          >
            <Zap className="h-5 w-5" />
          </button>
          <button
            ref={emojiBtnRef}
            onClick={() => {
              const abrir = !mostrarEmojis;
              fecharSeletores();
              setMostrarEmojis(abrir);
            }}
            title="Emojis"
            aria-label="Emojis"
            className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${
              mostrarEmojis
                ? "border-tiffany bg-tiffany/10 text-tiffany"
                : "border-black/10 text-medio hover:bg-black/5"
            }`}
          >
            <Smile className="h-5 w-5" />
          </button>
          <button
            ref={figurinhaBtnRef}
            onClick={abrirFigurinhas}
            title="Figurinhas"
            aria-label="Figurinhas"
            className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${
              mostrarFigurinhas
                ? "border-tiffany bg-tiffany/10 text-tiffany"
                : "border-black/10 text-medio hover:bg-black/5"
            }`}
          >
            <Sticker className="h-5 w-5" />
          </button>
          <button
            onClick={() => setSeletorProduto(true)}
            title="Enviar produto"
            aria-label="Enviar produto"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-black/10 text-medio transition-colors hover:bg-black/5"
          >
            <Package className="h-5 w-5" />
          </button>
          <button
            onClick={() => void iniciarGravacao()}
            title="Gravar audio"
            aria-label="Gravar audio"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-black/10 text-medio transition-colors hover:bg-black/5"
          >
            <Mic className="h-5 w-5" />
          </button>
          <button
            onClick={() => arquivoRef.current?.click()}
            title="Anexar arquivo"
            aria-label="Anexar arquivo"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-black/10 text-medio transition-colors hover:bg-black/5"
          >
            <Paperclip className="h-5 w-5" />
          </button>
        </div>
        <textarea
          ref={ref}
          value={texto}
          onChange={(e) => aoMudar(e.target.value)}
          onKeyDown={aoTeclar}
          rows={4}
          placeholder='Escreva uma mensagem... ("/" para respostas rapidas)'
          className="scroll-fino max-h-60 min-h-[92px] flex-1 resize-none self-stretch rounded-lg border border-black/10 bg-fundo px-3 py-2.5 text-sm outline-none transition-colors focus:border-tiffany"
        />
        {/* Coluna direita: varinha (reescrever) sobre o enviar. A varinha so
            aparece quando ha tons ativos (assistente ligado no admin). */}
        <div className="flex shrink-0 flex-col gap-1">
          {tons.length > 0 && (
            <button
              onClick={() => {
                const abrir = !mostrarTons;
                fecharSeletores();
                setMostrarTons(abrir);
              }}
              disabled={!texto.trim() || reescrevendo}
              title="Reescrever com IA"
              aria-label="Reescrever com IA"
              className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors disabled:opacity-40 ${
                mostrarTons
                  ? "border-tiffany bg-tiffany/10 text-tiffany"
                  : "border-black/10 text-medio hover:bg-black/5"
              }`}
            >
              {reescrevendo ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Wand2 className="h-5 w-5" />
              )}
            </button>
          )}
          <button
            onClick={() => void enviar()}
            disabled={enviando || !texto.trim()}
            title="Enviar (Enter)"
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-tiffany text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-50"
          >
            {enviando ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
