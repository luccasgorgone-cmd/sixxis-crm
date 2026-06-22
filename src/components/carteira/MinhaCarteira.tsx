"use client";

// "Minha carteira": visao da carteira do colaborador (ou, para admin, de um
// colaborador escolhido) numa finalidade. Mostra cards de status, total de
// clientes, grade de etiquetas e a lista de pendentes — TUDO clicavel: cada
// recorte abre uma lista filtrada e, dali, o painel do cliente.
import { useState, useEffect, useCallback, useMemo } from "react";
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
  X,
  type LucideIcon,
} from "lucide-react";
import { AvatarCliente } from "@/components/AvatarCliente";
import { EstadoErro } from "@/components/ui/Estado";
import {
  BadgeStatusNegocio,
  BadgePendente,
  BadgeFinalidade,
} from "@/components/badges";
import { corFinalidade } from "@/components/BadgeFinalidade";
import { PainelNegocio } from "@/components/kanban/PainelNegocio";
import { EnvioMassa } from "@/components/campanhas/EnvioMassa";
import { PerdidosAnalise } from "@/components/perdidos/PerdidosAnalise";
import type {
  Etapa,
  EtiquetaChip,
  AgenteResumo,
  Finalidade,
} from "@/components/kanban/tipos";
import { formatarBRL, formatarTelefone } from "@/lib/format";

type Item = {
  negocioId: string;
  leadId: string;
  nomeEfetivo: string;
  telefone: string;
  fotoUrl: string | null;
  valor: number | null;
  status: "ABERTO" | "GANHO" | "PERDIDO";
  pendente: boolean;
  motivoPendencia: string | null;
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
  resumo: {
    aberto: number;
    ganho: number;
    perdido: number;
    pendente: number;
    totalClientes: number;
  };
  etiquetas: EtiquetaContagem[];
  itens: Item[];
  pendentes: Item[];
  aContatar: AContatar[];
};

// Recorte do drilldown (qual subconjunto de itens mostrar na lista).
type Recorte =
  | { tipo: "status"; status: "ABERTO" | "GANHO" | "PERDIDO"; titulo: string }
  | { tipo: "pendente"; titulo: string }
  | { tipo: "clientes"; titulo: string }
  | { tipo: "etiqueta"; etiquetaId: string; titulo: string };

type Vendedor = { id: string; nome: string };

const CARDS: {
  chave: keyof Carteira["resumo"];
  rotulo: string;
  icone: LucideIcon;
  cor: string; // texto/icone
  fundo: string; // fundo do icone
}[] = [
  {
    chave: "aberto",
    rotulo: "Em aberto",
    icone: CircleDot,
    cor: "text-sky-700",
    fundo: "bg-sky-100",
  },
  {
    chave: "ganho",
    rotulo: "Ganhos",
    icone: Trophy,
    cor: "text-green-700",
    fundo: "bg-green-100",
  },
  {
    chave: "perdido",
    rotulo: "Perdidos",
    icone: XCircle,
    cor: "text-red-700",
    fundo: "bg-red-100",
  },
  {
    chave: "pendente",
    rotulo: "Negocios pendentes",
    icone: PauseCircle,
    cor: "text-orange-700",
    fundo: "bg-orange-100",
  },
  {
    chave: "totalClientes",
    rotulo: "Clientes",
    icone: Users,
    cor: "text-tiffany-escuro",
    fundo: "bg-tiffany/10",
  },
];

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
  // Alternador de finalidade: admin vê as duas; colaborador, as que tem acesso.
  const finalidadesDisponiveis = ehAdmin
    ? (["VENDA", "POS_VENDA"] as Finalidade[])
    : ([
        acessoVenda ? "VENDA" : null,
        acessoPosVenda ? "POS_VENDA" : null,
      ].filter(Boolean) as Finalidade[]);

  const [finalidade, setFinalidade] = useState<Finalidade>(
    finalidadesDisponiveis[0] ?? "VENDA",
  );
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [agenteSel, setAgenteSel] = useState("");
  const [dados, setDados] = useState<Carteira | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Recorte aberto (lista) e negocio aberto (painel).
  const [recorte, setRecorte] = useState<Recorte | null>(null);
  const [painelId, setPainelId] = useState<string | null>(null);
  const [envioAberto, setEnvioAberto] = useState(false);

  // Listas auxiliares para o painel do negocio.
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

  // Admin: lista de colaboradores da finalidade (para o seletor).
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
    // Colaborador sem acesso a nenhuma finalidade: nada a carregar.
    if (semAcesso) {
      setDados(null);
      setCarregando(false);
      setErro(null);
      return;
    }
    // Admin precisa de um colaborador escolhido.
    if (ehAdmin && !agenteSel) {
      setDados(null);
      setCarregando(false);
      setErro(null);
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const params = new URLSearchParams({ finalidade });
      if (ehAdmin && agenteSel) params.set("agenteId", agenteSel);
      const r = await fetch(`/api/carteira?${params.toString()}`);
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
  }, [finalidade, ehAdmin, agenteSel, semAcesso]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Itens do recorte atual (filtro client-side sobre a lista ja carregada).
  const itensRecorte = useMemo(() => {
    if (!dados || !recorte) return [];
    if (recorte.tipo === "clientes") return dados.itens;
    if (recorte.tipo === "pendente") return dados.pendentes;
    if (recorte.tipo === "status")
      return dados.itens.filter((i) => i.status === recorte.status);
    return dados.itens.filter((i) =>
      i.etiquetas.some((e) => e.id === recorte.etiquetaId),
    );
  }, [dados, recorte]);

  const cor = corFinalidade(finalidade);
  const semColaborador = ehAdmin && !agenteSel;

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
                ? "Carteira de um colaborador por finalidade"
                : "Seus clientes, status e pendencias"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ehAdmin && (
            <select
              value={agenteSel}
              onChange={(e) => setAgenteSel(e.target.value)}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
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
              {finalidadesDisponiveis.map((f) => {
                const ativo = f === finalidade;
                const c = corFinalidade(f);
                return (
                  <button
                    key={f}
                    onClick={() => setFinalidade(f)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      ativo
                        ? `${c.barra} text-white`
                        : "text-medio/70 hover:bg-black/5"
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
        <Vazio
          titulo="Carteira vazia"
          texto="Nenhum cliente nesta finalidade ainda."
        />
      ) : (
        <>
          {/* Cards de status + total */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {CARDS.map((c) => {
              const valor = dados.resumo[c.chave];
              const Icone = c.icone;
              const recorteCard: Recorte =
                c.chave === "totalClientes"
                  ? { tipo: "clientes", titulo: "Todos os clientes" }
                  : c.chave === "pendente"
                    ? { tipo: "pendente", titulo: "Negocios pendentes" }
                    : {
                        tipo: "status",
                        status: c.chave.toUpperCase() as
                          | "ABERTO"
                          | "GANHO"
                          | "PERDIDO",
                        titulo: c.rotulo,
                      };
              return (
                <button
                  key={c.chave}
                  onClick={() => valor > 0 && setRecorte(recorteCard)}
                  disabled={valor === 0}
                  className={`group flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-4 text-left transition-all ${
                    valor > 0
                      ? "hover:-translate-y-0.5 hover:shadow-md"
                      : "cursor-default opacity-70"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.fundo} ${c.cor}`}
                  >
                    <Icone className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl font-semibold leading-none text-escuro">
                      {valor}
                    </p>
                    <p className="mt-1 truncate text-xs text-medio/60">
                      {c.rotulo}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* A contatar (lembretes vencidos + hoje) */}
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
                    <AvatarCliente
                      nome={l.nomeEfetivo}
                      telefone={l.telefone}
                      fotoUrl={l.fotoUrl}
                      tamanho={36}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-escuro">
                        {l.nomeEfetivo}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-medio/70">
                        <CalendarClock className="h-3 w-3" />
                        {new Date(l.dataHora).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {l.vencido && (
                          <span className="font-semibold text-red-600">
                            · vencido
                          </span>
                        )}
                      </p>
                      {l.nota && (
                        <p className="truncate text-xs text-medio/60">{l.nota}</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-medio/40" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Grade de etiquetas */}
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
                        tipo: "etiqueta",
                        etiquetaId: e.id,
                        titulo: e.nome,
                      })
                    }
                    className="flex items-center justify-between gap-2 rounded-xl border border-black/5 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: e.cor }}
                      />
                      <span className="truncate text-sm font-medium text-escuro">
                        {e.nome}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold text-medio/70">
                      {e.count}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Pendentes */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
              <PauseCircle className="h-4 w-4 text-orange-500" /> Negocios pendentes
              {dados.pendentes.length > 0 && (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                  {dados.pendentes.length}
                </span>
              )}
            </h3>
            {dados.pendentes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-black/10 bg-white p-4 text-sm text-medio/60">
                Nenhuma pendencia nesta carteira. Tudo em dia.
              </p>
            ) : (
              <div className="space-y-2">
                {dados.pendentes.map((i) => (
                  <button
                    key={i.negocioId}
                    onClick={() => setPainelId(i.negocioId)}
                    className="flex w-full items-center gap-3 rounded-xl border border-orange-200 bg-orange-50/60 p-3 text-left transition-colors hover:bg-orange-50"
                  >
                    <AvatarCliente
                      nome={i.nomeEfetivo}
                      telefone={i.telefone}
                      fotoUrl={i.fotoUrl}
                      tamanho={36}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-escuro">
                        {i.nomeEfetivo}
                      </p>
                      <p className="truncate text-xs text-orange-900/80">
                        {i.motivoPendencia ?? "Sem motivo informado"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-medio/40" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Perdidos por motivo */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
              <XCircle className="h-4 w-4 text-red-500" /> Perdidos
            </h3>
            <PerdidosAnalise
              finalidade={finalidade}
              agenteId={ehAdmin ? agenteSel : undefined}
              onAbrir={(id) => setPainelId(id)}
            />
          </section>
        </>
      )}

      {/* Drawer de lista do recorte */}
      {recorte && (
        <ListaRecorte
          titulo={recorte.titulo}
          itens={itensRecorte}
          onAbrir={(id) => setPainelId(id)}
          onFechar={() => setRecorte(null)}
        />
      )}

      {/* Painel do cliente/negocio */}
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

      {/* Envio em massa */}
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

// Lista filtrada de um recorte (drawer lateral). Cada item abre o painel.
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
              {itens.length} {itens.length === 1 ? "cliente" : "clientes"}
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
                <AvatarCliente
                  nome={i.nomeEfetivo}
                  telefone={i.telefone}
                  fotoUrl={i.fotoUrl}
                  tamanho={38}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-escuro">
                    {i.nomeEfetivo}
                  </p>
                  <p className="truncate text-xs text-medio/60">
                    {formatarTelefone(i.telefone)}
                  </p>
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
                  <BadgeStatusNegocio status={i.status} />
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-4"
          >
            <div className="skeleton h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-6 w-10" />
              <div className="skeleton h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-14 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
