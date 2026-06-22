"use client";

// Pagina de detalhe de uma meta: cabecalho com progresso/ritmo/projecao, grafico
// de evolucao acumulada (metricas de fechamento), drill-down de ganhos/pendentes/
// perdidos/abertos (cada um abre o cliente) e numeros coerentes para metricas que
// nao sao de fechamento. Editar/Excluir so quando o usuario tem permissao.
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Trophy,
  XCircle,
  PauseCircle,
  FolderOpen,
  CalendarClock,
  TrendingUp,
  UserCog,
  Shield,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";
import { AvatarCliente } from "@/components/AvatarCliente";
import { Donut } from "./Donut";
import { FormMetaColaborador } from "./FormMetaColaborador";
import { PerdidosAnalise, type AnalisePerdidos } from "@/components/perdidos/PerdidosAnalise";
import { PainelNegocio } from "@/components/kanban/PainelNegocio";
import type { Etapa, EtiquetaChip, AgenteResumo } from "@/components/kanban/tipos";
import {
  type Meta,
  type Progresso,
  type Metrica,
  type Finalidade,
  type Periodo,
  ROTULO_METRICA,
  ROTULO_PERIODO,
  RITMO_INFO,
  corRitmoHex,
  formatarValor,
  pctExibido,
} from "./tipos";
import { formatarBRL, formatarDuracao } from "@/lib/format";

type NegItem = {
  negocioId: string;
  leadId: string;
  nome: string;
  telefone: string;
  fotoUrl: string | null;
  valor: number | null;
  fechadoEm: string | null;
  motivoPendencia: string | null;
};

type MetaDetalhe = {
  id: string;
  nome: string | null;
  escopo: "COLABORADOR" | "EQUIPE";
  agente: { id: string; nome: string } | null;
  criadoPorId: string | null;
  criadoPor: { id: string; nome: string } | null;
  finalidade: Finalidade;
  metrica: Metrica;
  alvo: number;
  periodo: Periodo;
  inicio: string;
  fim: string;
  ativo: boolean;
  podeEditar: boolean;
};

type Metricas = {
  clientesAtendidos: number;
  conversao: number;
  tempoPrimeiraRespostaSeg: number;
  tempoResolucaoSeg: number;
};

type Resposta = {
  meta: MetaDetalhe;
  progresso: Progresso;
  metricas: Metricas;
  serie: { dia: string; acumulado: number; alvo: number }[];
  ganhos: NegItem[];
  abertos: NegItem[];
  pendentes: NegItem[];
  perdidos: AnalisePerdidos;
};

type Aba = "ganhos" | "pendentes" | "perdidos" | "abertos";

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function DetalheMeta({
  id,
  papel,
  agenteIdAtual,
}: {
  id: string;
  papel: string;
  agenteIdAtual: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [aba, setAba] = useState<Aba>("ganhos");
  const [editando, setEditando] = useState(false);

  // Painel do cliente (drill-down).
  const [painelId, setPainelId] = useState<string | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [etiquetas, setEtiquetas] = useState<EtiquetaChip[]>([]);
  const [agentes, setAgentes] = useState<AgenteResumo[]>([]);
  const auxRef = useRef(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/metas/${id}`);
      if (r.ok) {
        setDados(await r.json());
        setErro(false);
      } else {
        setErro(true);
      }
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrirCliente(negocioId: string) {
    if (!auxRef.current) {
      auxRef.current = true;
      fetch("/api/etapas")
        .then((r) => (r.ok ? r.json() : { etapas: [] }))
        .then((d) => setEtapas(d.etapas ?? []))
        .catch(() => undefined);
      fetch("/api/etiquetas")
        .then((r) => (r.ok ? r.json() : { etiquetas: [] }))
        .then((d) => setEtiquetas(d.etiquetas ?? []))
        .catch(() => undefined);
      if (papel === "ADMIN") {
        fetch("/api/agentes")
          .then((r) => (r.ok ? r.json() : { agentes: [] }))
          .then((d) => setAgentes(d.agentes ?? []))
          .catch(() => undefined);
      }
    }
    setPainelId(negocioId);
  }

  async function remover() {
    const r = await fetch(`/api/metas/${id}`, { method: "DELETE" });
    if (r.ok) {
      toast.sucesso("Meta excluida.");
      router.push("/metas");
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel excluir.");
    }
  }

  if (carregando) {
    return (
      <div className="space-y-4 p-6">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-40 w-full rounded-2xl" />
        <div className="skeleton h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (erro || !dados) {
    return (
      <div className="p-6">
        <EstadoErro
          mensagem="Nao foi possivel carregar a meta."
          onRetry={() => void carregar()}
        />
      </div>
    );
  }

  const { meta, progresso: p, metricas, serie, ganhos, abertos, pendentes, perdidos } =
    dados;
  const ritmo = RITMO_INFO[p.ritmo];
  const corArco = p.atingida ? "#16a34a" : corRitmoHex(p.ritmo);
  const titulo = meta.nome ?? ROTULO_METRICA[meta.metrica];
  const ehFechamento =
    meta.metrica === "VALOR_VENDIDO" || meta.metrica === "QTD_GANHOS";

  const valorGanhos = ganhos.reduce((s, g) => s + (g.valor ?? 0), 0);

  // Meta-like para o form de edicao.
  const metaParaForm: Meta = {
    ...meta,
    agenteId: meta.agente?.id ?? null,
    progresso: p,
  };

  return (
    <div className="space-y-5 p-6">
      {/* Voltar + acoes */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/metas"
          className="flex items-center gap-1.5 text-sm font-medium text-medio transition-colors hover:text-tiffany"
        >
          <ArrowLeft className="h-4 w-4" /> Minhas metas
        </Link>
        {meta.podeEditar && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditando(true)}
              className="flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium text-escuro hover:bg-black/5"
            >
              <Pencil className="h-4 w-4" /> Editar
            </button>
            <button
              onClick={() => void remover()}
              className="flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium text-erro hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </button>
          </div>
        )}
      </div>

      {/* Cabecalho */}
      <div className="rounded-2xl border border-black/5 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              meta.podeEditar && meta.criadoPorId === meta.agente?.id
                ? "bg-tiffany/10 text-tiffany"
                : "bg-black/5 text-medio/70"
            }`}
          >
            {meta.criadoPorId === meta.agente?.id ? (
              <>
                <UserCog className="h-3 w-3" /> Definida por voce
              </>
            ) : (
              <>
                <Shield className="h-3 w-3" /> Definida pela administracao
              </>
            )}
          </span>
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-medio/70">
            {ROTULO_PERIODO[meta.periodo]}
          </span>
          {meta.escopo === "EQUIPE" && (
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-medio/70">
              Equipe
            </span>
          )}
        </div>

        <h1 className="mt-2 text-xl font-semibold text-escuro">{titulo}</h1>
        <p className="text-sm text-medio/60">
          {ROTULO_METRICA[meta.metrica]} · {dataCurta(meta.inicio)} a{" "}
          {dataCurta(meta.fim)}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-6">
          <Donut
            pct={pctExibido(p)}
            cor={corArco}
            centro={`${pctExibido(p)}%`}
            legenda="do alvo"
          />
          <div className="space-y-2">
            <div>
              <p className="text-3xl font-semibold leading-none text-escuro">
                {formatarValor(meta.metrica, p.atual)}
              </p>
              <p className="mt-1 text-xs text-medio/60">
                {p.maiorMelhor ? "de " : "alvo: abaixo de "}
                {formatarValor(meta.metrica, p.alvo)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${ritmo.classe}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${ritmo.ponto}`} />
                {ritmo.rotulo}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-medium text-medio/70">
                <CalendarClock className="h-3.5 w-3.5" />
                {p.encerrada
                  ? "Encerrada"
                  : p.diasRestantes === 0
                    ? "Ultimo dia"
                    : `${p.diasRestantes} ${p.diasRestantes === 1 ? "dia" : "dias"}`}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-medio/60">
                <TrendingUp className="h-3.5 w-3.5" />
                Projecao {formatarValor(meta.metrica, p.projecao)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs do periodo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi rotulo="Ganhos" valor={`${ganhos.length}`} detalhe={formatarBRL(valorGanhos)} icone={Trophy} cor="text-green-700" fundo="bg-green-100" />
        <Kpi rotulo="Em aberto" valor={`${abertos.length}`} icone={FolderOpen} cor="text-sky-700" fundo="bg-sky-100" />
        <Kpi rotulo="Pendentes" valor={`${pendentes.length}`} icone={PauseCircle} cor="text-orange-700" fundo="bg-orange-100" />
        <Kpi rotulo="Perdidos" valor={`${perdidos.total}`} detalhe={formatarBRL(perdidos.valorTotal)} icone={XCircle} cor="text-red-700" fundo="bg-red-100" />
      </div>

      {/* Numero coerente para metricas que nao sao de fechamento */}
      {!ehFechamento && (
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <p className="text-sm font-semibold text-escuro">No periodo</p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini rotulo="Clientes atendidos" valor={`${metricas.clientesAtendidos}`} />
            <Mini rotulo="Conversao" valor={`${Math.round(metricas.conversao * 100)}%`} />
            <Mini rotulo="1a resposta" valor={formatarDuracao(metricas.tempoPrimeiraRespostaSeg)} />
            <Mini rotulo="Resolucao" valor={formatarDuracao(metricas.tempoResolucaoSeg)} />
          </div>
        </div>
      )}

      {/* Grafico de evolucao (metricas de fechamento) */}
      {ehFechamento && serie.length > 1 && (
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-escuro">
            Evolucao acumulada vs alvo
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={serie} margin={{ left: -16, right: 8, top: 4 }}>
              <defs>
                <linearGradient id="gMeta" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3cbfb3" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3cbfb3" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#0000000d" vertical={false} />
              <XAxis
                dataKey="dia"
                tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)}
                tick={{ fontSize: 11, fill: "#1a4f4a99" }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11, fill: "#1a4f4a99" }} />
              <Tooltip
                formatter={(value) => [
                  meta.metrica === "VALOR_VENDIDO"
                    ? formatarBRL(Number(value ?? 0))
                    : Number(value ?? 0).toLocaleString("pt-BR"),
                  "",
                ]}
                labelFormatter={(d) => `Dia ${d}`}
              />
              <Area
                type="monotone"
                dataKey="acumulado"
                stroke="#3cbfb3"
                strokeWidth={2}
                fill="url(#gMeta)"
                name="Acumulado"
              />
              <Line
                type="monotone"
                dataKey="alvo"
                stroke="#0f2e2b"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                name="Alvo"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Drill-down */}
      <div className="rounded-2xl border border-black/5 bg-white p-4">
        <div className="mb-3 flex gap-1 overflow-x-auto border-b border-black/5">
          {(
            [
              ["ganhos", `Ganhos (${ganhos.length})`],
              ["pendentes", `Pendentes (${pendentes.length})`],
              ["perdidos", `Perdidos (${perdidos.total})`],
              ["abertos", `Em aberto (${abertos.length})`],
            ] as [Aba, string][]
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              onClick={() => setAba(chave)}
              className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                aba === chave
                  ? "border-tiffany text-tiffany"
                  : "border-transparent text-medio/60 hover:text-escuro"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {aba === "perdidos" ? (
          <PerdidosAnalise dadosFixos={perdidos} onAbrir={abrirCliente} />
        ) : (
          <ListaNeg
            itens={aba === "ganhos" ? ganhos : aba === "pendentes" ? pendentes : abertos}
            mostrarMotivo={aba === "pendentes"}
            onAbrir={abrirCliente}
          />
        )}
      </div>

      {editando && (
        <FormMetaColaborador
          meta={metaParaForm}
          onFechar={() => setEditando(false)}
          onSalvo={() => {
            setEditando(false);
            void carregar();
          }}
        />
      )}

      {painelId && (
        <PainelNegocio
          negocioId={painelId}
          papel={papel}
          agenteIdAtual={agenteIdAtual}
          agentes={agentes}
          etiquetas={etiquetas}
          etapas={etapas}
          onFechar={() => setPainelId(null)}
          onAtualizado={() => void carregar()}
        />
      )}
    </div>
  );
}

function ListaNeg({
  itens,
  mostrarMotivo,
  onAbrir,
}: {
  itens: NegItem[];
  mostrarMotivo?: boolean;
  onAbrir: (id: string) => void;
}) {
  if (itens.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-medio/50">
        Nada por aqui no periodo.
      </p>
    );
  }
  return (
    <div className="scroll-fino max-h-80 space-y-1.5 overflow-y-auto">
      {itens.map((i) => (
        <button
          key={i.negocioId}
          onClick={() => onAbrir(i.negocioId)}
          className="flex w-full items-center gap-2.5 rounded-lg border border-black/5 bg-white p-2 text-left transition-colors hover:bg-fundo"
        >
          <AvatarCliente nome={i.nome} telefone={i.telefone} fotoUrl={i.fotoUrl} tamanho={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-escuro">{i.nome}</p>
            {mostrarMotivo ? (
              <p className="truncate text-xs text-orange-900/80">
                {i.motivoPendencia ?? "Sem motivo"}
              </p>
            ) : i.fechadoEm ? (
              <p className="truncate text-xs text-medio/60">
                {dataCurta(i.fechadoEm)}
              </p>
            ) : null}
          </div>
          {i.valor != null && (
            <span className="shrink-0 text-xs font-semibold text-medio/70">
              {formatarBRL(i.valor)}
            </span>
          )}
          <ChevronRight className="h-4 w-4 shrink-0 text-medio/40" />
        </button>
      ))}
    </div>
  );
}

function Kpi({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  cor,
  fundo,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  icone: LucideIcon;
  cor: string;
  fundo: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${fundo} ${cor}`}>
        <Icone className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-none text-escuro">{valor}</p>
        <p className="mt-1 truncate text-xs text-medio/60">{rotulo}</p>
        {detalhe && <p className="truncate text-[11px] text-medio/50">{detalhe}</p>}
      </div>
    </div>
  );
}

function Mini({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-fundo p-3">
      <p className="text-lg font-semibold text-escuro">{valor}</p>
      <p className="text-xs text-medio/60">{rotulo}</p>
    </div>
  );
}
