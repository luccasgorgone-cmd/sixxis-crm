"use client";

// Drawer largo do Mapa: detalhe de um estado com abas (Visao geral, Clientes,
// Compradores, Perdidos & Pendentes). Reusa o padrao do PainelClientesEstado
// (overlay + slide), mas com dados do /api/mapa/estado. Edicao inline de
// temperatura e etapa/status via PATCH /api/negocios/[id] (otimista + rollback).
import { useCallback, useEffect, useState } from "react";
import { X, Trophy, Repeat2, ThermometerSun, Store } from "lucide-react";
import { EstadoErro } from "@/components/ui/Estado";
import { Reveal } from "@/components/inteligencia/Reveal";
import { formatarBRL } from "@/lib/format";
import { paramsEscopo } from "@/lib/escopo";
import { BreakdownProdutos } from "./BreakdownProdutos";
import {
  ListaClientesEstado,
  ListaClientesItens,
  type EtapaOpcao,
} from "./ListaClientesEstado";
import type { ClienteMapa, EstadoDetalheResp } from "./tipos";

const ABAS = [
  { chave: "geral", rotulo: "Visao geral" },
  { chave: "clientes", rotulo: "Clientes" },
  { chave: "compradores", rotulo: "Compradores" },
  { chave: "perdidos", rotulo: "Perdidos & Pendentes" },
] as const;
type Aba = (typeof ABAS)[number]["chave"];

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
              <ListaClientesEstado
                clientes={dados.clientes}
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
                <ListaClientesItens
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
                <ListaClientesItens
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
                <ListaClientesItens
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
                <ListaClientesItens
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

      <Reveal delay={90}>
        <div className="rounded-lg border border-black/5 bg-white p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-escuro">
            <Store className="h-4 w-4 text-tiffany" />
            Segmento (Varejo x Atacado)
          </p>
          <BreakdownSegmento seg={r.porSegmento} />
        </div>
      </Reveal>

      <p className="text-xs text-medio/50">
        Temperatura dos clientes: {r.porTemperatura.quente} quentes ·{" "}
        {r.porTemperatura.morno} mornos · {r.porTemperatura.frio} frios.
      </p>
    </div>
  );
}

// Breakdown Varejo x Atacado (barras horizontais compactas, cores Sixxis).
// Inclui "Nao definido" quando houver, com rotulo honesto.
function BreakdownSegmento({
  seg,
}: {
  seg: { varejo: number; atacado: number; naoDefinido: number };
}) {
  const total = seg.varejo + seg.atacado + seg.naoDefinido;
  if (total === 0) {
    return (
      <p className="py-2 text-center text-xs text-medio/50">
        Sem clientes neste estado.
      </p>
    );
  }
  const linhas: { rotulo: string; qtd: number; cor: string }[] = [
    { rotulo: "Varejo", qtd: seg.varejo, cor: "#3cbfb3" },
    { rotulo: "Atacado", qtd: seg.atacado, cor: "#0f2e2b" },
    { rotulo: "Nao definido", qtd: seg.naoDefinido, cor: "#94a3b8" },
  ].filter((l) => l.qtd > 0);
  const max = Math.max(...linhas.map((l) => l.qtd));
  return (
    <ul className="space-y-1.5">
      {linhas.map((l) => (
        <li key={l.rotulo} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-xs text-medio/80">
            {l.rotulo}
          </span>
          <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-black/5">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${max ? (l.qtd / max) * 100 : 0}%`,
                backgroundColor: l.cor,
              }}
            />
          </span>
          <span className="w-8 shrink-0 text-right text-xs font-semibold text-escuro">
            {l.qtd}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MiniCard({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-black/5 bg-white px-3 py-2">
      <p className="truncate text-[11px] text-medio/60" title={rotulo}>{rotulo}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-escuro" title={valor}>{valor}</p>
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
