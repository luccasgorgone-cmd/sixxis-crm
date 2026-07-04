"use client";

// Embute a conversa do WhatsApp do lead dentro do painel do negocio, reusando
// o componente Thread da inbox (com compositor). Faz fetch + socket ao vivo.
import { useState, useEffect } from "react";
import { getSocket } from "@/lib/socketClient";
import { Thread } from "@/components/inbox/Thread";
import type {
  MensagemItem,
  ConversaItem,
  EventoMensagemNova,
  EventoMidia,
} from "@/components/inbox/tipos";

export function ConversaEmbed({
  conversaId,
  leadNome,
  leadTelefone,
  atendidoPor,
  ehAdmin = false,
}: {
  conversaId: string;
  leadNome: string | null;
  leadTelefone: string;
  atendidoPor: "HUMANO" | "IA" | null;
  ehAdmin?: boolean;
}) {
  const [mensagens, setMensagens] = useState<MensagemItem[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    fetch(`/api/conversas/${conversaId}/mensagens`)
      .then((r) => (r.ok ? r.json() : { mensagens: [] }))
      .then((d) => {
        if (vivo) setMensagens(d.mensagens ?? []);
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
              },
            ],
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
  };

  function aoEnviada(msg: MensagemItem) {
    setMensagens((prev) =>
      prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Thread
        conversa={conversa}
        mensagens={mensagens}
        carregando={carregando}
        onEnviada={aoEnviada}
        ehAdmin={ehAdmin}
        embutida
      />
    </div>
  );
}
