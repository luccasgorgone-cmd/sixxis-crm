"use client";

// "Minha carteira" completa: filtro de periodo (diario/semanal/15/30/custom),
// KPIs do periodo + estado atual, mini-tendencia (ganhos x perdidos), perdidos
// por motivo, etiquetas, "a contatar", e lista de clientes com busca. Tudo
// clicavel ate o painel do cliente. Seletor de colaborador (admin) + alternador
// Venda/Pos-venda. Botao de envio em massa.
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Briefcase,
  CircleDot,
  Trophy,
  XCircle,
  PauseCircle,
  Users,
  Tag,
  ChevronRight,
  CalendarClock,
  Megaphone,
  TrendingUp,
  Clock,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { AvatarCliente } from "@/components/AvatarCliente";
import { EstadoErro } from "@/components/ui/Estado";
import { FiltroPeriodo, type ValorPeriodo } from "@/components/ui/FiltroPeriodo";
import {
  BadgeStatusNegocio,
  BadgePendente,
  BadgeFinalidade,
} from "@/components/badges";
import { corFinalidade } from "@/components/BadgeFinalidade";
import { PainelNegocio } from "@/components/kanban/PainelNegocio";
import { EnvioMassa } from "@/components/campanhas/EnvioMassa";
import {
  PerdidosAnalise,
  type AnalisePerdidos,
} from "@/components/perdidos/PerdidosAnalise";
import type {
  Etapa,
  EtiquetaChip,
  AgenteResumo,
  Finalidade,
} from "@/components/kanban/tipos";
import { formatarBRL, formatarTelefone, formatarDuracao } from "@/lib/format";

type Item = {
  negocioId: string;
  leadId: string;
  nomeEfetivo: string;
  telefone: string;
  fotoUrl: string | null;
  valor: number | null;
  status: "ABERTO" | "GANHO" | "PERDIDO" | null;
  pendente: boolean;
  motivoPendencia: string | null;
  fechadoEm: string | null;
  etiquetas: EtiquetaChip[];
};

type EtiquetaContagem = EtiquetaChip & { count: number };

type AContatar = {
  id: string;
  negocioId: string | null;
  leadId: string;
  nomeEfetivo: string;
  telefone: string;
  fotoUrl: string | null;
  dataHora: string;
  nota: string | null;
  vencido: boolean;
};

type Carteira = {
  finalidade: Finalidade;
  agente: { id: string; nome: string | null };
  periodo: { preset: string; inicio: string; fim: string };
  kpis: {
    abertos: number;
    pendentes: number;
    totalClientes: number;
    ganhos: number;
    valorGanhos: number;
    perdidos: number;
    valorPerdidos: number;
    conversao: number;
    ticketMedio: number;
    clientesAtendidos: number;
    tempoPrimeiraRespostaSeg: number;
  };
  etiquetas: EtiquetaContagem[];
  itens: Item[];
  abertos: Item[];
  pendentesLista: Item[];
  ganhosPeriodo: Item[];
  perdidos: AnalisePerdidos;
  aContatar: AContatar[];
};

type Recorte = { titulo: string; itens: Item[] };
type Vendedor = { id: string; nome: string };

export function MinhaCarteira({
  papel,
  agenteIdAtual,
  acessoVenda,
  acessoPosVenda,
}: {
  papel: string;
  agenteIdAtual: string;
  acessoVenda: boolean;
  acessoPosVenda: boolean;
}) {
  const ehAdmin = papel === "ADMIN";
  const finalidadesDisponiveis = ehAdmin
    ? (["VENDA", "POS_VENDA"] as Finalidade[])
    : ([
        acessoVenda ? "VENDA" : null,
        acessoPosVenda ? "POS_VENDA" : null,
      ].filter(Boolean) as Finalidade[]);

  const [finalidade, setFinalidade] = useState<Finalidade>(
    finalidadesDisponiveis[0] ?? "VENDA",
  );
  const [periodo, setPeriodo] = useState<ValorPeriodo>({ preset: "mes" });
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [agenteSel, setAgenteSel] = useState("");
  const [dados, setDados] = useState<Carteira | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const [recorte, setRecorte] = useState<Recorte | null>(null);
  const [painelId, setPainelId] = useState<string | null>(null);
  const [envioAberto, setEnvioAberto] = useState(false);

  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [etiquetasPanel, setEtiquetasPanel] = useState<EtiquetaChip[]>([]);
  const [agentesPanel, setAgentesPanel] = useState<AgenteResumo[]>([]);

  useEffect(() => {
    fetch("/api/etapas")
      .then((r) => (r.ok ? r.json() : { etapas: [] }))
      .then((d) => setEtapas(d.etapas ?? []))
      .catch(() => undefined);
    fetch("/api/etiquetas")
      .then((r) => (r.ok ? r.json() : { etiquetas: [] }))
      .then((d) => setEtiquetasPanel(d.etiquetas ?? []))
      .catch(() => undefined);
    if (ehAdmin) {
      fetch("/api/agentes")
        .then((r) => (r.ok ? r.json() : { agentes: [] }))
        .then((d) => setAgentesPanel(d.agentes ?? []))
        .catch(() => undefined);
    }
  }, [ehAdmin]);

  useEffect(() => {
    if (!ehAdmin) return;
    fetch(`/api/vendedores?finalidade=${finalidade}`)
      .then((r) => (r.ok ? r.json() : { vendedores: [] }))
      .then((d) => {
        const lista: Vendedor[] = d.vendedores ?? [];
        setVendedores(lista);
        setAgenteSel((atual) =>
          atual && lista.some((v) => v.id === atual)
            ? atual
            : (lista[0]?.id ?? ""),
        );
      })
      .catch(() => undefined);
  }, [ehAdmin, finalidade]);

  const semAcesso = !ehAdmin && finalidadesDisponiveis.length === 0;

  const carregar = useCallback(async () => {
    if (semAcesso) {
      setDados(null);
      setCarregando(false);
      setErro(null);
      return;
    }
    if (ehAdmin && !agenteSel) {
      setDados(null);
      setCarregando(false);
      setErro(null);
      return;
    }
    // Custom incompleto: aguarda as duas datas.
    if (periodo.preset === "custom" && (!periodo.inicio || !periodo.fim)) {
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const p = new URLSearchParams({ finalidade });
      if (ehAdmin && agenteSel) p.set("agenteId", agenteSel);
      if (periodo.preset === "custom") {
        p.set("inicio", `${periodo.inicio}T00:00:00`);
        p.set("fim", `${periodo.fim}T23:59:59`);
      } else {
        p.set("periodo", periodo.preset);
      }
      const r = await fetch(`/api/carteira?${p.toString()}`);
      if (r.ok) {
        setDados(await r.json());
      } else {
        const d = await r.json().catch(() => null);
        setErro(d?.erro ?? "Nao foi possivel carregar a carteira.");
        setDados(null);
      }
    } catch {
      setErro("Falha de conexao.");
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [finalidade, ehAdmin, agenteSel, periodo, semAcesso]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const cor = corFinalidade(finalidade);
  const semColaborador = ehAdmin && !agenteSel;

  // Mini-tendencia: ganhos x perdidos por dia no periodo.
  const tendencia = useMemo(() => {
    if (!dados) return [];
    const mapa = new Map<string, { dia: string; ganhos: number; perdidos: number }>();
    const add = (iso: string | null, chave: "ganhos" | "perdidos") => {
      if (!iso) return;
      const dia = iso.slice(0, 10);
      const e = mapa.get(dia) ?? { dia, ganhos: 0, perdidos: 0 };
      e[chave] += 1;
      mapa.set(dia, e);
    };
    for (const g of dados.ganhosPeriodo) add(g.fechadoEm, "ganhos");
    for (const pp of dados.perdidos.itens) add(pp.fechadoEm, "perdidos");
    return [...mapa.values()]
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .map((d) => ({ ...d, rotulo: d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7) }));
  }, [dados]);

  // Lista de clientes (busca sobre o portfolio).
  const clientesFiltrados = useMemo(() => {
    if (!dados) return [];
    const q = busca.trim().toLowerCase();
    const qDig = busca.replace(/\D/g, "");
    // Distintos por lead.
    const vistos = new Set<string>();
    const lista: Item[] = [];
    for (const i of dados.itens) {
      if (vistos.has(i.leadId)) continue;
      vistos.add(i.leadId);
      lista.push(i);
    }
    if (!q) return lista;
    return lista.filter(
      (i) =>
        i.nomeEfetivo.toLowerCase().includes(q) ||
        (qDig.length > 0 && i.telefone.replace(/\D/g, "").includes(qDig)),
    );
  }, [dados, busca]);

  return (
    <div className="space-y-5 p-6">
      {/* Cabecalho + controles */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${cor.suave} ${cor.texto}`}
          >
            <Briefcase className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-escuro">Minha carteira</h2>
            <p className="text-sm text-medio/60">
              {ehAdmin
                ? "Carteira de um colaborador por finalidade e periodo"
                : "Seus clientes, resultados e pendencias"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ehAdmin && (
            <select
              value={agenteSel}
              onChange={(e) => setAgenteSel(e.target.value)}
              className="campo"
            >
              {vendedores.length === 0 && <option value="">Sem colaboradores</option>}
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          )}
          {finalidadesDisponiveis.length > 1 && (
            <div className="flex rounded-lg border border-black/10 bg-white p-0.5">
              {finalidadesDisponiveis.map((ff) => {
                const ativo = ff === finalidade;
                const c = corFinalidade(ff);
                return (
                  <button
                    key={ff}
                    onClick={() => setFinalidade(ff)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      ativo ? `${c.barra} text-white` : "text-medio/70 hover:bg-black/5"
                    }`}
                  >
                    {c.rotulo}
                  </button>
                );
              })}
            </div>
          )}
          {finalidadesDisponiveis.length === 1 && (
            <BadgeFinalidade finalidade={finalidade} />
          )}
          {!semAcesso && !semColaborador && (
            <button
              onClick={() => setEnvioAberto(true)}
              className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro"
            >
              <Megaphone className="h-4 w-4" /> Envio em massa
            </button>
          )}
        </div>
      </div>

      {/* Filtro de periodo */}
      {!semAcesso && !semColaborador && (
        <FiltroPeriodo valor={periodo} onChange={setPeriodo} />
      )}

      {/* Conteudo */}
      {semAcesso ? (
        <Vazio
          titulo="Sem carteira"
          texto="Voce ainda nao tem acesso a Venda nem a Pos-venda. Fale com o admin."
        />
      ) : carregando ? (
        <CarteiraSkeleton />
      ) : erro ? (
        <EstadoErro mensagem={erro} onRetry={() => void carregar()} />
      ) : semColaborador ? (
        <Vazio
          titulo="Selecione um colaborador"
          texto="Escolha um colaborador com acesso a essa finalidade para ver a carteira."
        />
      ) : !dados ? (
        <Vazio titulo="Carteira vazia" texto="Nenhum cliente nesta finalidade ainda." />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Kpi
              rotulo="Em aberto"
              valor={`${dados.kpis.abertos}`}
              icone={CircleDot}
              cor="text-sky-700"
              fundo="bg-sky-100"
              tag="atual"
              onClick={
                dados.abertos.length
                  ? () => setRecorte({ titulo: "Em aberto", itens: dados.abertos })
                  : undefined
              }
            />
            <Kpi
              rotulo="Ganhos"
              valor={`${dados.kpis.ganhos}`}
              detalhe={formatarBRL(dados.kpis.valorGanhos)}
              icone={Trophy}
              cor="text-green-700"
              fundo="bg-green-100"
              tag="periodo"
              onClick={
                dados.ganhosPeriodo.length
                  ? () => setRecorte({ titulo: "Ganhos no periodo", itens: dados.ganhosPeriodo })
                  : undefined
              }
            />
            <Kpi
              rotulo="Perdidos"
              valor={`${dados.kpis.perdidos}`}
              detalhe={formatarBRL(dados.kpis.valorPerdidos)}
              icone={XCircle}
              cor="text-red-700"
              fundo="bg-red-100"
              tag="periodo"
            />
            <Kpi
              rotulo="Negocios pendentes"
              valor={`${dados.kpis.pendentes}`}
              icone={PauseCircle}
              cor="text-orange-700"
              fundo="bg-orange-100"
              tag="atual"
              onClick={
                dados.pendentesLista.length
                  ? () => setRecorte({ titulo: "Negocios pendentes", itens: dados.pendentesLista })
                  : undefined
              }
            />
            <Kpi
              rotulo="Clientes"
              valor={`${dados.kpis.totalClientes}`}
              icone={Users}
              cor="text-tiffany-escuro"
              fundo="bg-tiffany/10"
              tag="atual"
            />
            <Kpi
              rotulo="Conversao"
              valor={`${Math.round(dados.kpis.conversao * 100)}%`}
              icone={TrendingUp}
              cor="text-violet-700"
              fundo="bg-violet-100"
              tag="periodo"
            />
            <Kpi
              rotulo="Ticket medio"
              valor={formatarBRL(dados.kpis.ticketMedio)}
              icone={Trophy}
              cor="text-green-700"
              fundo="bg-green-100"
              tag="periodo"
            />
            <Kpi
              rotulo="1a resposta"
              valor={formatarDuracao(dados.kpis.tempoPrimeiraRespostaSeg)}
              icone={Clock}
              cor="text-medio"
              fundo="bg-black/5"
              tag="periodo"
            />
          </div>

          {/* Mini-tendencia */}
          {tendencia.length > 0 && (
            <section className="rounded-2xl border border-black/5 bg-white p-4">
              <p className="mb-3 text-sm font-semibold text-escuro">
                Tendencia do periodo
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={tendencia} margin={{ left: -20, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0000000d" vertical={false} />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "#1a4f4a99" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#1a4f4a99" }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ganhos" name="Ganhos" fill="#16a34a" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="perdidos" name="Perdidos" fill="#dc2626" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </section>
          )}

          {/* A contatar */}
          {dados.aContatar.length > 0 && (
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
                <CalendarClock className="h-4 w-4 text-tiffany" /> A contatar
                <span className="rounded-full bg-tiffany/10 px-2 py-0.5 text-xs font-semibold text-tiffany">
                  {dados.aContatar.length}
                </span>
              </h3>
              <div className="space-y-2">
                {dados.aContatar.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => l.negocioId && setPainelId(l.negocioId)}
                    disabled={!l.negocioId}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                      l.vencido
                        ? "border-red-200 bg-red-50/60 hover:bg-red-50"
                        : "border-black/5 bg-white hover:bg-fundo"
                    }`}
                  >
                    <AvatarCliente nome={l.nomeEfetivo} telefone={l.telefone} fotoUrl={l.fotoUrl} tamanho={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-escuro">{l.nomeEfetivo}</p>
                      <p className="flex items-center gap-1 text-xs text-medio/70">
                        <CalendarClock className="h-3 w-3" />
                        {new Date(l.dataHora).toLocaleString("pt-BR", {
                          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                        })}
                        {l.vencido && <span className="font-semibold text-red-600">· vencido</span>}
                      </p>
                      {l.nota && <p className="truncate text-xs text-medio/60">{l.nota}</p>}
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-medio/40" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Etiquetas */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
              <Tag className="h-4 w-4 text-tiffany" /> Etiquetas
            </h3>
            {dados.etiquetas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-black/10 bg-white p-4 text-sm text-medio/60">
                Nenhuma etiqueta aplicada nesta carteira.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {dados.etiquetas.map((e) => (
                  <button
                    key={e.id}
                    onClick={() =>
                      setRecorte({
                        titulo: e.nome,
                        itens: dados.itens.filter((i) =>
                          i.etiquetas.some((x) => x.id === e.id),
                        ),
                      })
                    }
                    className="flex items-center justify-between gap-2 rounded-xl border border-black/5 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: e.cor }} />
                      <span className="truncate text-sm font-medium text-escuro">{e.nome}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold text-medio/70">
                      {e.count}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Perdidos por motivo */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
              <XCircle className="h-4 w-4 text-red-500" /> Perdidos no periodo
            </h3>
            <PerdidosAnalise dadosFixos={dados.perdidos} onAbrir={(id) => setPainelId(id)} />
          </section>

          {/* Lista de clientes com busca */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
                <Users className="h-4 w-4 text-tiffany" /> Clientes
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold text-medio/70">
                  {clientesFiltrados.length}
                </span>
              </h3>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-medio/40" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar cliente"
                  className="campo w-56 pl-8"
                />
              </div>
            </div>
            <div className="scroll-fino max-h-96 space-y-1.5 overflow-y-auto">
              {clientesFiltrados.length === 0 ? (
                <p className="py-8 text-center text-sm text-medio/50">
                  Nenhum cliente encontrado.
                </p>
              ) : (
                clientesFiltrados.map((i) => (
                  <ItemCliente key={i.leadId} item={i} onAbrir={() => setPainelId(i.negocioId)} />
                ))
              )}
            </div>
          </section>
        </>
      )}

      {/* Drawer de lista do recorte */}
      {recorte && (
        <ListaRecorte
          titulo={recorte.titulo}
          itens={recorte.itens}
          onAbrir={(id) => setPainelId(id)}
          onFechar={() => setRecorte(null)}
        />
      )}

      {painelId && (
        <PainelNegocio
          negocioId={painelId}
          papel={papel}
          agenteIdAtual={agenteIdAtual}
          agentes={agentesPanel}
          etiquetas={etiquetasPanel}
          etapas={etapas}
          onFechar={() => setPainelId(null)}
          onAtualizado={() => void carregar()}
        />
      )}

      {envioAberto && (
        <EnvioMassa
          finalidade={finalidade}
          ehAdmin={ehAdmin}
          agenteSel={ehAdmin ? agenteSel : agenteIdAtual}
          etiquetas={etiquetasPanel}
          etapas={etapas}
          onFechar={() => setEnvioAberto(false)}
        />
      )}
    </div>
  );
}

function ItemCliente({ item: i, onAbrir }: { item: Item; onAbrir: () => void }) {
  return (
    <button
      onClick={onAbrir}
      className="flex w-full items-center gap-3 rounded-xl border border-black/5 bg-white p-2.5 text-left transition-colors hover:bg-fundo"
    >
      <AvatarCliente nome={i.nomeEfetivo} telefone={i.telefone} fotoUrl={i.fotoUrl} tamanho={34} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-escuro">{i.nomeEfetivo}</p>
        <p className="truncate text-xs text-medio/60">{formatarTelefone(i.telefone)}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {i.status && <BadgeStatusNegocio status={i.status} />}
        {i.pendente && <BadgePendente motivo={i.motivoPendencia} />}
      </div>
    </button>
  );
}

function Kpi({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  cor,
  fundo,
  tag,
  onClick,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  icone: LucideIcon;
  cor: string;
  fundo: string;
  tag?: "atual" | "periodo";
  onClick?: () => void;
}) {
  const clicavel = Boolean(onClick);
  return (
    <button
      onClick={onClick}
      disabled={!clicavel}
      className={`relative flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-4 text-left transition-all ${
        clicavel ? "hover:-translate-y-0.5 hover:shadow-md" : "cursor-default"
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${fundo} ${cor}`}>
        <Icone className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xl font-semibold leading-none text-escuro" title={valor}>{valor}</p>
        <p className="mt-1 truncate text-xs text-medio/60">{rotulo}</p>
        {detalhe && <p className="truncate text-[11px] text-medio/50">{detalhe}</p>}
      </div>
      {tag && (
        <span className="absolute right-2 top-2 rounded-full bg-black/5 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-medio/50">
          {tag === "atual" ? "atual" : "periodo"}
        </span>
      )}
    </button>
  );
}

function ListaRecorte({
  titulo,
  itens,
  onAbrir,
  onFechar,
}: {
  titulo: string;
  itens: Item[];
  onAbrir: (negocioId: string) => void;
  onFechar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="fade-in absolute inset-0 bg-black/30" onClick={onFechar} />
      <aside className="drawer-in relative flex h-full w-full max-w-md flex-col bg-fundo shadow-xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-black/5 bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-escuro">{titulo}</p>
            <p className="text-xs text-medio/60">
              {itens.length} {itens.length === 1 ? "negocio" : "negocios"}
            </p>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-medio/60 transition-colors hover:bg-black/5 hover:text-escuro"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="scroll-fino flex-1 space-y-2 overflow-y-auto p-3">
          {itens.length === 0 ? (
            <p className="py-10 text-center text-sm text-medio/50">
              Nenhum cliente neste recorte.
            </p>
          ) : (
            itens.map((i) => (
              <button
                key={i.negocioId}
                onClick={() => onAbrir(i.negocioId)}
                className="flex w-full items-center gap-3 rounded-xl border border-black/5 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <AvatarCliente nome={i.nomeEfetivo} telefone={i.telefone} fotoUrl={i.fotoUrl} tamanho={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-escuro">{i.nomeEfetivo}</p>
                  <p className="truncate text-xs text-medio/60">{formatarTelefone(i.telefone)}</p>
                  {(i.etiquetas.length > 0 || i.valor != null) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {i.valor != null && (
                        <span className="text-xs font-semibold text-tiffany-escuro">
                          {formatarBRL(i.valor)}
                        </span>
                      )}
                      {i.etiquetas.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                          style={{ backgroundColor: e.cor }}
                        >
                          {e.nome}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {i.status && <BadgeStatusNegocio status={i.status} />}
                  {i.pendente && <BadgePendente motivo={i.motivoPendencia} />}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function Vazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/10 bg-white py-16 text-center">
      <Briefcase className="h-8 w-8 text-medio/30" />
      <p className="text-sm font-medium text-escuro">{titulo}</p>
      <p className="max-w-xs text-xs text-medio/60">{texto}</p>
    </div>
  );
}

function CarteiraSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-4">
            <div className="skeleton h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-6 w-10" />
              <div className="skeleton h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
      <div className="skeleton h-48 rounded-2xl" />
    </div>
  );
}
