"use client";

// Agenda do agente: visoes Mes / Semana / Dia. Mostra unificado as Tarefas do
// agente + os Lembretes de cliente (mesma fonte: /api/agenda). Criar/editar/
// concluir/excluir tarefa; lembretes aparecem automaticamente. Tempo real via
// socket (tarefa/lembrete) e alertas antecipados chegam no sino.
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  Check,
  AlarmClock,
  CheckSquare,
  Bell,
} from "lucide-react";
import { getSocket } from "@/lib/socketClient";
import { useToast } from "@/components/ui/Toast";
import { ModalTarefa, type TarefaEdicao } from "./ModalTarefa";
import {
  inicioDoDia,
  fimDoDia,
  somarDias,
  inicioDaSemana,
  inicioDoMes,
  mesmoDia,
  chaveDia,
  rotuloMes,
  rotuloDiaLongo,
  hhmm,
  DIAS_SEMANA,
} from "./datas";

type Evento = {
  id: string;
  tipo: "tarefa" | "lembrete";
  titulo: string;
  descricao: string | null;
  dataHora: string;
  duracaoMin: number | null;
  leadId: string | null;
  negocioId: string | null;
  cliente: string | null;
  finalidade: "VENDA" | "POS_VENDA" | null;
  status: string;
  lembrarAntesMin: number | null;
};

type Visao = "mes" | "semana" | "dia";

export function Agenda() {
  const toast = useToast();
  const [visao, setVisao] = useState<Visao>("mes");
  const [ref, setRef] = useState(() => inicioDoDia(new Date()));
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState<
    { tarefa?: TarefaEdicao | null; data?: Date } | null
  >(null);

  // Intervalo coberto pela visao atual (com sobra para preencher a grade do mes).
  const [de, ate] = useMemo<[Date, Date]>(() => {
    if (visao === "dia") return [inicioDoDia(ref), fimDoDia(ref)];
    if (visao === "semana") {
      const ini = inicioDaSemana(ref);
      return [ini, fimDoDia(somarDias(ini, 6))];
    }
    const grade = inicioDaSemana(inicioDoMes(ref));
    return [grade, fimDoDia(somarDias(grade, 41))]; // 6 semanas
  }, [visao, ref]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const p = new URLSearchParams({
        de: de.toISOString(),
        ate: ate.toISOString(),
      });
      const r = await fetch(`/api/agenda?${p.toString()}`);
      if (r.ok) setEventos((await r.json()).eventos ?? []);
      else setEventos([]);
    } catch {
      setEventos([]);
    } finally {
      setCarregando(false);
    }
  }, [de, ate]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Tempo real: recarrega quando tarefas/lembretes mudam.
  useEffect(() => {
    const socket = getSocket();
    const atualizar = () => void carregar();
    socket.on("tarefa:atualizada", atualizar);
    socket.on("lembrete:novo", atualizar);
    socket.on("lembrete:atualizado", atualizar);
    return () => {
      socket.off("tarefa:atualizada", atualizar);
      socket.off("lembrete:novo", atualizar);
      socket.off("lembrete:atualizado", atualizar);
    };
  }, [carregar]);

  // Agrupa eventos por dia (chave local) para as grades.
  const porDia = useMemo(() => {
    const m = new Map<string, Evento[]>();
    for (const e of eventos) {
      const k = chaveDia(new Date(e.dataHora));
      const lista = m.get(k) ?? [];
      lista.push(e);
      m.set(k, lista);
    }
    for (const lista of m.values()) {
      lista.sort(
        (a, b) =>
          new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime(),
      );
    }
    return m;
  }, [eventos]);

  function navegar(dir: -1 | 1) {
    if (visao === "dia") setRef((r) => somarDias(r, dir));
    else if (visao === "semana") setRef((r) => somarDias(r, dir * 7));
    else {
      setRef((r) => {
        const x = inicioDoMes(r);
        x.setMonth(x.getMonth() + dir);
        return x;
      });
    }
  }

  async function concluir(e: Evento) {
    if (e.tipo !== "tarefa") return;
    const r = await fetch(`/api/tarefas/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CONCLUIDA" }),
    });
    if (r.ok) {
      toast.sucesso("Tarefa concluida.");
      void carregar();
    } else {
      toast.erro("Nao foi possivel concluir.");
    }
  }

  function abrirEvento(e: Evento) {
    if (e.tipo === "tarefa") {
      setModal({
        tarefa: {
          id: e.id,
          titulo: e.titulo,
          descricao: e.descricao,
          dataHora: e.dataHora,
          duracaoMin: e.duracaoMin,
          leadId: e.leadId,
          lembrarAntesMin: e.lembrarAntesMin,
        },
      });
    }
    // Lembretes sao geridos no painel do cliente; aqui sao apenas exibidos.
  }

  const titulo =
    visao === "mes"
      ? rotuloMes(ref)
      : visao === "semana"
        ? `${somarDias(inicioDaSemana(ref), 0).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${somarDias(inicioDaSemana(ref), 6).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`
        : rotuloDiaLongo(ref);

  return (
    <div className="flex h-full flex-col">
      {/* Cabecalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tiffany/10 text-tiffany">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold capitalize text-escuro">
              {titulo}
            </h2>
            <Legenda />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navegar(-1)}
              className="rounded-lg border border-black/10 p-1.5 text-medio hover:bg-black/5"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setRef(inicioDoDia(new Date()))}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium text-medio hover:bg-black/5"
            >
              Hoje
            </button>
            <button
              onClick={() => navegar(1)}
              className="rounded-lg border border-black/10 p-1.5 text-medio hover:bg-black/5"
              aria-label="Proximo"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex rounded-lg border border-black/10 p-0.5">
            {(["mes", "semana", "dia"] as Visao[]).map((v) => (
              <button
                key={v}
                onClick={() => setVisao(v)}
                className={`rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors ${
                  visao === v
                    ? "bg-tiffany text-white"
                    : "text-medio hover:bg-black/5"
                }`}
              >
                {v === "mes" ? "Mes" : v}
              </button>
            ))}
          </div>

          <button
            onClick={() => setModal({ data: proximaHoraDe(ref) })}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro"
          >
            <Plus className="h-4 w-4" /> Nova tarefa
          </button>
        </div>
      </div>

      {/* Corpo */}
      <div className="scroll-fino min-h-0 flex-1 overflow-auto p-4">
        {carregando && eventos.length === 0 ? (
          <div className="skeleton h-96 rounded-2xl" />
        ) : visao === "mes" ? (
          <VisaoMes
            referencia={ref}
            porDia={porDia}
            onDia={(d) => {
              setVisao("dia");
              setRef(d);
            }}
            onNovo={(d) => setModal({ data: meioDiaDe(d) })}
            onEvento={abrirEvento}
          />
        ) : visao === "semana" ? (
          <VisaoSemana
            referencia={ref}
            porDia={porDia}
            onNovo={(d) => setModal({ data: meioDiaDe(d) })}
            onEvento={abrirEvento}
            onConcluir={concluir}
          />
        ) : (
          <VisaoDia
            referencia={ref}
            eventos={porDia.get(chaveDia(ref)) ?? []}
            onEvento={abrirEvento}
            onConcluir={concluir}
            onNovo={(d) => setModal({ data: d })}
          />
        )}
      </div>

      {modal && (
        <ModalTarefa
          tarefa={modal.tarefa}
          dataInicial={modal.data}
          onFechar={() => setModal(null)}
          onSalvo={() => {
            setModal(null);
            void carregar();
          }}
        />
      )}
    </div>
  );
}

// ---- Legenda de cores ----
function Legenda() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-medio/60">
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-tiffany" /> Tarefa
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-amber-500" /> Lembrete
      </span>
    </div>
  );
}

// ---- Chip de evento (compacto) ----
function ChipEvento({
  e,
  onClick,
}: {
  e: Evento;
  onClick: () => void;
}) {
  const lembrete = e.tipo === "lembrete";
  const concluida = e.status === "CONCLUIDA";
  return (
    <button
      onClick={(ev) => {
        ev.stopPropagation();
        onClick();
      }}
      title={e.titulo}
      className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition-colors ${
        concluida
          ? "bg-black/5 text-medio/50 line-through"
          : lembrete
            ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
            : "bg-tiffany/15 text-tiffany-escuro hover:bg-tiffany/25"
      }`}
    >
      <span className="shrink-0 tabular-nums opacity-70">
        {hhmm(new Date(e.dataHora))}
      </span>
      <span className="truncate">{e.titulo}</span>
    </button>
  );
}

// ---- Visao Mes ----
function VisaoMes({
  referencia,
  porDia,
  onDia,
  onNovo,
  onEvento,
}: {
  referencia: Date;
  porDia: Map<string, Evento[]>;
  onDia: (d: Date) => void;
  onNovo: (d: Date) => void;
  onEvento: (e: Evento) => void;
}) {
  const inicio = inicioDaSemana(inicioDoMes(referencia));
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(inicio, i));
  const hoje = new Date();
  const mesAtual = referencia.getMonth();

  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
      <div className="grid grid-cols-7 border-b border-black/5 bg-fundo">
        {DIAS_SEMANA.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-xs font-semibold text-medio/60"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((d) => {
          const itens = porDia.get(chaveDia(d)) ?? [];
          const foraMes = d.getMonth() !== mesAtual;
          const ehHoje = mesmoDia(d, hoje);
          return (
            <div
              key={chaveDia(d)}
              onClick={() => onNovo(d)}
              className={`group min-h-[96px] cursor-pointer border-b border-r border-black/5 p-1.5 transition-colors hover:bg-tiffany/[0.03] ${
                foraMes ? "bg-black/[0.015]" : ""
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    ehHoje
                      ? "bg-tiffany text-white"
                      : foraMes
                        ? "text-medio/30"
                        : "text-escuro"
                  }`}
                >
                  {d.getDate()}
                </span>
                <button
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onDia(d);
                  }}
                  className="hidden text-[10px] font-medium text-tiffany group-hover:block"
                >
                  abrir
                </button>
              </div>
              <div className="space-y-1">
                {itens.slice(0, 3).map((e) => (
                  <ChipEvento key={e.id} e={e} onClick={() => onEvento(e)} />
                ))}
                {itens.length > 3 && (
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onDia(d);
                    }}
                    className="px-1 text-[11px] font-medium text-medio/60 hover:text-tiffany"
                  >
                    +{itens.length - 3} mais
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Visao Semana ----
function VisaoSemana({
  referencia,
  porDia,
  onNovo,
  onEvento,
  onConcluir,
}: {
  referencia: Date;
  porDia: Map<string, Evento[]>;
  onNovo: (d: Date) => void;
  onEvento: (e: Evento) => void;
  onConcluir: (e: Evento) => void;
}) {
  const inicio = inicioDaSemana(referencia);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
  const hoje = new Date();

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {dias.map((d) => {
        const itens = porDia.get(chaveDia(d)) ?? [];
        const ehHoje = mesmoDia(d, hoje);
        return (
          <div
            key={chaveDia(d)}
            className="flex min-h-[140px] flex-col rounded-xl border border-black/5 bg-white"
          >
            <div
              className={`flex items-center justify-between rounded-t-xl border-b border-black/5 px-2 py-1.5 ${
                ehHoje ? "bg-tiffany/10" : "bg-fundo"
              }`}
            >
              <span className="text-xs font-semibold text-escuro">
                {DIAS_SEMANA[d.getDay()]} {d.getDate()}
              </span>
              <button
                onClick={() => onNovo(d)}
                className="rounded p-0.5 text-medio/50 hover:bg-black/5 hover:text-tiffany"
                aria-label="Nova tarefa"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 space-y-1 p-1.5">
              {itens.length === 0 ? (
                <p className="px-1 py-2 text-center text-[11px] text-medio/30">
                  —
                </p>
              ) : (
                itens.map((e) => (
                  <ItemSemana
                    key={e.id}
                    e={e}
                    onClick={() => onEvento(e)}
                    onConcluir={() => onConcluir(e)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ItemSemana({
  e,
  onClick,
  onConcluir,
}: {
  e: Evento;
  onClick: () => void;
  onConcluir: () => void;
}) {
  const lembrete = e.tipo === "lembrete";
  const concluida = e.status === "CONCLUIDA";
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 text-left ${
        concluida
          ? "border-black/5 bg-black/[0.02]"
          : lembrete
            ? "border-amber-200 bg-amber-50"
            : "border-tiffany/20 bg-tiffany/5"
      }`}
    >
      <button onClick={onClick} className="block w-full text-left">
        <div className="flex items-center gap-1">
          {lembrete ? (
            <AlarmClock className="h-3 w-3 shrink-0 text-amber-600" />
          ) : (
            <CheckSquare className="h-3 w-3 shrink-0 text-tiffany" />
          )}
          <span className="text-[11px] font-semibold tabular-nums text-medio/70">
            {hhmm(new Date(e.dataHora))}
          </span>
        </div>
        <p
          className={`truncate text-xs font-medium ${concluida ? "text-medio/50 line-through" : "text-escuro"}`}
        >
          {e.titulo}
        </p>
        {e.cliente && (
          <p className="truncate text-[11px] text-medio/60">{e.cliente}</p>
        )}
      </button>
      {e.tipo === "tarefa" && !concluida && (
        <button
          onClick={onConcluir}
          className="mt-1 flex items-center gap-1 text-[11px] font-medium text-green-700 hover:underline"
        >
          <Check className="h-3 w-3" /> Concluir
        </button>
      )}
    </div>
  );
}

// ---- Visao Dia (timeline de horarios) ----
function VisaoDia({
  referencia,
  eventos,
  onEvento,
  onConcluir,
  onNovo,
}: {
  referencia: Date;
  eventos: Evento[];
  onEvento: (e: Evento) => void;
  onConcluir: (e: Evento) => void;
  onNovo: (d: Date) => void;
}) {
  // Janela de horas exibida: do mais cedo (min 7h) ao mais tarde (max 20h).
  const horasEventos = eventos.map((e) => new Date(e.dataHora).getHours());
  const minH = Math.min(7, ...horasEventos);
  const maxH = Math.max(20, ...horasEventos);
  const horas = Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i);
  const agora = new Date();

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-black/5 bg-white">
      {eventos.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Bell className="h-7 w-7 text-medio/30" />
          <p className="text-sm font-medium text-escuro">Nada agendado</p>
          <p className="text-xs text-medio/60">
            Clique em um horario para criar uma tarefa.
          </p>
        </div>
      )}
      {eventos.length > 0 &&
        horas.map((h) => {
          const slot = new Date(referencia);
          slot.setHours(h, 0, 0, 0);
          const itens = eventos.filter(
            (e) => new Date(e.dataHora).getHours() === h,
          );
          const ehAgora =
            mesmoDia(referencia, agora) && agora.getHours() === h;
          return (
            <div
              key={h}
              className="flex border-b border-black/5 last:border-0"
            >
              <button
                onClick={() => onNovo(slot)}
                className="w-16 shrink-0 border-r border-black/5 px-2 py-3 text-right text-xs font-medium text-medio/50 hover:bg-tiffany/[0.04] hover:text-tiffany"
              >
                {String(h).padStart(2, "0")}:00
              </button>
              <div
                className={`min-h-[52px] flex-1 space-y-1 p-2 ${ehAgora ? "bg-tiffany/[0.04]" : ""}`}
              >
                {itens.map((e) => (
                  <ItemSemana
                    key={e.id}
                    e={e}
                    onClick={() => onEvento(e)}
                    onConcluir={() => onConcluir(e)}
                  />
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}

// Helpers de data inicial ao criar (mantem a referencia do dia visivel).
function proximaHoraDe(d: Date): Date {
  const base = new Date();
  const x = new Date(d);
  x.setHours(base.getHours() + 1, 0, 0, 0);
  return x;
}
function meioDiaDe(d: Date): Date {
  const x = new Date(d);
  x.setHours(9, 0, 0, 0);
  return x;
}
