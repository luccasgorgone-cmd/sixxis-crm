"use client";

// Embute a conversa do WhatsApp do lead dentro do painel do negocio, reusando
// o componente Thread da inbox (com compositor). Faz fetch + socket ao vivo.
import { useState, useEffect, useMemo, useCallback } from "react";
import { getSocket } from "@/lib/socketClient";
import { Thread } from "@/components/inbox/Thread";
import type { ViaOtimista } from "@/components/inbox/Compositor";
import {
  adicionarOtimista,
  reconciliarOtimista,
  marcarErroOtimista,
  removerOtimista,
  mesclarSocket,
} from "@/lib/otimista";
import type {
  MensagemItem,
  ConversaItem,
  EventoMensagemNova,
  EventoMidia,
  Finalidade,
} from "@/components/inbox/tipos";

export function ConversaEmbed({
  conversaId,
  leadNome,
  leadTelefone,
  atendidoPor,
  ehAdmin = false,
  onRegistrarInjetor,
}: {
  conversaId: string;
  leadNome: string | null;
  leadTelefone: string;
  atendidoPor: "HUMANO" | "IA" | null;
  ehAdmin?: boolean;
  // Expoe ao painel pai (PainelNegocio) o injetor de mensagem OUT desta thread,
  // para o BlocoOrcamento inserir a bolha do PDF na hora do envio. Fatia 3.15.
  onRegistrarInjetor?: (fn: (msg: MensagemItem) => void) => void;
}) {
  const [mensagens, setMensagens] = useState<MensagemItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  // Finalidade da conversa (vem do endpoint de mensagens): usada pelo card de
  // contato para abrir/criar a conversa no funil certo. Fatia 2.96.
  const [finalidade, setFinalidade] = useState<Finalidade | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    fetch(`/api/conversas/${conversaId}/mensagens`)
      .then((r) => (r.ok ? r.json() : { mensagens: [] }))
      .then((d) => {
        if (vivo) {
          setMensagens(d.mensagens ?? []);
          setFinalidade(d.conversa?.finalidade);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [conversaId]);

  useEffect(() => {
    const socket = getSocket();
    function onNova(evt: EventoMensagemNova) {
      if (evt.conversaId !== conversaId) return;
      // Dedup por id real + reconciliacao da bolha otimista pelo clientId (3.11).
      setMensagens((prev) =>
        mesclarSocket(
          prev,
          { mensagemId: evt.mensagemId, clientId: evt.clientId },
          () => ({
            id: evt.mensagemId,
            direcao: evt.direcao,
            tipo: evt.tipo,
            conteudo: evt.conteudo,
            mediaUrl: evt.mediaUrl,
            statusEnvio: evt.statusEnvio,
            hora: evt.hora,
          }),
        ),
      );
    }
    function onMidia(evt: EventoMidia) {
      if (evt.conversaId !== conversaId) return;
      setMensagens((prev) =>
        prev.map((m) =>
          m.id === evt.mensagemId ? { ...m, mediaUrl: evt.mediaUrl } : m,
        ),
      );
    }
    function onEditada(evt: {
      conversaId: string;
      mensagemId: string;
      conteudo: string;
    }) {
      if (evt.conversaId !== conversaId) return;
      setMensagens((prev) =>
        prev.map((m) =>
          m.id === evt.mensagemId
            ? { ...m, conteudo: evt.conteudo, editada: true }
            : m,
        ),
      );
    }
    socket.on("mensagem:nova", onNova);
    socket.on("mensagem:midia", onMidia);
    socket.on("mensagem:editada", onEditada);
    return () => {
      socket.off("mensagem:nova", onNova);
      socket.off("mensagem:midia", onMidia);
      socket.off("mensagem:editada", onEditada);
    };
  }, [conversaId]);

  const conversa: ConversaItem = {
    id: conversaId,
    leadNome,
    leadTelefone,
    atendidoPor: atendidoPor ?? "HUMANO",
    naoLidas: 0,
    ultimaMensagemPreview: null,
    ultimaMensagemEm: null,
    agenteId: null,
    finalidade,
  };

  const aoEnviada = useCallback((msg: MensagemItem) => {
    setMensagens((prev) =>
      prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
    );
  }, []);

  // Registra o injetor no pai (uma vez / quando muda): o BlocoOrcamento chama-o
  // para a bolha do PDF aparecer nesta thread na hora. Dedupe por id real com o
  // socket "mensagem:nova" (mesclarSocket ja evita duplicar).
  useEffect(() => {
    onRegistrarInjetor?.(aoEnviada);
  }, [onRegistrarInjetor, aoEnviada]);

  // Via otimista do texto (Fatia 3.11): mesma logica do Inbox, sem lista lateral.
  const otimista = useMemo<ViaOtimista>(
    () => ({
      adicionar: (msg) => setMensagens((prev) => adicionarOtimista(prev, msg)),
      reconciliar: (clientId, real) =>
        setMensagens((prev) => reconciliarOtimista(prev, clientId, real)),
      falhar: (clientId, remover) =>
        setMensagens((prev) =>
          remover
            ? removerOtimista(prev, clientId)
            : marcarErroOtimista(prev, clientId),
        ),
    }),
    [],
  );

  return (
    <div className="flex h-full flex-col">
      <Thread
        conversa={conversa}
        mensagens={mensagens}
        carregando={carregando}
        onEnviada={aoEnviada}
        otimista={otimista}
        ehAdmin={ehAdmin}
        embutida
      />
    </div>
  );
}
