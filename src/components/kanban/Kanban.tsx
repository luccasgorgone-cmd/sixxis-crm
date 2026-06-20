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
import { ModalFechamento } from "./ModalFechamento";
import { PainelNegocio } from "./PainelNegocio";
import { EstadoErro } from "@/components/ui/Estado";
import type {
  Etapa,
  CardNegocio as Card,
  EtiquetaChip,
  AgenteResumo,
  EventoNegocio,
  FiltroDono,
  Finalidade,
} from "./tipos";

type Pendente = {
  tipo: "ganho" | "perdido";
  negocioId: string;
  etapaId: string;
  origemEtapaId: string | null;
  valorInicial: number | null;
};

export function Kanban({
  papel,
  agenteIdAtual,
}: {
  papel: string;
  agenteIdAtual: string;
}) {
  const ehAdmin = papel === "ADMIN";

  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [colunas, setColunas] = useState<Record<string, Card[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [etiquetas, setEtiquetas] = useState<EtiquetaChip[]>([]);
  const [agentes, setAgentes] = useState<AgenteResumo[]>([]);

  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [etiquetaId, setEtiquetaId] = useState("");
  const [temperatura, setTemperatura] = useState("");
  const [filtroDono, setFiltroDono] = useState<FiltroDono>(
    ehAdmin ? "todos" : "meus",
  );
  const [agenteId, setAgenteId] = useState("");
  // Finalidade: POS_VENDA ve so pos-venda; VENDEDOR so venda; ADMIN alterna.
  const [finalidade, setFinalidade] = useState<Finalidade>(
    papel === "POS_VENDA" ? "POS_VENDA" : "VENDA",
  );

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

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("finalidade", finalidade);
    if (buscaAplicada) p.set("busca", buscaAplicada);
    if (etiquetaId) p.set("etiquetaId", etiquetaId);
    if (temperatura) p.set("temperatura", temperatura);
    if (ehAdmin) {
      p.set("filtro", filtroDono);
      if (filtroDono === "todos" && agenteId) p.set("agenteId", agenteId);
    }
    return p.toString();
  }, [finalidade, buscaAplicada, etiquetaId, temperatura, ehAdmin, filtroDono, agenteId]);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/negocios?${query}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setEtapas(d.etapas as Etapa[]);
      setColunas(d.colunas as Record<string, Card[]>);
      setErro(null);
    } catch {
      setErro("Nao foi possivel carregar o quadro.");
    } finally {
      setCarregando(false);
    }
  }, [query]);

  useEffect(() => {
    void carregar();
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
  useEffect(() => {
    const socket = getSocket();
    function onEvt(_e: EventoNegocio) {
      if (arrastandoRef.current) return;
      void carregar();
    }
    socket.on("negocio:atualizado", onEvt);
    return () => {
      socket.off("negocio:atualizado", onEvt);
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

  async function confirmarFechamento(dados: {
    valor?: number;
    motivoPerda?: string;
  }) {
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

  const vazio =
    !carregando &&
    !erro &&
    Object.values(colunas).every((c) => c.length === 0);

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

  const podeAlternar = papel === "ADMIN";

  return (
    <div className="flex h-full flex-col">
      {podeAlternar && (
        <div className="flex items-center gap-2 border-b border-black/5 bg-white px-4 pt-2.5">
          {(["VENDA", "POS_VENDA"] as Finalidade[]).map((f) => (
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
        onBusca={setBusca}
        onEtiqueta={setEtiquetaId}
        onTemperatura={setTemperatura}
        onFiltroDono={setFiltroDono}
        onAgente={setAgenteId}
      />

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
            <div className="scroll-fino flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
              {secoes.map((s) => {
                const cor = corFinalidade(s.finalidade);
                return (
                  <section key={s.finalidade} className="min-h-0">
                    <div
                      className="mb-2 flex items-center gap-2 rounded-lg px-3 py-1.5"
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
                      className="scroll-fino flex gap-3 overflow-x-auto rounded-xl border-l-2 pl-2"
                      style={{ borderColor: cor.hex }}
                    >
                      {s.etapas.map((etapa) => (
                        <ColunaKanban
                          key={etapa.id}
                          etapa={etapa}
                          cards={colunas[etapa.id] ?? []}
                          onAbrir={setDrawerId}
                          mostrarFinalidade={ehAdmin}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="scroll-fino flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
              {etapas.map((etapa) => (
                <ColunaKanban
                  key={etapa.id}
                  etapa={etapa}
                  cards={colunas[etapa.id] ?? []}
                  onAbrir={setDrawerId}
                  mostrarFinalidade={ehAdmin}
                />
              ))}
            </div>
          )}

          <DragOverlay>
            {ativo ? <CardNegocio card={ativo} arrastando /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {vazio && (
        <p className="px-6 pb-6 text-sm text-medio/50">
          Nenhum negocio por aqui ainda. Eles aparecem conforme os leads chegam.
        </p>
      )}

      {pendente && (
        <ModalFechamento
          tipo={pendente.tipo}
          valorInicial={pendente.valorInicial}
          onConfirmar={confirmarFechamento}
          onCancelar={() => setPendente(null)}
        />
      )}

      {drawerId && (
        <PainelNegocio
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
