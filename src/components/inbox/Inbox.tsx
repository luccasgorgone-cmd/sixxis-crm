"use client";

// Orquestrador da inbox: carrega a lista, abre a thread, escuta o socket
// "mensagem:nova" e mantem lista + thread atualizadas AO VIVO (sem refresh).
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { getSocket } from "@/lib/socketClient";
import { previewMensagem } from "@/lib/preview";
import { normalizarTexto } from "@/lib/format";
import { ListaConversas } from "./ListaConversas";
import { Thread } from "./Thread";
import { PainelClienteInbox } from "./PainelClienteInbox";
import type {
  ConversaItem,
  MensagemItem,
  EventoMensagemNova,
  EventoMidia,
  Filtro,
  Finalidade,
} from "./tipos";

export function Inbox({
  agenteIdAtual,
  papel,
}: {
  agenteIdAtual: string;
  papel: string;
}) {
  const ehAdmin = papel === "ADMIN";
  const [conversas, setConversas] = useState<ConversaItem[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erroLista, setErroLista] = useState<string | null>(null);

  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemItem[]>([]);
  const [carregandoThread, setCarregandoThread] = useState(false);

  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");

  // Debounce da busca (~250ms).
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 250);
    return () => clearTimeout(t);
  }, [busca]);
  // Finalidade: "" = todas (so faz sentido para ADMIN, que ve as duas).
  const [finalidade, setFinalidade] = useState<Finalidade | "">("");

  // Ref para o socket ler a conversa aberta sem recriar o listener.
  const selecionadaRef = useRef<string | null>(null);
  selecionadaRef.current = selecionada;

  const carregarConversas = useCallback(async () => {
    try {
      const qs = finalidade ? `?finalidade=${finalidade}` : "";
      const r = await fetch(`/api/conversas${qs}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setConversas(d.conversas as ConversaItem[]);
      setErroLista(null);
    } catch {
      setErroLista("Nao foi possivel carregar as conversas.");
    } finally {
      setCarregandoLista(false);
    }
  }, [finalidade]);

  useEffect(() => {
    void carregarConversas();
  }, [carregarConversas]);

  // Dono mudou (roteamento/assumir/transferir) -> recarrega a lista.
  // Conversa excluida (admin) -> remove da lista e fecha se estava aberta.
  useEffect(() => {
    const socket = getSocket();
    const recarregar = () => void carregarConversas();
    const onExcluida = (p: { conversaId?: string }) => {
      if (p?.conversaId) {
        setConversas((prev) => prev.filter((c) => c.id !== p.conversaId));
        if (selecionadaRef.current === p.conversaId) {
          setSelecionada(null);
          setMensagens([]);
        }
      } else {
        // Exclusao em massa (por numero): recarrega tudo.
        void carregarConversas();
        setSelecionada(null);
        setMensagens([]);
      }
    };
    socket.on("conversa:atualizada", recarregar);
    socket.on("conversa:excluida", onExcluida);
    return () => {
      socket.off("conversa:atualizada", recarregar);
      socket.off("conversa:excluida", onExcluida);
    };
  }, [carregarConversas]);

  const abrirConversa = useCallback(async (id: string) => {
    setSelecionada(id);
    setCarregandoThread(true);
    setMensagens([]);
    // Zera o badge localmente (a API tambem zera no servidor).
    setConversas((prev) =>
      prev.map((c) => (c.id === id ? { ...c, naoLidas: 0 } : c)),
    );
    try {
      const r = await fetch(`/api/conversas/${id}/mensagens`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setMensagens(d.mensagens as MensagemItem[]);
    } catch {
      setMensagens([]);
    } finally {
      setCarregandoThread(false);
    }
  }, []);

  // Deep-link opcional: /inbox?lead=<id> pre-abre a conversa daquele lead (ex.:
  // vindo da aba de Chamadas). Roda uma vez, quando a lista carrega. Aditivo.
  const leadAbertoRef = useRef(false);
  useEffect(() => {
    if (leadAbertoRef.current || conversas.length === 0) return;
    const leadId = new URLSearchParams(window.location.search).get("lead");
    if (!leadId) return;
    const conv = conversas.find((c) => c.leadId === leadId);
    if (conv) {
      leadAbertoRef.current = true;
      void abrirConversa(conv.id);
    }
  }, [conversas, abrirConversa]);

  // Socket ao vivo.
  useEffect(() => {
    const socket = getSocket();

    function onNova(evt: EventoMensagemNova) {
      const aberta = selecionadaRef.current === evt.conversaId;

      // 1) Thread aberta: anexa a mensagem (dedup por id).
      if (aberta) {
        setMensagens((prev) =>
          prev.some((m) => m.id === evt.mensagemId)
            ? prev
            : [
                ...prev,
                {
                  id: evt.mensagemId,
                  direcao: evt.direcao,
                  tipo: evt.tipo,
                  conteudo: evt.conteudo,
                  mediaUrl: evt.mediaUrl,
                  statusEnvio: evt.statusEnvio,
                  hora: evt.hora,
                  viaIA: evt.viaIA,
                },
              ],
        );
      }

      // 2) Lista: atualiza previa/horario, contador e reordena pro topo.
      setConversas((prev) => {
        const idx = prev.findIndex((c) => c.id === evt.conversaId);
        if (idx === -1) {
          // Conversa nova (lead recem-criado): recarrega do servidor.
          void carregarConversas();
          return prev;
        }
        const atual = prev[idx];
        const naoLidas = aberta
          ? 0
          : evt.direcao === "IN"
            ? evt.naoLidas
            : atual.naoLidas;
        const atualizado: ConversaItem = {
          ...atual,
          ultimaMensagemPreview: previewMensagem(evt.tipo, evt.conteudo),
          ultimaMensagemEm: evt.ultimaMensagemEm,
          naoLidas,
        };
        const resto = prev.filter((_, i) => i !== idx);
        return [atualizado, ...resto];
      });
    }

    // mediaUrl chegou depois (background/reprocessamento): atualiza a bolha.
    function onMidia(evt: EventoMidia) {
      if (selecionadaRef.current !== evt.conversaId) return;
      setMensagens((prev) =>
        prev.map((m) =>
          m.id === evt.mensagemId ? { ...m, mediaUrl: evt.mediaUrl } : m,
        ),
      );
    }

    socket.on("mensagem:nova", onNova);
    socket.on("mensagem:midia", onMidia);
    return () => {
      socket.off("mensagem:nova", onNova);
      socket.off("mensagem:midia", onMidia);
    };
  }, [carregarConversas]);

  // Mensagem OUT recem-enviada: anexa na thread e atualiza a lista.
  const aoEnviada = useCallback((msg: MensagemItem) => {
    setMensagens((prev) =>
      prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
    );
    setConversas((prev) => {
      const id = selecionadaRef.current;
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const atual = prev[idx];
      const atualizado: ConversaItem = {
        ...atual,
        ultimaMensagemPreview: previewMensagem(msg.tipo, msg.conteudo),
        ultimaMensagemEm: msg.hora,
      };
      const resto = prev.filter((_, i) => i !== idx);
      return [atualizado, ...resto];
    });
  }, []);

  // Aplica busca (sem acento, case-insensitive; telefone so digitos) + filtro.
  const filtradas = useMemo(() => {
    const q = normalizarTexto(buscaAplicada);
    const qDigitos = buscaAplicada.replace(/\D/g, "");
    return conversas.filter((c) => {
      if (filtro === "minhas" && c.agenteId !== agenteIdAtual) return false;
      if (filtro === "naoLidas" && c.naoLidas <= 0) return false;
      if (q) {
        const nome = normalizarTexto(c.leadNome ?? "");
        const tel = c.leadTelefone.replace(/\D/g, "");
        const casaNome = nome.includes(q);
        const casaTel = qDigitos.length > 0 && tel.includes(qDigitos);
        if (!casaNome && !casaTel) return false;
      }
      return true;
    });
  }, [conversas, buscaAplicada, filtro, agenteIdAtual]);

  const conversaAberta = useMemo(
    () => conversas.find((c) => c.id === selecionada) ?? null,
    [conversas, selecionada],
  );

  return (
    <div className="flex h-full">
      <ListaConversas
        conversas={filtradas}
        carregando={carregandoLista}
        erro={erroLista}
        selecionada={selecionada}
        busca={busca}
        filtro={filtro}
        finalidade={finalidade}
        mostrarFinalidade={ehAdmin}
        onBusca={setBusca}
        onFiltro={setFiltro}
        onFinalidade={setFinalidade}
        onSelecionar={abrirConversa}
        onTentar={() => void carregarConversas()}
      />

      {conversaAberta ? (
        <>
          <Thread
            conversa={conversaAberta}
            mensagens={mensagens}
            carregando={carregandoThread}
            onEnviada={aoEnviada}
            ehAdmin={ehAdmin}
            onExcluida={() => {
              const id = selecionadaRef.current;
              if (id) setConversas((prev) => prev.filter((c) => c.id !== id));
              setSelecionada(null);
              setMensagens([]);
            }}
          />
          {/* Coluna de dados do cliente (email/CPF/nascimento/endereco/anuncio).
              Aparece em telas largas; no mobile a thread ocupa tudo. */}
          {conversaAberta.leadId && (
            <aside className="hidden w-[360px] shrink-0 border-l border-black/5 xl:block">
              <PainelClienteInbox
                leadId={conversaAberta.leadId}
                negocioId={conversaAberta.negocioId}
              />
            </aside>
          )}
        </>
      ) : (
        <div className="hidden flex-1 flex-col items-center justify-center gap-3 bg-fundo text-center sm:flex">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-tiffany/10">
            <MessageSquare className="h-7 w-7 text-tiffany" />
          </div>
          <p className="text-sm text-medio/60">
            Selecione uma conversa para comecar a atender.
          </p>
        </div>
      )}
    </div>
  );
}
