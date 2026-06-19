"use client";

// Orquestrador da inbox: carrega a lista, abre a thread, escuta o socket
// "mensagem:nova" e mantem lista + thread atualizadas AO VIVO (sem refresh).
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { getSocket } from "@/lib/socketClient";
import { previewMensagem } from "@/lib/preview";
import { ListaConversas } from "./ListaConversas";
import { Thread } from "./Thread";
import type {
  ConversaItem,
  MensagemItem,
  EventoMensagemNova,
  Filtro,
} from "./tipos";

export function Inbox({ agenteIdAtual }: { agenteIdAtual: string }) {
  const [conversas, setConversas] = useState<ConversaItem[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erroLista, setErroLista] = useState<string | null>(null);

  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemItem[]>([]);
  const [carregandoThread, setCarregandoThread] = useState(false);

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");

  // Ref para o socket ler a conversa aberta sem recriar o listener.
  const selecionadaRef = useRef<string | null>(null);
  selecionadaRef.current = selecionada;

  const carregarConversas = useCallback(async () => {
    try {
      const r = await fetch("/api/conversas");
      if (!r.ok) throw new Error();
      const d = await r.json();
      setConversas(d.conversas as ConversaItem[]);
      setErroLista(null);
    } catch {
      setErroLista("Nao foi possivel carregar as conversas.");
    } finally {
      setCarregandoLista(false);
    }
  }, []);

  useEffect(() => {
    void carregarConversas();
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
                  statusEnvio: evt.statusEnvio,
                  hora: evt.hora,
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

    socket.on("mensagem:nova", onNova);
    return () => {
      socket.off("mensagem:nova", onNova);
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

  // Aplica busca + filtro.
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, "");
    return conversas.filter((c) => {
      if (filtro === "minhas" && c.agenteId !== agenteIdAtual) return false;
      if (filtro === "naoLidas" && c.naoLidas <= 0) return false;
      if (q) {
        const nome = (c.leadNome ?? "").toLowerCase();
        const tel = c.leadTelefone.replace(/\D/g, "");
        const casaNome = nome.includes(q);
        const casaTel = qDigitos.length > 0 && tel.includes(qDigitos);
        if (!casaNome && !casaTel) return false;
      }
      return true;
    });
  }, [conversas, busca, filtro, agenteIdAtual]);

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
        onBusca={setBusca}
        onFiltro={setFiltro}
        onSelecionar={abrirConversa}
      />

      {conversaAberta ? (
        <Thread
          conversa={conversaAberta}
          mensagens={mensagens}
          carregando={carregandoThread}
          onEnviada={aoEnviada}
        />
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
