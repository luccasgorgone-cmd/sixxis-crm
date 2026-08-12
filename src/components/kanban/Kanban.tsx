"use client";

// Orquestrador do Kanban: carrega negocios (filtrados por papel), drag-and-drop
// entre etapas com persistencia otimista, modais de ganho/perdido, filtros e
// atualizacao em tempo real. Clicar no card abre o painel (drawer).
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { getSocket } from "@/lib/socketClient";
import { ColunaKanban } from "./ColunaKanban";
import { CardNegocio } from "./CardNegocio";
import { corFinalidade } from "@/components/BadgeFinalidade";
import { BarraFiltros } from "./BarraFiltros";
import { ModalFechamento, type DadosFechamento } from "./ModalFechamento";
import { ModalAtribuir } from "./ModalAtribuir";
import { PainelNegocio } from "./PainelNegocio";
import { EstadoErro } from "@/components/ui/Estado";
import { BannerAviso } from "@/components/ui/Banner";
import { useToast } from "@/components/ui/Toast";
import {
  paramsPeriodo,
  PERIODO_TODOS,
  type PeriodoEntrada,
} from "@/components/ui/FiltroPeriodoEntrada";
import type {
  Etapa,
  CardNegocio as Card,
  EtiquetaChip,
  AgenteResumo,
  EventoNegocio,
  FiltroDono,
  Finalidade,
} from "./tipos";
import { compararPin } from "@/lib/ordenacao";

// Ordem das NAO fixadas dentro da coluna, espelhando o servidor (ordemDaEtapa):
// ultima mensagem desc com os sem-mensagem no fim, desempate pela entrada na
// etapa e pelo id desc. Usada so para reencaixar um card desafixado.
function compararFluxo(a: Card, b: Card): number {
  return (
    compararPin(a.ultimaMensagemEm, b.ultimaMensagemEm) ||
    compararPin(a.entrouEtapaEm, b.entrouEtapaEm) ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
}

// Reencaixa um card JA ATUALIZADO na coluna em que ele esta: fixado vai ao topo
// (pin mais recente primeiro, como o servidor monta a coluna); nao fixado entra
// na posicao que compararFluxo lhe da, logo abaixo das fixadas.
//
// REGRA DE OURO do tempo real: esta funcao so REORDENA DENTRO da coluna. Nunca
// troca de etapa, nunca cria e nunca remove card — se o card nao estiver na
// coluna informada, devolve o estado intacto (no-op).
function recolocarNaColuna(
  colunas: Record<string, Card[]>,
  etapaId: string,
  atualizado: Card,
): Record<string, Card[]> {
  const atuais = colunas[etapaId];
  if (!atuais) return colunas;
  const resto = atuais.filter((c) => c.id !== atualizado.id);
  if (resto.length === atuais.length) return colunas;
  let pos = 0;
  if (!atualizado.fixadaEm) {
    const i = resto.findIndex(
      (c) => !c.fixadaEm && compararFluxo(atualizado, c) <= 0,
    );
    pos = i === -1 ? resto.length : i;
  }
  return {
    ...colunas,
    [etapaId]: [...resto.slice(0, pos), atualizado, ...resto.slice(pos)],
  };
}

// Localiza um card pela conversa (chave que os eventos de socket carregam).
// Devolve tambem a etapa em que ele ESTA — e ela que manda no reencaixe, nunca
// o evento. Fora da tela (paginado, filtrado, outro funil) -> null -> no-op.
function acharPorConversa(
  colunas: Record<string, Card[]>,
  conversaId: string,
): { etapaId: string; card: Card } | null {
  for (const [etapaId, cards] of Object.entries(colunas)) {
    const card = cards.find((c) => c.conversaId === conversaId);
    if (card) return { etapaId, card };
  }
  return null;
}

// Troca a marcacao manual de nao-lida de UM card, sem reordenar (marcar nao
// muda a ordem da coluna) e sem tocar em card que nao esta na tela.
function marcarNoCard(
  colunas: Record<string, Card[]>,
  etapaId: string,
  cardId: string,
  marcada: boolean,
): Record<string, Card[]> {
  const atuais = colunas[etapaId];
  if (!atuais?.some((c) => c.id === cardId)) return colunas;
  return {
    ...colunas,
    [etapaId]: atuais.map((c) =>
      c.id === cardId ? { ...c, marcadaNaoLida: marcada } : c,
    ),
  };
}

// Recoloca UM card na coluna depois de fixar/desafixar, sem mexer nos outros.
function reposicionarPin(
  colunas: Record<string, Card[]>,
  etapaId: string,
  cardId: string,
  fixadaEm: string | null,
): Record<string, Card[]> {
  const alvo = colunas[etapaId]?.find((c) => c.id === cardId);
  if (!alvo) return colunas;
  return recolocarNaColuna(colunas, etapaId, { ...alvo, fixadaEm });
}

type Pendente = {
  tipo: "ganho" | "perdido";
  negocioId: string;
  etapaId: string;
  origemEtapaId: string | null;
  valorInicial: number | null;
};

// Resumo agregado por etapa vindo da rota (Fatia P).
type ResumoEtapa = { total: number; somaValor: number };
// Cursor de paginacao por etapa (Fatia Q). `offset` conta as NAO FIXADAS ja
// carregadas — e o que a rota espera de volta no "carregar mais".
type PaginaEtapa = { offset: number; temMais: boolean; carregados: number };

export function Kanban({
  papel,
  agenteIdAtual,
  acessoVenda = false,
  acessoPosVenda = false,
}: {
  papel: string;
  agenteIdAtual: string;
  acessoVenda?: boolean;
  acessoPosVenda?: boolean;
}) {
  const ehAdmin = papel === "ADMIN";
  const toast = useToast();

  // Finalidades que o usuario pode ver: admin ve as duas; os demais veem as que
  // tem acesso. Quem tem venda + pos-venda ve/alterna os DOIS funis.
  const finalidadesAcessiveis: Finalidade[] = ehAdmin
    ? ["VENDA", "POS_VENDA"]
    : [
        ...(acessoVenda ? (["VENDA"] as Finalidade[]) : []),
        ...(acessoPosVenda ? (["POS_VENDA"] as Finalidade[]) : []),
      ];
  const finalidadesEfetivas =
    finalidadesAcessiveis.length > 0 ? finalidadesAcessiveis : (["VENDA"] as Finalidade[]);

  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [colunas, setColunas] = useState<Record<string, Card[]>>({});
  // Resumo por etapa (Fatia P): total (COUNT) e somaValor (SUM) do banco.
  const [resumo, setResumo] = useState<Record<string, ResumoEtapa>>({});
  // Paginacao por etapa (Fatia Q) + quais colunas estao buscando o proximo lote.
  const [paginacao, setPaginacao] = useState<Record<string, PaginaEtapa>>({});
  const [carregandoMais, setCarregandoMais] = useState<Record<string, boolean>>(
    {},
  );
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [etiquetas, setEtiquetas] = useState<EtiquetaChip[]>([]);
  const [agentes, setAgentes] = useState<AgenteResumo[]>([]);
  // Atribuicao manual (modal): lista de negocioIds + titulo.
  const [atribuir, setAtribuir] = useState<{
    negocioIds: string[];
    titulo: string;
  } | null>(null);

  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [etiquetaId, setEtiquetaId] = useState("");
  const [temperatura, setTemperatura] = useState("");
  const [filtroDono, setFiltroDono] = useState<FiltroDono>(
    ehAdmin ? "todos" : "meus",
  );
  const [agenteId, setAgenteId] = useState("");
  // Filtro por entrada do atendimento (quando o negocio foi criado).
  const [periodo, setPeriodo] = useState<PeriodoEntrada>(PERIODO_TODOS);
  // Default: a primeira finalidade acessivel (evita pedir um funil sem acesso).
  const [finalidade, setFinalidade] = useState<Finalidade>(finalidadesEfetivas[0]);

  const [ativo, setAtivo] = useState<Card | null>(null);
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Debounce da busca.
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  // (Fatia P) A busca por CONTEUDO das conversas passou ao servidor (where da
  // rota /api/negocios). Nao ha mais coleta client-side de telefones.

  // Pos-venda nao usa temperatura: limpa o filtro ao entrar (o select some, entao
  // um filtro remanescente esconderia cards sem o usuario poder limpar).
  useEffect(() => {
    if (finalidade === "POS_VENDA") setTemperatura("");
  }, [finalidade]);

  // Servidor (Fatia P): finalidade + dono + periodo + BUSCA/TEMPERATURA/ETIQUETA.
  // Antes esses tres filtravam no client sobre os cards carregados; agora vao ao
  // `where` da rota (busca debounced), para o resumo/contadores e a paginacao
  // futura serem fieis. A busca (nome sem acento + telefone + conteudo de conversa)
  // e resolvida no servidor.
  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("finalidade", finalidade);
    if (ehAdmin) {
      p.set("filtro", filtroDono);
      if (filtroDono === "todos" && agenteId) p.set("agenteId", agenteId);
    }
    // Periodo por entrada (negocio.criadoEm): hoje|7d|15d|30d|custom.
    for (const [k, v] of Object.entries(paramsPeriodo(periodo))) p.set(k, v);
    const q = buscaAplicada.trim();
    if (q) p.set("busca", q);
    if (temperatura) p.set("temperatura", temperatura);
    if (etiquetaId) p.set("etiquetaId", etiquetaId);
    return p.toString();
  }, [finalidade, ehAdmin, filtroDono, agenteId, periodo, buscaAplicada, temperatura, etiquetaId]);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/negocios?${query}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setEtapas(d.etapas as Etapa[]);
      setColunas(d.colunas as Record<string, Card[]>);
      // Resumo por etapa (Fatia P): total e somaValor do banco, para o cabecalho
      // da coluna nao depender dos cards carregados.
      setResumo((d.resumo as Record<string, ResumoEtapa>) ?? {});
      // Fatia Q: o quadro volta ao PRIMEIRO lote de cada coluna. Recarregar
      // (troca de filtro, evento de tempo real, volta do foco) reinicia os
      // cursores — quem tinha expandido uma coluna clica de novo.
      setPaginacao((d.paginacao as Record<string, PaginaEtapa>) ?? {});
      setCarregandoMais({});
      setErro(null);
    } catch {
      setErro("Nao foi possivel carregar o quadro.");
    } finally {
      setCarregando(false);
    }
  }, [query]);

  // "Carregar mais" de UMA coluna: pede o proximo lote de nao fixadas mantendo
  // TODOS os filtros ativos (mesmo `query` do quadro) e anexa ao fim da coluna.
  const carregarMais = useCallback(
    async (etapaId: string) => {
      const pagina = paginacao[etapaId];
      if (!pagina?.temMais || carregandoMais[etapaId]) return;
      setCarregandoMais((p) => ({ ...p, [etapaId]: true }));
      try {
        const r = await fetch(
          `/api/negocios?${query}&etapaId=${encodeURIComponent(etapaId)}&offset=${pagina.offset}`,
        );
        if (!r.ok) throw new Error();
        const d = await r.json();
        const novos = (d.cards ?? []) as Card[];
        // Cinto-e-suspensorio: se um card mudou de etapa entre os dois fetches,
        // o deslocamento poderia repeti-lo — o id ja na coluna manda.
        setColunas((prev) => {
          const atuais = prev[etapaId] ?? [];
          const vistos = new Set(atuais.map((c) => c.id));
          return {
            ...prev,
            [etapaId]: [...atuais, ...novos.filter((c) => !vistos.has(c.id))],
          };
        });
        setPaginacao((prev) => {
          const p = prev[etapaId];
          return {
            ...prev,
            [etapaId]: {
              offset: Number(d.offset ?? (p?.offset ?? 0) + novos.length),
              temMais: Boolean(d.temMais),
              carregados: (p?.carregados ?? 0) + novos.length,
            },
          };
        });
      } catch {
        toast.erro("Nao foi possivel carregar mais cards.");
      } finally {
        setCarregandoMais((p) => ({ ...p, [etapaId]: false }));
      }
    },
    [paginacao, carregandoMais, query, toast],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Recarrega ao voltar o foco/visibilidade: negocios criados enquanto o Kanban
  // estava fora (ex.: "Conversar" no Inbox) aparecem sem F5 forcado. Fatia 3.07.
  useEffect(() => {
    function aoVoltar() {
      if (document.visibilityState === "visible") void carregar();
    }
    window.addEventListener("focus", aoVoltar);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.removeEventListener("focus", aoVoltar);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [carregar]);

  // Listas auxiliares (uma vez).
  useEffect(() => {
    fetch("/api/etiquetas")
      .then((r) => (r.ok ? r.json() : { etiquetas: [] }))
      .then((d) => setEtiquetas(d.etiquetas ?? []))
      .catch(() => undefined);
    if (ehAdmin) {
      fetch("/api/agentes")
        .then((r) => (r.ok ? r.json() : { agentes: [] }))
        .then((d) => setAgentes(d.agentes ?? []))
        .catch(() => undefined);
    }
  }, [ehAdmin]);

  // Tempo real: qualquer mudanca de negocio recarrega o quadro (exceto durante
  // um arraste em andamento, para nao "pular" o card).
  const arrastandoRef = useRef(false);
  // Bloco 3 — eco do PROPRIO pin. A rota /fixar emite conversa:atualizada para
  // todos os clientes, e o listener abaixo recarrega o quadro: depois de um pin
  // feito AQUI (ja refletido otimista) isso so serviria para colapsar as colunas
  // expandidas. Marcamos a janela do nosso pin e PULAMOS UM unico eco dentro
  // dela. O payload do evento nao carrega conversaId (so leadId + finalidade),
  // entao o casamento possivel e finalidade + janela curta. Ecos de OUTRAS
  // origens (roteamento, transferencia, marcar nao lida, pin feito no Inbox)
  // continuam recarregando; a janela expira sozinha.
  const ecoLocalRef = useRef<{ finalidade: string; ate: number } | null>(null);
  useEffect(() => {
    const socket = getSocket();
    function onEvt(_e: EventoNegocio) {
      if (arrastandoRef.current) return;
      void carregar();
    }
    // Fatia Y: fixar/desafixar uma conversa altera a ordem da coluna (fixadas
    // primeiro) — recarrega o quadro para refletir o pin ao vivo.
    function onConversa(e?: { finalidade?: string }) {
      if (arrastandoRef.current) return;
      const eco = ecoLocalRef.current;
      if (
        eco &&
        Date.now() < eco.ate &&
        (!e?.finalidade || e.finalidade === eco.finalidade)
      ) {
        // Consome UM eco: o proximo evento volta a recarregar normalmente.
        ecoLocalRef.current = null;
        return;
      }
      void carregar();
    }
    // CIRURGICO: mensagem nova mexe em UM card que JA esta na tela — sobe na
    // propria coluna e atualiza o badge de nao-lida. Sem recarga: as colunas
    // expandidas com "carregar mais" continuam expandidas. Card fora do estado
    // (paginado, filtrado, outro funil) e IGNORADO — o F5 resolve.
    function onMensagem(e: {
      conversaId?: string;
      naoLidas?: number;
      ultimaMensagemEm?: string;
    }) {
      if (arrastandoRef.current || !e?.conversaId) return;
      const conversaId = e.conversaId;
      setColunas((prev) => {
        const achado = acharPorConversa(prev, conversaId);
        if (!achado) return prev;
        return recolocarNaColuna(prev, achado.etapaId, {
          ...achado.card,
          // Defensivo: so aceita o que o evento realmente trouxe.
          naoLidas:
            typeof e.naoLidas === "number" ? e.naoLidas : achado.card.naoLidas,
          ultimaMensagemEm: e.ultimaMensagemEm ?? achado.card.ultimaMensagemEm,
        });
      });
    }
    // CIRURGICO: conversa aberta -> some o badge daquele card. O servidor SO
    // emite este evento quando quem abriu e o DONO da conversa (a inspecao do
    // admin nao zera contador alheio, e isso e proposital) — aqui a tela apenas
    // REFLETE o que ja aconteceu no banco, sem regra propria de permissao.
    // Ler nao muda ordem: nao reposiciona nada.
    function onLida(e: { conversaId?: string }) {
      if (!e?.conversaId) return;
      const conversaId = e.conversaId;
      setColunas((prev) => {
        const achado = acharPorConversa(prev, conversaId);
        if (!achado) return prev;
        const { etapaId, card } = achado;
        if (card.naoLidas === 0 && !card.marcadaNaoLida) return prev;
        return {
          ...prev,
          [etapaId]: prev[etapaId].map((c) =>
            c.id === card.id ? { ...c, naoLidas: 0, marcadaNaoLida: false } : c,
          ),
        };
      });
    }
    socket.on("negocio:atualizado", onEvt);
    socket.on("conversa:atualizada", onConversa);
    socket.on("mensagem:nova", onMensagem);
    socket.on("conversa:lida", onLida);
    return () => {
      socket.off("negocio:atualizado", onEvt);
      socket.off("conversa:atualizada", onConversa);
      socket.off("mensagem:nova", onMensagem);
      socket.off("conversa:lida", onLida);
    };
  }, [carregar]);

  // ---- Helpers de estado ----
  function acharCard(id: string): { card: Card; etapaId: string } | null {
    for (const [eid, cards] of Object.entries(colunas)) {
      const card = cards.find((c) => c.id === id);
      if (card) return { card, etapaId: eid };
    }
    return null;
  }

  function moverLocal(negocioId: string, destinoEtapaId: string) {
    setColunas((prev) => {
      const novo: Record<string, Card[]> = {};
      let alvo: Card | null = null;
      for (const [eid, cards] of Object.entries(prev)) {
        const restantes: Card[] = [];
        for (const c of cards) {
          if (c.id === negocioId) alvo = c;
          else restantes.push(c);
        }
        novo[eid] = restantes;
      }
      if (alvo) {
        const atualizado: Card = {
          ...alvo,
          etapaId: destinoEtapaId,
          entrouEtapaEm: new Date().toISOString(),
        };
        novo[destinoEtapaId] = [atualizado, ...(novo[destinoEtapaId] ?? [])];
      }
      return novo;
    });
  }

  async function patch(
    id: string,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      const r = await fetch(`/api/negocios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  // Pin do card (Fatia Y, agora acionavel tambem no Kanban): fixa/desafixa a
  // conversa da finalidade pela MESMA rota do Inbox — e a mesma fixadaEm, entao
  // o pin feito aqui aparece la e vice-versa. Otimista e LOCAL: reposiciona so o
  // card tocado dentro da coluna, sem chamar carregar(), para nao colapsar as
  // colunas que o usuario ja expandiu com "carregar mais". Falha reverte.
  async function alternarFixar(card: Card) {
    if (!card.conversaId || !card.etapaId) return;
    const etapaId = card.etapaId;
    const anterior = card.fixadaEm ?? null;
    const novo = anterior ? null : new Date().toISOString();
    setColunas((prev) => reposicionarPin(prev, etapaId, card.id, novo));
    // Bloco 3: a tela ja refletiu — o eco deste pin nao precisa recarregar.
    ecoLocalRef.current = { finalidade: card.finalidade, ate: Date.now() + 1500 };
    try {
      const r = await fetch(`/api/conversas/${card.conversaId}/fixar`, {
        method: "POST",
      });
      if (!r.ok) throw new Error();
    } catch {
      setColunas((prev) => reposicionarPin(prev, etapaId, card.id, anterior));
      toast.erro(
        novo ? "Nao foi possivel fixar." : "Nao foi possivel desafixar.",
      );
    }
  }

  // Marcar como nao lida pelo card — mesma rota que o menu do Inbox usa, sobre a
  // mesma Conversa.marcadaNaoLida. Otimista e local (marcar nao muda a ordem da
  // coluna), sem recarregar; falha reverte. A volta ("marcar como lida") e o
  // proprio ato de abrir a conversa, que so zera para o dono — regra do servidor
  // que esta fatia nao toca.
  async function marcarNaoLida(card: Card) {
    if (!card.conversaId || !card.etapaId || card.marcadaNaoLida) return;
    const etapaId = card.etapaId;
    setColunas((prev) => marcarNoCard(prev, etapaId, card.id, true));
    // Esta rota tambem emite conversa:atualizada: pula o eco da propria acao.
    ecoLocalRef.current = { finalidade: card.finalidade, ate: Date.now() + 1500 };
    try {
      const r = await fetch(
        `/api/conversas/${card.conversaId}/marcar-nao-lida`,
        { method: "POST" },
      );
      if (!r.ok) throw new Error();
    } catch {
      setColunas((prev) => marcarNoCard(prev, etapaId, card.id, false));
      toast.erro("Nao foi possivel marcar como nao lida.");
    }
  }

  // ENCERRAR (Fatia 10): tira o card do quadro sem virar ganho nem perda — o
  // servidor so arquiva. Um clique, sem modal e sem motivo.
  //
  // Otimista e CIRURGICO: some da coluna na hora, sem recarregar o quadro (as
  // colunas expandidas por "carregar mais" continuam expandidas). Falhou, o card
  // volta para a MESMA posicao em que estava — por isso o indice e guardado
  // antes; um push no fim reordenaria a coluna na cara do vendedor.
  async function encerrar(card: Card) {
    const etapaId = card.etapaId;
    if (!etapaId) return;
    let indice = -1;
    setColunas((prev) => {
      const atuais = prev[etapaId];
      if (!atuais) return prev;
      indice = atuais.findIndex((c) => c.id === card.id);
      if (indice < 0) return prev;
      return { ...prev, [etapaId]: atuais.filter((c) => c.id !== card.id) };
    });
    if (indice < 0) return;
    try {
      const r = await fetch(`/api/negocios/${card.id}/encerrar`, {
        method: "POST",
      });
      if (!r.ok) throw new Error();
    } catch {
      setColunas((prev) => {
        const atuais = prev[etapaId] ?? [];
        // Ja voltou por outro caminho (recarga, evento): nao duplica.
        if (atuais.some((c) => c.id === card.id)) return prev;
        const volta = [...atuais];
        volta.splice(Math.min(indice, volta.length), 0, card);
        return { ...prev, [etapaId]: volta };
      });
      toast.erro("Nao foi possivel encerrar.");
    }
  }

  // EXCLUIR (Fatia 15-A): "isto nao foi venda". Alem de tirar o card do quadro,
  // os ganhos dele param de contar como compra do cliente. Mesma remocao
  // otimista e cirurgica do encerrar, com o card voltando ao lugar exato se a
  // chamada falhar.
  async function excluir(card: Card) {
    const etapaId = card.etapaId;
    if (!etapaId) return;
    let indice = -1;
    setColunas((prev) => {
      const atuais = prev[etapaId];
      if (!atuais) return prev;
      indice = atuais.findIndex((c) => c.id === card.id);
      if (indice < 0) return prev;
      return { ...prev, [etapaId]: atuais.filter((c) => c.id !== card.id) };
    });
    if (indice < 0) return;
    try {
      const r = await fetch(`/api/negocios/${card.id}/excluir`, {
        method: "POST",
      });
      if (!r.ok) throw new Error();
      const d = await r.json().catch(() => null);
      const n = d?.ganhosNeutralizados ?? 0;
      toast.sucesso(
        n > 0
          ? `Card excluido. ${n === 1 ? "1 compra saiu" : `${n} compras sairam`} do historico do cliente.`
          : "Card excluido.",
      );
    } catch {
      setColunas((prev) => {
        const atuais = prev[etapaId] ?? [];
        if (atuais.some((c) => c.id === card.id)) return prev;
        const volta = [...atuais];
        volta.splice(Math.min(indice, volta.length), 0, card);
        return { ...prev, [etapaId]: volta };
      });
      toast.erro("Nao foi possivel excluir.");
    }
  }

  // Assumir (atribuir a si): mesmo endpoint do seletor de vendedor do painel.
  async function assumir(negocioId: string) {
    try {
      const r = await fetch(`/api/negocios/${negocioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agenteId: agenteIdAtual }),
      });
      if (r.ok) {
        toast.sucesso("Cliente assumido.");
        void carregar();
      } else if (r.status === 403) {
        toast.erro("Voce nao tem acesso a essa finalidade.");
      } else {
        toast.erro("Nao foi possivel assumir.");
      }
    } catch {
      toast.erro("Falha de conexao ao assumir.");
    }
  }

  // ---- Drag handlers ----
  function aoIniciar(e: DragStartEvent) {
    arrastandoRef.current = true;
    const achado = acharCard(String(e.active.id));
    setAtivo(achado?.card ?? null);
  }

  async function aoFinalizar(e: DragEndEvent) {
    arrastandoRef.current = false;
    setAtivo(null);
    const { active, over } = e;
    if (!over) return;
    const negocioId = String(active.id);
    const destinoEtapaId = String(over.id);

    const achado = acharCard(negocioId);
    if (!achado) return;
    if (achado.etapaId === destinoEtapaId) return;

    const destino = etapas.find((et) => et.id === destinoEtapaId);
    if (!destino) return;

    // Nao permite mover entre funis de finalidades diferentes (uniao de acesso).
    if (
      destino.finalidade &&
      destino.finalidade !== "AMBAS" &&
      destino.finalidade !== achado.card.finalidade
    ) {
      return;
    }

    if (destino.tipo === "GANHO") {
      setPendente({
        tipo: "ganho",
        negocioId,
        etapaId: destinoEtapaId,
        origemEtapaId: achado.etapaId,
        valorInicial: achado.card.valor,
      });
      return;
    }
    if (destino.tipo === "PERDIDO") {
      setPendente({
        tipo: "perdido",
        negocioId,
        etapaId: destinoEtapaId,
        origemEtapaId: achado.etapaId,
        valorInicial: achado.card.valor,
      });
      return;
    }

    // Etapa aberta: movimento otimista + persiste.
    const origem = achado.etapaId;
    moverLocal(negocioId, destinoEtapaId);
    const ok = await patch(negocioId, { etapaId: destinoEtapaId });
    if (!ok) {
      moverLocal(negocioId, origem);
      void carregar();
    }
  }

  async function confirmarFechamento(dados: DadosFechamento) {
    if (!pendente) return;
    const ok = await patch(pendente.negocioId, {
      etapaId: pendente.etapaId,
      ...dados,
    });
    if (!ok) throw new Error("falha");
    moverLocal(pendente.negocioId, pendente.etapaId);
    setPendente(null);
    void carregar();
  }

  // (Fatia P) Filtros aplicados no SERVIDOR: `colunas` ja vem filtrado por
  // busca/temperatura/etiqueta. Sem filtragem client-side (uma fonte de verdade).
  const colunasFiltradas = colunas;

  // Contador do periodo na barra de filtros. Fatia Q: soma os TOTAIS do resumo
  // (banco), nao os cards carregados — com paginacao, `colunas` mostraria ~350
  // onde existem 1.653.
  const totalCards = useMemo(
    () => Object.values(resumo).reduce((s, r) => s + r.total, 0),
    [resumo],
  );

  const temFiltro = Boolean(buscaAplicada.trim() || temperatura || etiquetaId);
  // Com filtros no servidor, `colunas` ja e o conjunto filtrado. Distinguimos
  // board vazio (sem filtro) de "nenhum resultado" (com filtro) pelo temFiltro.
  // Vazio tambem se decide pelo resumo: uma coluna pode estar sem cards na tela
  // e cheia no banco.
  const boardVazio = !carregando && !erro && totalCards === 0;
  const vazioReal = boardVazio && !temFiltro;
  const semResultado = boardVazio && temFiltro;

  // Colaboradores (nao-admin, ativos) com acesso a finalidade atual.
  const elegiveis = useMemo(
    () =>
      agentes.filter(
        (a) =>
          a.papel !== "ADMIN" &&
          (finalidade === "VENDA" ? a.acessoVenda : a.acessoPosVenda),
      ),
    [agentes, finalidade],
  );
  // Banner (admin): nenhum colaborador ativo com acesso a finalidade atual.
  const semColaboradorAtivo =
    ehAdmin && agentes.length > 0 && elegiveis.length === 0;

  // Agrupa as etapas por funil (finalidade). Quando ha mais de uma finalidade
  // (acesso duplo do colaborador), o quadro mostra secoes separadas e coloridas.
  const secoes = useMemo(() => {
    const grupos = new Map<"VENDA" | "POS_VENDA", Etapa[]>();
    for (const e of etapas) {
      const f = e.finalidade === "POS_VENDA" ? "POS_VENDA" : "VENDA";
      const lista = grupos.get(f) ?? [];
      lista.push(e);
      grupos.set(f, lista);
    }
    const ordem: ("VENDA" | "POS_VENDA")[] = ["VENDA", "POS_VENDA"];
    return ordem
      .filter((f) => grupos.has(f))
      .map((f) => ({ finalidade: f, etapas: grupos.get(f) ?? [] }));
  }, [etapas]);
  const multiSecao = secoes.length > 1;

  const podeAlternar = finalidadesEfetivas.length > 1;

  return (
    <div className="flex h-full flex-col">
      {podeAlternar && (
        <div className="flex items-center gap-2 border-b border-black/5 bg-white px-4 pt-2.5">
          {finalidadesEfetivas.map((f) => (
            <button
              key={f}
              onClick={() => setFinalidade(f)}
              className={`rounded-t-lg border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${
                finalidade === f
                  ? "border-tiffany text-tiffany"
                  : "border-transparent text-medio/60 hover:text-escuro"
              }`}
            >
              {f === "VENDA" ? "Vendas" : "Pos-venda"}
            </button>
          ))}
        </div>
      )}

      <BarraFiltros
        ehAdmin={ehAdmin}
        busca={busca}
        etiquetaId={etiquetaId}
        temperatura={temperatura}
        filtroDono={filtroDono}
        agenteId={agenteId}
        etiquetas={etiquetas}
        agentes={agentes}
        mostrarTemperatura={finalidade !== "POS_VENDA"}
        periodo={periodo}
        contadorPeriodo={totalCards}
        onBusca={setBusca}
        onEtiqueta={setEtiquetaId}
        onTemperatura={setTemperatura}
        onFiltroDono={setFiltroDono}
        onAgente={setAgenteId}
        onPeriodo={setPeriodo}
      />

      {semColaboradorAtivo && (
        <BannerAviso>
          Nenhum colaborador ativo com acesso a{" "}
          {finalidade === "VENDA" ? "Vendas" : "Pos-venda"} — novos leads nao
          serao distribuidos automaticamente. Cadastre/ative colaboradores ou
          atribua manualmente.
        </BannerAviso>
      )}

      {carregando ? (
        <SkeletonQuadro />
      ) : erro ? (
        <EstadoErro
          mensagem={erro}
          onRetry={() => {
            setCarregando(true);
            void carregar();
          }}
        />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={aoIniciar}
          onDragEnd={aoFinalizar}
        >
          {multiSecao ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
              {secoes.map((s) => {
                const cor = corFinalidade(s.finalidade);
                return (
                  <section
                    key={s.finalidade}
                    className="flex min-h-0 flex-1 flex-col"
                  >
                    <div
                      className="mb-2 flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5"
                      style={{ backgroundColor: `${cor.hex}14` }}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: cor.hex }}
                      />
                      <h2
                        className="text-sm font-semibold"
                        style={{ color: cor.hex }}
                      >
                        {cor.rotulo}
                      </h2>
                    </div>
                    <div
                      className="scroll-fino flex min-h-0 flex-1 gap-3 overflow-x-auto rounded-xl border-l-2 pl-2"
                      style={{ borderColor: cor.hex }}
                    >
                      {s.etapas.map((etapa, j) => (
                        <ColunaKanban
                          key={etapa.id}
                          etapa={etapa}
                          cards={colunasFiltradas[etapa.id] ?? []}
                          resumo={resumo[etapa.id]}
                          onAbrir={setDrawerId}
                          mostrarFinalidade={ehAdmin}
                          ehAdmin={ehAdmin}
                          onAssumir={assumir}
                          onAtribuir={(c) =>
                            setAtribuir({
                              negocioIds: [c.id],
                              titulo: "Atribuir cliente",
                            })
                          }
                          onFixar={(c) => void alternarFixar(c)}
                          onMarcarNaoLida={(c) => void marcarNaoLida(c)}
                          onEncerrar={(c) => void encerrar(c)}
                          onExcluir={(c) => void excluir(c)}
                          ehEntrada={j === 0}
                          onAtribuirMassa={(ids) =>
                            setAtribuir({
                              negocioIds: ids,
                              titulo: "Atribuir sem dono",
                            })
                          }
                          temMais={paginacao[etapa.id]?.temMais ?? false}
                          carregandoMais={carregandoMais[etapa.id] ?? false}
                          onCarregarMais={() => void carregarMais(etapa.id)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="scroll-fino flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
              {etapas.map((etapa, j) => (
                <ColunaKanban
                  key={etapa.id}
                  etapa={etapa}
                  cards={colunasFiltradas[etapa.id] ?? []}
                  resumo={resumo[etapa.id]}
                  onAbrir={setDrawerId}
                  mostrarFinalidade={ehAdmin}
                  ehAdmin={ehAdmin}
                  onAssumir={assumir}
                  onAtribuir={(c) =>
                    setAtribuir({
                      negocioIds: [c.id],
                      titulo: "Atribuir cliente",
                    })
                  }
                  onFixar={(c) => void alternarFixar(c)}
                  onMarcarNaoLida={(c) => void marcarNaoLida(c)}
                  onEncerrar={(c) => void encerrar(c)}
                  onExcluir={(c) => void excluir(c)}
                  ehEntrada={j === 0}
                  onAtribuirMassa={(ids) =>
                    setAtribuir({
                      negocioIds: ids,
                      titulo: "Atribuir sem dono",
                    })
                  }
                  temMais={paginacao[etapa.id]?.temMais ?? false}
                  carregandoMais={carregandoMais[etapa.id] ?? false}
                  onCarregarMais={() => void carregarMais(etapa.id)}
                />
              ))}
            </div>
          )}

          <DragOverlay>
            {ativo ? <CardNegocio card={ativo} arrastando /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {vazioReal && (
        <p className="px-6 pb-6 text-sm text-medio/50">
          Nenhum negocio por aqui ainda. Eles aparecem conforme os leads chegam.
        </p>
      )}
      {semResultado && (
        <p className="px-6 pb-6 text-sm text-medio/50">
          {buscaAplicada.trim()
            ? `Nenhum resultado para "${buscaAplicada.trim()}".`
            : "Nenhum card com esses filtros."}
        </p>
      )}

      {pendente && (
        <ModalFechamento
          tipo={pendente.tipo}
          valorInicial={pendente.valorInicial}
          finalidade={finalidade}
          onConfirmar={confirmarFechamento}
          onCancelar={() => setPendente(null)}
        />
      )}

      {atribuir && (
        <ModalAtribuir
          negocioIds={atribuir.negocioIds}
          titulo={atribuir.titulo}
          agenteIdAtual={agenteIdAtual}
          elegiveis={elegiveis}
          onConcluido={() => void carregar()}
          onFechar={() => setAtribuir(null)}
        />
      )}

      {drawerId && (
        <PainelNegocio
          key={drawerId}
          negocioId={drawerId}
          papel={papel}
          agenteIdAtual={agenteIdAtual}
          agentes={agentes}
          etiquetas={etiquetas}
          etapas={etapas}
          onFechar={() => setDrawerId(null)}
          onAtualizado={() => void carregar()}
        />
      )}
    </div>
  );
}

function SkeletonQuadro() {
  return (
    <div className="flex flex-1 gap-3 overflow-hidden p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="w-72 shrink-0 space-y-2">
          <div className="skeleton h-5 w-32" />
          {Array.from({ length: 3 }).map((_, j) => (
            <div key={j} className="skeleton h-24 w-full rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  );
}
