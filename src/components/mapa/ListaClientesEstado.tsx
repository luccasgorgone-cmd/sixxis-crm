"use client";

// Lista RICA de clientes de um estado, reusada pelo drawer do Mapa
// (PainelEstadoMapa) e pela aba Clima (PainelClientesEstado). Filtros combinaveis
// (busca, categoria, segmento, com/sem rastreio) + ordenacao (compradores /
// recentes / maior valor) + "Ver todos". Cada item mostra badges (segmento,
// temperatura so em venda, garantia so em pos-venda, rastreio, valor comprado).
//
// Edicao inline (temperatura/etapa) e OPCIONAL: quando as callbacks vem (Mapa),
// os selects aparecem; sem elas (Clima), a lista fica somente leitura. Assim nao
// duplicamos o renderizador de item entre as duas telas.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Users,
  ExternalLink,
  Briefcase,
  MessageSquare,
  ArrowUpDown,
  ShieldCheck,
  ShieldOff,
  Truck,
  Loader2,
} from "lucide-react";
import { BadgeTemperatura } from "@/components/BadgeTemperatura";
import { BadgeStatusNegocio, BadgePendente } from "@/components/badges";
import { BadgeSegmento } from "@/components/cliente/BlocoCliente";
import { formatarBRL, normalizarTexto } from "@/lib/format";
import type { ClienteMapa } from "./tipos";

export type EtapaOpcao = { id: string; nome: string; tipo?: string };
type Ordenacao = "compradores" | "recentes" | "valor";
const TEMPERATURAS: ("QUENTE" | "MORNO" | "FRIO")[] = ["QUENTE", "MORNO", "FRIO"];

// "ha X min/h/d" desde o ultimo contato.
export function desde(iso: string | null): string {
  if (!iso) return "sem contato";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `ha ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `ha ${h} h`;
  return `ha ${Math.round(h / 24)} d`;
}

// Chip de garantia (pos-venda) com cor: verde (com), ambar (sem), cinza (definir).
export function GarantiaChip({ garantia }: { garantia: boolean | null }) {
  if (garantia === true) {
    return (
      <span className="flex items-center gap-1 rounded-md border border-green-500 bg-green-50 px-1.5 py-1 text-[11px] font-medium text-green-700">
        <ShieldCheck className="h-3.5 w-3.5" /> Com garantia
      </span>
    );
  }
  if (garantia === false) {
    return (
      <span className="flex items-center gap-1 rounded-md border border-amber-500 bg-amber-50 px-1.5 py-1 text-[11px] font-medium text-amber-700">
        <ShieldOff className="h-3.5 w-3.5" /> Sem garantia
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-md border border-black/10 bg-white px-1.5 py-1 text-[11px] font-medium text-medio/60">
      <ShieldOff className="h-3.5 w-3.5" /> Garantia a definir
    </span>
  );
}

export function ChipCategoria({
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

// ---- Renderizador de itens (reutilizavel entre abas/telas) ----
export function ListaClientesItens({
  clientes,
  vazio,
  onAbrirNegocio,
  etapas,
  editando = null,
  onEditarTemp,
  onEditarEtapa,
  destaqueValorComprado = false,
  destaqueRecorrente = false,
  mostrarMotivoPerda = false,
}: {
  clientes: ClienteMapa[];
  vazio: string;
  onAbrirNegocio: (negocioId: string) => void;
  // Edicao inline (opcional): so aparece quando etapas + callbacks vem juntos.
  etapas?: EtapaOpcao[];
  editando?: string | null;
  onEditarTemp?: (c: ClienteMapa, t: "QUENTE" | "MORNO" | "FRIO") => void;
  onEditarEtapa?: (c: ClienteMapa, etapaId: string, nome: string) => void;
  destaqueValorComprado?: boolean;
  destaqueRecorrente?: boolean;
  mostrarMotivoPerda?: boolean;
}) {
  const podeEditar = Boolean(etapas && onEditarTemp && onEditarEtapa);
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
        <li key={c.leadId} className="rounded-lg border border-black/5 bg-white p-3">
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
                {c.segmento && <BadgeSegmento segmento={c.segmento} />}
                {c.temRastreio && (
                  <span
                    title="Tem codigo de rastreio"
                    className="flex items-center gap-0.5 rounded-full bg-tiffany/10 px-1.5 py-0.5 text-[10px] font-medium text-tiffany"
                  >
                    <Truck className="h-2.5 w-2.5" /> Rastreio
                  </span>
                )}
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

          {/* Controles: edicao inline (Mapa) OU somente leitura (Clima) + links */}
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-black/5 pt-2">
            {c.negocioId ? (
              <>
                {/* Temperatura so na VENDA; pos-venda mostra a garantia (cor). */}
                {c.finalidade === "POS_VENDA" ? (
                  <GarantiaChip garantia={c.garantia} />
                ) : podeEditar ? (
                  <label className="flex items-center gap-1 text-[11px] text-medio/60">
                    <BadgeTemperatura
                      temperatura={c.temperatura ?? "MORNO"}
                      variante="ponto"
                    />
                    <select
                      value={c.temperatura ?? "MORNO"}
                      disabled={editando === c.negocioId}
                      onChange={(e) =>
                        onEditarTemp?.(
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
                ) : (
                  <BadgeTemperatura
                    temperatura={c.temperatura ?? "MORNO"}
                    variante="ponto"
                  />
                )}

                {podeEditar && (
                  <select
                    value={c.etapaId ?? ""}
                    disabled={editando === c.negocioId}
                    onChange={(e) => {
                      const et = etapas!.find((x) => x.id === e.target.value);
                      if (et) onEditarEtapa?.(c, et.id, et.nome);
                    }}
                    className="rounded-md border border-black/10 bg-white px-1.5 py-1 text-xs outline-none focus:border-tiffany disabled:opacity-50"
                    title="Mover de etapa (ganho/perdido pede dados no painel do negocio)"
                  >
                    <option value="" disabled>
                      {c.etapa ?? "Etapa"}
                    </option>
                    {etapas!.map((et) => (
                      <option key={et.id} value={et.id}>
                        {et.nome}
                      </option>
                    ))}
                  </select>
                )}

                {podeEditar && editando === c.negocioId && (
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
                Sem negocio associado.
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

// ---- Wrapper com filtros + ordenacao + "Ver todos" ----
export function ListaClientesEstado({
  clientes,
  onAbrirNegocio,
  etapas,
  editando,
  onEditarTemp,
  onEditarEtapa,
  limiteInicial = 20,
}: {
  clientes: ClienteMapa[];
  onAbrirNegocio: (negocioId: string) => void;
  etapas?: EtapaOpcao[];
  editando?: string | null;
  onEditarTemp?: (c: ClienteMapa, t: "QUENTE" | "MORNO" | "FRIO") => void;
  onEditarEtapa?: (c: ClienteMapa, etapaId: string, nome: string) => void;
  limiteInicial?: number;
}) {
  const [busca, setBusca] = useState("");
  const [catFiltro, setCatFiltro] = useState("");
  const [segFiltro, setSegFiltro] = useState<"" | "VAREJO" | "ATACADO">("");
  const [rastreioFiltro, setRastreioFiltro] = useState<"" | "com" | "sem">("");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("compradores");
  const [mostrarTodos, setMostrarTodos] = useState(false);

  // Fallback do dono: sem compradores, o padrao util e "recentes" (por presenca).
  const temCompradores = useMemo(
    () => clientes.some((c) => c.valorComprado > 0),
    [clientes],
  );
  useEffect(() => {
    setOrdenacao(temCompradores ? "compradores" : "recentes");
  }, [temCompradores]);

  const categoriasPresentes = useMemo(() => {
    const s = new Set<string>();
    for (const c of clientes) if (c.produtoClassificado) s.add(c.produtoClassificado);
    return [...s];
  }, [clientes]);

  const clientesFiltrados = useMemo(() => {
    const q = normalizarTexto(busca.trim());
    let lista = clientes;
    if (catFiltro) lista = lista.filter((c) => c.produtoClassificado === catFiltro);
    if (segFiltro) lista = lista.filter((c) => c.segmento === segFiltro);
    if (rastreioFiltro === "com") lista = lista.filter((c) => c.temRastreio);
    else if (rastreioFiltro === "sem") lista = lista.filter((c) => !c.temRastreio);
    if (q) {
      lista = lista.filter(
        (c) =>
          normalizarTexto(c.nome).includes(q) ||
          c.telefone.replace(/\D/g, "").includes(q.replace(/\D/g, "")),
      );
    }
    const ord = [...lista];
    if (ordenacao === "compradores") {
      ord.sort(
        (a, b) =>
          b.valorComprado - a.valorComprado || b.totalCompras - a.totalCompras,
      );
    } else if (ordenacao === "valor") {
      ord.sort((a, b) => b.valorAberto - a.valorAberto);
    } else {
      ord.sort((a, b) => {
        const ta = a.ultimoContato ? new Date(a.ultimoContato).getTime() : 0;
        const tb = b.ultimoContato ? new Date(b.ultimoContato).getTime() : 0;
        return tb - ta;
      });
    }
    return ord;
  }, [clientes, busca, catFiltro, segFiltro, rastreioFiltro, ordenacao]);

  useEffect(() => {
    setMostrarTodos(false);
  }, [busca, catFiltro, segFiltro, rastreioFiltro, ordenacao]);

  const botao = (rot: string, val: Ordenacao) => (
    <button
      onClick={() => setOrdenacao(val)}
      className={`rounded-md px-1.5 py-0.5 font-medium transition-colors ${
        ordenacao === val ? "bg-tiffany text-white" : "hover:bg-black/5"
      }`}
    >
      {rot}
    </button>
  );

  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-medio/50" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone"
          className="w-full rounded-lg border border-black/10 bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-tiffany"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {categoriasPresentes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <ChipCategoria rotulo="Todas" ativo={catFiltro === ""} onClick={() => setCatFiltro("")} />
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
        <div className="flex flex-wrap items-center gap-1">
          <ChipCategoria rotulo="Todos segmentos" ativo={segFiltro === ""} onClick={() => setSegFiltro("")} />
          <ChipCategoria rotulo="Varejo" ativo={segFiltro === "VAREJO"} onClick={() => setSegFiltro("VAREJO")} />
          <ChipCategoria rotulo="Atacado" ativo={segFiltro === "ATACADO"} onClick={() => setSegFiltro("ATACADO")} />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <ChipCategoria rotulo="Rastreio: todos" ativo={rastreioFiltro === ""} onClick={() => setRastreioFiltro("")} />
          <ChipCategoria rotulo="Com rastreio" ativo={rastreioFiltro === "com"} onClick={() => setRastreioFiltro("com")} />
          <ChipCategoria rotulo="Sem rastreio" ativo={rastreioFiltro === "sem"} onClick={() => setRastreioFiltro("sem")} />
        </div>
        <div className="ml-auto flex items-center gap-1 text-[11px] text-medio/60">
          <ArrowUpDown className="h-3.5 w-3.5" />
          {botao("Compradores", "compradores")}
          {botao("Recentes", "recentes")}
          {botao("Maior valor", "valor")}
        </div>
      </div>

      <ListaClientesItens
        clientes={
          mostrarTodos
            ? clientesFiltrados
            : clientesFiltrados.slice(0, limiteInicial)
        }
        vazio={
          busca || catFiltro || segFiltro || rastreioFiltro
            ? "Nenhum cliente encontrado. Ajuste a busca ou os filtros."
            : "Sem clientes neste estado ainda."
        }
        destaqueValorComprado={ordenacao === "compradores" && temCompradores}
        etapas={etapas}
        editando={editando}
        onEditarTemp={onEditarTemp}
        onEditarEtapa={onEditarEtapa}
        onAbrirNegocio={onAbrirNegocio}
      />
      {clientesFiltrados.length > limiteInicial && (
        <button
          onClick={() => setMostrarTodos((v) => !v)}
          className="mt-3 w-full rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany"
        >
          {mostrarTodos ? "Ver menos" : `Ver todos (${clientesFiltrados.length})`}
        </button>
      )}
    </div>
  );
}
