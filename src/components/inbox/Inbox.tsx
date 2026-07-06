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
import type { ViaOtimista } from "./Compositor";
import {
  adicionarOtimista,
  reconciliarOtimista,
  marcarErroOtimista,
  removerOtimista,
  mesclarSocket,
} from "@/lib/otimista";
import { PainelClienteInbox } from "./PainelClienteInbox";
import {
  paramsPeriodo,
  PERIODO_TODOS,
  type PeriodoEntrada,
} from "@/components/ui/FiltroPeriodoEntrada";
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
  // Filtro por entrada do atendimento (conversa.criadoEm).
  const [periodo, setPeriodo] = useState<PeriodoEntrada>(PERIODO_TODOS);

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
      const p = new URLSearchParams();
      if (finalidade) p.set("finalidade", finalidade);
      // Periodo por entrada (conversa.criadoEm): hoje|7d|15d|30d|custom.
      for (const [k, v] of Object.entries(paramsPeriodo(periodo))) p.set(k, v);
      const qs = p.toString();
      const r = await fetch(`/api/conversas${qs ? `?${qs}` : ""}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setConversas(d.conversas as ConversaItem[]);
      setErroLista(null);
    } catch {
      setErroLista("Nao foi possivel carregar as conversas.");
    } finally {
      setCarregandoLista(false);
    }
  }, [finalidade, periodo]);

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
  // vindo da lista de Clientes ou de uma notificacao). Roda uma vez, quando a
  // lista carrega. Aditivo.
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

      // 1) Thread aberta: anexa a mensagem. Dedup por id real E reconciliacao da
      // bolha otimista pelo clientId (Fatia 3.11) — nunca aparece duas vezes.
      if (aberta) {
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
              viaIA: evt.viaIA,
            }),
          ),
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

    // Reacao (nossa ou do cliente) mudou: atualiza a bolha na thread aberta.
    function onReacao(evt: {
      conversaId: string;
      mensagemId: string;
      reacao?: string | null;
      reacaoDeCliente?: string | null;
    }) {
      if (selecionadaRef.current !== evt.conversaId) return;
      setMensagens((prev) =>
        prev.map((m) =>
          m.id === evt.mensagemId
            ? {
                ...m,
                ...(evt.reacao !== undefined ? { reacao: evt.reacao } : {}),
                ...(evt.reacaoDeCliente !== undefined
                  ? { reacaoDeCliente: evt.reacaoDeCliente }
                  : {}),
              }
            : m,
        ),
      );
    }

    // Edicao de mensagem (nossa ou do cliente): atualiza o conteudo + marca editada.
    function onEditada(evt: {
      conversaId: string;
      mensagemId: string;
      conteudo: string;
    }) {
      if (selecionadaRef.current !== evt.conversaId) return;
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
    socket.on("mensagem:reacao", onReacao);
    socket.on("mensagem:editada", onEditada);
    return () => {
      socket.off("mensagem:nova", onNova);
      socket.off("mensagem:midia", onMidia);
      socket.off("mensagem:reacao", onReacao);
      socket.off("mensagem:editada", onEditada);
    };
  }, [carregarConversas]);

  // Atualiza a lista (previa/horario + reordena pro topo) para uma mensagem OUT
  // da conversa aberta. Reusado pelo envio direto (audio/arquivo/contato) e pela
  // bolha otimista de texto.
  const bumpLista = useCallback((msg: MensagemItem) => {
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

  // Mensagem OUT recem-enviada (audio/arquivo/contato — envio direto): anexa na
  // thread e atualiza a lista. O texto usa a via otimista abaixo.
  const aoEnviada = useCallback(
    (msg: MensagemItem) => {
      setMensagens((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
      );
      bumpLista(msg);
    },
    [bumpLista],
  );

  // Via de render OTIMISTA do texto (Fatia 3.11): a bolha "enviando" aparece na
  // hora e e reconciliada (tmp -> real) quando a API responde; ou marcada ERRO /
  // removida em falha. A dedup com o socket usa o clientId (ver mesclarSocket).
  const otimista = useMemo<ViaOtimista>(
    () => ({
      adicionar: (msg) => {
        setMensagens((prev) => adicionarOtimista(prev, msg));
        bumpLista(msg);
      },
      reconciliar: (clientId, real) =>
        setMensagens((prev) => reconciliarOtimista(prev, clientId, real)),
      falhar: (clientId, remover) =>
        setMensagens((prev) =>
          remover
            ? removerOtimista(prev, clientId)
            : marcarErroOtimista(prev, clientId),
        ),
    }),
    [bumpLista],
  );

  // Busca por CONTEUDO das mensagens (backend, escopado). Dispara so quando ha
  // termo; resultados trazem trechoBusca. Cancela requisicoes obsoletas.
  const [resConteudo, setResConteudo] = useState<ConversaItem[]>([]);
  useEffect(() => {
    const q = buscaAplicada.trim();
    if (!q) {
      setResConteudo([]);
      return;
    }
    let cancelado = false;
    const qs = new URLSearchParams({ texto: q });
    if (finalidade) qs.set("finalidade", finalidade);
    for (const [k, v] of Object.entries(paramsPeriodo(periodo))) qs.set(k, v);
    fetch(`/api/conversas?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : { conversas: [] }))
      .then((d) => {
        if (!cancelado) setResConteudo((d.conversas ?? []) as ConversaItem[]);
      })
      .catch(() => {
        if (!cancelado) setResConteudo([]);
      });
    return () => {
      cancelado = true;
    };
  }, [buscaAplicada, finalidade, periodo]);

  // Aplica busca (nome/telefone local, sem acento) + filtro. Ao buscar, une os
  // resultados por CONTEUDO (backend) — dedup por id, preservando o trecho.
  const filtradas = useMemo(() => {
    const q = normalizarTexto(buscaAplicada);
    const qDigitos = buscaAplicada.replace(/\D/g, "");
    const passaFiltro = (c: ConversaItem) => {
      if (filtro === "minhas" && c.agenteId !== agenteIdAtual) return false;
      if (filtro === "naoLidas" && c.naoLidas <= 0) return false;
      return true;
    };
    const locais = conversas.filter((c) => {
      if (!passaFiltro(c)) return false;
      if (q) {
        const nome = normalizarTexto(c.leadNome ?? "");
        const tel = c.leadTelefone.replace(/\D/g, "");
        const casaNome = nome.includes(q);
        const casaTel = qDigitos.length > 0 && tel.includes(qDigitos);
        if (!casaNome && !casaTel) return false;
      }
      return true;
    });
    if (!buscaAplicada.trim()) return locais;
    // Une com os que bateram no conteudo (respeitando o mesmo filtro).
    const mapa = new Map<string, ConversaItem>(locais.map((c) => [c.id, c]));
    for (const c of resConteudo) {
      if (!passaFiltro(c)) continue;
      const existente = mapa.get(c.id);
      if (!existente) mapa.set(c.id, c);
      else if (c.trechoBusca && !existente.trechoBusca) {
        mapa.set(c.id, { ...existente, trechoBusca: c.trechoBusca });
      }
    }
    return Array.from(mapa.values());
  }, [conversas, buscaAplicada, filtro, agenteIdAtual, resConteudo]);

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
        periodo={periodo}
        contadorPeriodo={conversas.length}
        onBusca={setBusca}
        onFiltro={setFiltro}
        onFinalidade={setFinalidade}
        onPeriodo={setPeriodo}
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
            otimista={otimista}
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
                ehAdmin={ehAdmin}
                agenteIdAtual={agenteIdAtual}
                onMensagemEnviada={aoEnviada}
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
