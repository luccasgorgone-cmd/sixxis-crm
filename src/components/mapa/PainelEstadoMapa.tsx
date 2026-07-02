"use client";

// Drawer largo do Mapa: detalhe de um estado com abas (Visao geral, Clientes,
// Compradores, Perdidos & Pendentes). Reusa o padrao do PainelClientesEstado
// (overlay + slide), mas com dados do /api/mapa/estado. Edicao inline de
// temperatura e etapa/status via PATCH /api/negocios/[id] (otimista + rollback).
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Search,
  Loader2,
  Users,
  ExternalLink,
  Briefcase,
  MessageSquare,
  Trophy,
  Repeat2,
  ThermometerSun,
  ArrowUpDown,
} from "lucide-react";
import Link from "next/link";
import { BadgeTemperatura } from "@/components/BadgeTemperatura";
import { BadgeStatusNegocio, BadgePendente } from "@/components/badges";
import { EstadoErro } from "@/components/ui/Estado";
import { Reveal } from "@/components/inteligencia/Reveal";
import { formatarBRL, normalizarTexto } from "@/lib/format";
import { paramsEscopo } from "@/lib/escopo";
import { BreakdownProdutos } from "./BreakdownProdutos";
import type { ClienteMapa, EstadoDetalheResp } from "./tipos";

type Ordenacao = "recentes" | "valor";

type EtapaOpcao = { id: string; nome: string; tipo?: string };

const ABAS = [
  { chave: "geral", rotulo: "Visao geral" },
  { chave: "clientes", rotulo: "Clientes" },
  { chave: "compradores", rotulo: "Compradores" },
  { chave: "perdidos", rotulo: "Perdidos & Pendentes" },
] as const;
type Aba = (typeof ABAS)[number]["chave"];

const TEMPERATURAS: ("QUENTE" | "MORNO" | "FRIO")[] = ["QUENTE", "MORNO", "FRIO"];

function desde(iso: string | null): string {
  if (!iso) return "sem contato";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `ha ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `ha ${h} h`;
  return `ha ${Math.round(h / 24)} d`;
}

export function PainelEstadoMapa({
  uf,
  escopo = "",
  etapas,
  onFechar,
  onAbrirNegocio,
}: {
  uf: string;
  // Escopo de vendedor herdado do Mapa (admin). Vazio = colaborador / Todos.
  escopo?: string;
  etapas: EtapaOpcao[];
  onFechar: () => void;
  onAbrirNegocio: (negocioId: string) => void;
}) {
  const [dados, setDados] = useState<EstadoDetalheResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [aba, setAba] = useState<Aba>("geral");
  const [busca, setBusca] = useState("");
  const [catFiltro, setCatFiltro] = useState(""); // "" = todas
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("recentes");
  const [editando, setEditando] = useState<string | null>(null);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true);
      try {
        const p = new URLSearchParams({ uf });
        for (const [k, v] of paramsEscopo(escopo)) p.set(k, v);
        const r = await fetch(`/api/mapa/estado?${p.toString()}`);
        if (!r.ok) throw new Error();
        setDados(await r.json());
        setErro(false);
      } catch {
        if (!silencioso) setErro(true);
      } finally {
        if (!silencioso) setCarregando(false);
      }
    },
    [uf, escopo],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onFechar]);

  // Aplica um patch a um cliente em TODAS as listas (mantem coerencia entre abas).
  function aplicarNoCliente(
    d: EstadoDetalheResp,
    leadId: string,
    patch: Partial<ClienteMapa>,
  ): EstadoDetalheResp {
    const upd = (arr: ClienteMapa[]) =>
      arr.map((c) => (c.leadId === leadId ? { ...c, ...patch } : c));
    return {
      ...d,
      clientes: upd(d.clientes),
      topCompradores: upd(d.topCompradores),
      recorrentes: upd(d.recorrentes),
      perdidos: upd(d.perdidos),
      pendentes: upd(d.pendentes),
    };
  }

  // Edicao inline otimista com rollback. refetch=true re-sincroniza status/etapa
  // autoritativos (mudanca de etapa pode virar Ganho/Perdido no servidor).
  async function editar(
    cliente: ClienteMapa,
    body: Record<string, unknown>,
    patchLocal: Partial<ClienteMapa>,
    refetch: boolean,
  ) {
    if (!cliente.negocioId) return;
    const snapshot = dados;
    setErroEdicao(null);
    setEditando(cliente.negocioId);
    setDados((d) => (d ? aplicarNoCliente(d, cliente.leadId, patchLocal) : d));
    try {
      const r = await fetch(`/api/negocios/${cliente.negocioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.erro || "nao foi possivel salvar");
      }
      if (refetch) await carregar(true);
    } catch (e) {
      setDados(snapshot); // rollback
      setErroEdicao(
        e instanceof Error ? e.message : "nao foi possivel salvar",
      );
    } finally {
      setEditando(null);
    }
  }

  // Categorias de produto presentes nos clientes deste estado (para os chips).
  const categoriasPresentes = useMemo(() => {
    const s = new Set<string>();
    for (const c of dados?.clientes ?? []) {
      if (c.produtoClassificado) s.add(c.produtoClassificado);
    }
    return [...s];
  }, [dados]);

  const clientesFiltrados = useMemo(() => {
    const q = normalizarTexto(busca.trim());
    let lista = dados?.clientes ?? [];
    if (catFiltro) {
      lista = lista.filter((c) => c.produtoClassificado === catFiltro);
    }
    if (q) {
      lista = lista.filter(
        (c) =>
          normalizarTexto(c.nome).includes(q) ||
          c.telefone.replace(/\D/g, "").includes(q.replace(/\D/g, "")),
      );
    }
    const ord = [...lista];
    if (ordenacao === "valor") {
      ord.sort((a, b) => b.valorAberto - a.valorAberto);
    } else {
      ord.sort((a, b) => {
        const ta = a.ultimoContato ? new Date(a.ultimoContato).getTime() : 0;
        const tb = b.ultimoContato ? new Date(b.ultimoContato).getTime() : 0;
        return tb - ta;
      });
    }
    return ord;
  }, [dados, busca, catFiltro, ordenacao]);

  const titulo = dados ? `${dados.resumo.estado} (${uf})` : `Estado ${uf}`;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fade-in absolute inset-0 bg-black/30" onClick={onFechar} />

      <aside className="drawer-in relative flex h-full w-full max-w-2xl flex-col bg-white shadow-xl">
        {/* Cabecalho */}
        <header className="shrink-0 border-b border-black/5 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-escuro">{titulo}</p>
              <p className="text-xs text-medio/60">
                {dados
                  ? `${dados.resumo.clientes} clientes · ${dados.resumo.negocios.ganhos} vendas`
                  : "carregando..."}
              </p>
            </div>
            <button
              onClick={onFechar}
              title="Fechar"
              className="rounded-lg p-1.5 text-medio transition-colors hover:bg-black/5 hover:text-escuro"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Abas */}
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {ABAS.map((a) => (
              <button
                key={a.chave}
                onClick={() => setAba(a.chave)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  aba === a.chave
                    ? "bg-tiffany text-white"
                    : "text-medio hover:bg-black/5"
                }`}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
        </header>

        {erroEdicao && (
          <div className="shrink-0 bg-amber-50 px-4 py-1.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            {erroEdicao}
          </div>
        )}

        {/* Conteudo */}
        <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">
          {carregando ? (
            <div className="space-y-3 p-4">
              <div className="skeleton h-24 w-full rounded-lg" />
              <div className="skeleton h-40 w-full rounded-lg" />
            </div>
          ) : erro || !dados ? (
            <EstadoErro
              mensagem="Nao foi possivel carregar o estado."
              onRetry={() => void carregar()}
              compacto
            />
          ) : aba === "geral" ? (
            <VisaoGeral dados={dados} />
          ) : aba === "clientes" ? (
            <div className="p-4">
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-medio/50" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou telefone"
                  className="w-full rounded-lg border border-black/10 bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-tiffany"
                />
              </div>

              {/* Filtro rapido por categoria de produto + ordenacao */}
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                {categoriasPresentes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <ChipCategoria
                      rotulo="Todas"
                      ativo={catFiltro === ""}
                      onClick={() => setCatFiltro("")}
                    />
                    {categoriasPresentes.map((cat) => (
                      <ChipCategoria
                        key={cat}
                        rotulo={cat}
                        ativo={catFiltro === cat}
                        onClick={() => setCatFiltro(cat)}
                      />
                    ))}
                  </div>
                )}
                <div className="ml-auto flex items-center gap-1 text-[11px] text-medio/60">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  <button
                    onClick={() => setOrdenacao("recentes")}
                    className={`rounded-md px-1.5 py-0.5 font-medium transition-colors ${
                      ordenacao === "recentes"
                        ? "bg-tiffany text-white"
                        : "hover:bg-black/5"
                    }`}
                  >
                    Recentes
                  </button>
                  <button
                    onClick={() => setOrdenacao("valor")}
                    className={`rounded-md px-1.5 py-0.5 font-medium transition-colors ${
                      ordenacao === "valor"
                        ? "bg-tiffany text-white"
                        : "hover:bg-black/5"
                    }`}
                  >
                    Maior valor
                  </button>
                </div>
              </div>
              <ListaClientes
                clientes={clientesFiltrados}
                vazio={
                  busca || catFiltro
                    ? "Nenhum cliente encontrado. Ajuste a busca ou os filtros."
                    : "Sem clientes neste estado ainda."
                }
                etapas={etapas}
                editando={editando}
                onEditarTemp={(c, t) =>
                  editar(c, { temperatura: t }, { temperatura: t }, false)
                }
                onEditarEtapa={(c, etapaId, nome) =>
                  editar(c, { etapaId }, { etapaId, etapa: nome }, true)
                }
                onAbrirNegocio={onAbrirNegocio}
              />
            </div>
          ) : aba === "compradores" ? (
            <div className="space-y-4 p-4">
              <Secao
                icone={<Trophy className="h-4 w-4 text-tiffany" />}
                titulo="Top compradores"
                subtitulo="Ordenados pelo total ja comprado (negocios ganhos)."
              >
                <ListaClientes
                  clientes={dados.topCompradores}
                  vazio="Nenhuma venda registrada neste estado ainda."
                  destaqueValorComprado
                  etapas={etapas}
                  editando={editando}
                  onEditarTemp={(c, t) =>
                    editar(c, { temperatura: t }, { temperatura: t }, false)
                  }
                  onEditarEtapa={(c, etapaId, nome) =>
                    editar(c, { etapaId }, { etapaId, etapa: nome }, true)
                  }
                  onAbrirNegocio={onAbrirNegocio}
                />
              </Secao>
              <Secao
                icone={<Repeat2 className="h-4 w-4 text-tiffany" />}
                titulo="Recorrentes"
                subtitulo="Clientes com 2 ou mais compras."
              >
                <ListaClientes
                  clientes={dados.recorrentes}
                  vazio="Ainda nao ha clientes recorrentes aqui."
                  destaqueRecorrente
                  etapas={etapas}
                  editando={editando}
                  onEditarTemp={(c, t) =>
                    editar(c, { temperatura: t }, { temperatura: t }, false)
                  }
                  onEditarEtapa={(c, etapaId, nome) =>
                    editar(c, { etapaId }, { etapaId, etapa: nome }, true)
                  }
                  onAbrirNegocio={onAbrirNegocio}
                />
              </Secao>
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <Secao
                titulo="Perdidos"
                subtitulo="Negocios marcados como perdidos (com motivo quando houver)."
              >
                <ListaClientes
                  clientes={dados.perdidos}
                  vazio="Nenhum negocio perdido neste estado."
                  mostrarMotivoPerda
                  etapas={etapas}
                  editando={editando}
                  onEditarTemp={(c, t) =>
                    editar(c, { temperatura: t }, { temperatura: t }, false)
                  }
                  onEditarEtapa={(c, etapaId, nome) =>
                    editar(c, { etapaId }, { etapaId, etapa: nome }, true)
                  }
                  onAbrirNegocio={onAbrirNegocio}
                />
              </Secao>
              <Secao
                titulo="Pendentes / em aberto"
                subtitulo="Negocios abertos ou pendentes, por valor em aberto."
              >
                <ListaClientes
                  clientes={dados.pendentes}
                  vazio="Nenhum negocio em aberto por aqui."
                  etapas={etapas}
                  editando={editando}
                  onEditarTemp={(c, t) =>
                    editar(c, { temperatura: t }, { temperatura: t }, false)
                  }
                  onEditarEtapa={(c, etapaId, nome) =>
                    editar(c, { etapaId }, { etapaId, etapa: nome }, true)
                  }
                  onAbrirNegocio={onAbrirNegocio}
                />
              </Secao>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// ---- Visao geral ----
function VisaoGeral({ dados }: { dados: EstadoDetalheResp }) {
  const r = dados.resumo;
  const produtosComQtd = r.produtosTop.reduce((s, p) => s + p.qtd, 0);
  const naoClass =
    r.produtosTop.find((p) => p.rotulo === "Nao classificado")?.qtd ?? 0;
  // "Domina" = mais da metade dos clientes classificados caiu em Nao classificado.
  const naoClassificadoDomina =
    produtosComQtd > 0 && naoClass / produtosComQtd > 0.5;
  return (
    <div className="space-y-4 p-4">
      <Reveal>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MiniCard rotulo="Clientes" valor={String(r.clientes)} />
          <MiniCard rotulo="Negocios abertos" valor={String(r.negocios.abertos)} />
          <MiniCard rotulo="Vendas (ganhos)" valor={String(r.negocios.ganhos)} />
          <MiniCard rotulo="Perdidos" valor={String(r.negocios.perdidos)} />
          <MiniCard rotulo="Valor em aberto" valor={formatarBRL(r.valorAberto)} />
          <MiniCard rotulo="Faturamento" valor={formatarBRL(r.faturamento)} />
          <MiniCard
            rotulo="Ticket medio"
            valor={r.ticketMedio != null ? formatarBRL(r.ticketMedio) : "—"}
          />
          <MiniCard
            rotulo="Populacao (IBGE)"
            valor={r.populacao != null ? r.populacao.toLocaleString("pt-BR") : "—"}
          />
          <MiniCard
            rotulo="Clientes / 100k hab."
            valor={r.clientesPor100k != null ? r.clientesPor100k.toFixed(2) : "—"}
          />
          <MiniCard
            rotulo="Novos (30 dias)"
            valor={String(r.novosPorMes.ultimos30)}
          />
          <MiniCard
            rotulo="Novos (90 dias)"
            valor={String(r.novosPorMes.ultimos90)}
          />
        </div>
      </Reveal>

      <Reveal delay={60}>
        <div className="rounded-lg border border-black/5 bg-white p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-escuro">
            <ThermometerSun className="h-4 w-4 text-tiffany" />
            Produtos por estado
          </p>
          {produtosComQtd === 0 ? (
            <p className="text-xs text-medio/60">
              Sem produto classificado neste estado — a classificacao depende do
              interesse cadastrado, do anuncio de origem, das etapas ou da origem.
            </p>
          ) : (
            <>
              <BreakdownProdutos dados={r.produtosTop} />
              {naoClassificadoDomina && (
                <p className="mt-1 text-[11px] text-medio/50">
                  Boa parte ficou em &quot;Nao classificado&quot; — a classificacao
                  depende da origem/anuncio; nao inventamos categoria.
                </p>
              )}
            </>
          )}
        </div>
      </Reveal>

      <p className="text-xs text-medio/50">
        Temperatura dos clientes: {r.porTemperatura.quente} quentes ·{" "}
        {r.porTemperatura.morno} mornos · {r.porTemperatura.frio} frios.
      </p>
    </div>
  );
}

function ChipCategoria({
  rotulo,
  ativo,
  onClick,
}: {
  rotulo: string;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={ativo}
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
        ativo
          ? "border-tiffany bg-tiffany text-white"
          : "border-black/10 bg-white text-medio hover:border-tiffany hover:text-tiffany"
      }`}
    >
      {rotulo}
    </button>
  );
}

function MiniCard({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-black/5 bg-white px-3 py-2">
      <p className="text-[11px] text-medio/60">{rotulo}</p>
      <p className="mt-0.5 text-sm font-semibold text-escuro">{valor}</p>
    </div>
  );
}

function Secao({
  titulo,
  subtitulo,
  icone,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  icone?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Reveal>
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-escuro">
          {icone}
          {titulo}
        </p>
        {subtitulo && <p className="mb-2 text-xs text-medio/60">{subtitulo}</p>}
        {children}
      </div>
    </Reveal>
  );
}

// ---- Lista de clientes reutilizavel ----
function ListaClientes({
  clientes,
  vazio,
  etapas,
  editando,
  onEditarTemp,
  onEditarEtapa,
  onAbrirNegocio,
  destaqueValorComprado = false,
  destaqueRecorrente = false,
  mostrarMotivoPerda = false,
}: {
  clientes: ClienteMapa[];
  vazio: string;
  etapas: EtapaOpcao[];
  editando: string | null;
  onEditarTemp: (c: ClienteMapa, t: "QUENTE" | "MORNO" | "FRIO") => void;
  onEditarEtapa: (c: ClienteMapa, etapaId: string, nome: string) => void;
  onAbrirNegocio: (negocioId: string) => void;
  destaqueValorComprado?: boolean;
  destaqueRecorrente?: boolean;
  mostrarMotivoPerda?: boolean;
}) {
  if (clientes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-black/10 py-10 text-center">
        <Users className="h-6 w-6 text-medio/40" />
        <p className="max-w-xs text-xs text-medio/60">{vazio}</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {clientes.map((c) => (
        <li
          key={c.leadId}
          className="rounded-lg border border-black/5 bg-white p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-escuro">
                  {c.nome}
                </span>
                {destaqueRecorrente && (
                  <span className="rounded-full bg-tiffany/10 px-1.5 py-0.5 text-[10px] font-semibold text-tiffany">
                    {c.totalCompras}x
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-medio/60">{c.telefone}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-medio/80">
                  {c.produtoClassificado}
                </span>
                {c.status === "PENDENTE" ? (
                  <BadgePendente />
                ) : c.status ? (
                  <BadgeStatusNegocio status={c.status} />
                ) : null}
                {c.cidade && (
                  <span className="text-[11px] text-medio/50">{c.cidade}</span>
                )}
                {destaqueValorComprado ? (
                  <span className="text-xs font-semibold text-sucesso">
                    {formatarBRL(c.valorComprado)} comprado
                  </span>
                ) : c.valorAberto > 0 ? (
                  <span className="text-xs font-medium text-tiffany">
                    {formatarBRL(c.valorAberto)} em aberto
                  </span>
                ) : null}
                <span className="text-[11px] text-medio/50">
                  {desde(c.ultimoContato)}
                </span>
              </div>
              {mostrarMotivoPerda && c.motivoPerda && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                  Motivo: {c.motivoPerda}
                </p>
              )}
            </div>
          </div>

          {/* Controles: edicao inline + links */}
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-black/5 pt-2">
            {c.negocioId ? (
              <>
                <label className="flex items-center gap-1 text-[11px] text-medio/60">
                  <BadgeTemperatura
                    temperatura={c.temperatura ?? "MORNO"}
                    variante="ponto"
                  />
                  <select
                    value={c.temperatura ?? "MORNO"}
                    disabled={editando === c.negocioId}
                    onChange={(e) =>
                      onEditarTemp(
                        c,
                        e.target.value as "QUENTE" | "MORNO" | "FRIO",
                      )
                    }
                    className="rounded-md border border-black/10 bg-white px-1.5 py-1 text-xs outline-none focus:border-tiffany disabled:opacity-50"
                  >
                    {TEMPERATURAS.map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0) + t.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>

                <select
                  value={c.etapaId ?? ""}
                  disabled={editando === c.negocioId}
                  onChange={(e) => {
                    const et = etapas.find((x) => x.id === e.target.value);
                    if (et) onEditarEtapa(c, et.id, et.nome);
                  }}
                  className="rounded-md border border-black/10 bg-white px-1.5 py-1 text-xs outline-none focus:border-tiffany disabled:opacity-50"
                  title="Mover de etapa (ganho/perdido pede dados no painel do negocio)"
                >
                  <option value="" disabled>
                    {c.etapa ?? "Etapa"}
                  </option>
                  {etapas.map((et) => (
                    <option key={et.id} value={et.id}>
                      {et.nome}
                    </option>
                  ))}
                </select>

                {editando === c.negocioId && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-medio/50" />
                )}

                <button
                  onClick={() => onAbrirNegocio(c.negocioId as string)}
                  className="flex items-center gap-1 rounded-md border border-black/10 px-2 py-1 text-[11px] font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany"
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  Negocio
                </button>
              </>
            ) : (
              <span className="text-[11px] text-medio/50">
                Sem negocio para editar.
              </span>
            )}

            {c.conversaId && (
              <Link
                href="/inbox"
                className="flex items-center gap-1 rounded-md border border-black/10 px-2 py-1 text-[11px] font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany"
                title="Abrir o Inbox para atender"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Inbox
                <ExternalLink className="h-3 w-3 opacity-60" />
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
