"use client";

// Drawer lateral com os clientes de um estado (clique no mapa). Busca client-side
// por nome/telefone; cada item abre o negocio no painel do Kanban (reuso) quando
// ha negocio. Estilo Sixxis (overlay + slide), compacto.
import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Search, ChevronRight, Loader2, Users } from "lucide-react";
import { BadgeTemperatura } from "@/components/BadgeTemperatura";
import { BadgeStatusNegocio, BadgePendente } from "@/components/badges";
import { EstadoErro } from "@/components/ui/Estado";
import { formatarBRL, normalizarTexto } from "@/lib/format";
import { paramsEscopo } from "@/lib/escopo";
import { ClimaEstadoDetalhe } from "./ClimaEstadoDetalhe";
import type { ClienteEstado, ClientesEstadoResp, ClimaUF } from "./tipos";

function desde(iso: string | null): string {
  if (!iso) return "sem contato";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `ha ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `ha ${h} h`;
  return `ha ${Math.round(h / 24)} d`;
}

export function PainelClientesEstado({
  uf,
  escopo = "",
  onFechar,
  onAbrirNegocio,
  climatizador = false,
  resumoClima,
}: {
  uf: string;
  // Escopo de vendedor herdado do Clima (admin). Vazio = colaborador / Todos.
  escopo?: string;
  onFechar: () => void;
  onAbrirNegocio: (negocioId: string) => void;
  // No modo Climatizador o drawer ganha o detalhe de clima (curva + historico).
  climatizador?: boolean;
  resumoClima?: ClimaUF | null;
}) {
  const [dados, setDados] = useState<ClientesEstadoResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const p = new URLSearchParams({ uf });
      for (const [k, v] of paramsEscopo(escopo)) p.set(k, v);
      const r = await fetch(`/api/inteligencia/clientes?${p.toString()}`);
      if (!r.ok) throw new Error();
      setDados(await r.json());
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [uf, escopo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Fecha com ESC.
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onFechar]);

  const filtrados = useMemo(() => {
    const q = normalizarTexto(busca.trim());
    const lista = dados?.clientes ?? [];
    if (!q) return lista;
    return lista.filter(
      (c) =>
        normalizarTexto(c.nome).includes(q) ||
        c.telefone.replace(/\D/g, "").includes(q.replace(/\D/g, "")),
    );
  }, [dados, busca]);

  const titulo = dados
    ? `Clientes de ${dados.estado} (${uf})`
    : `Clientes de ${uf}`;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fade-in absolute inset-0 bg-black/30" onClick={onFechar} />

      <aside className="drawer-in relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        {/* Cabecalho */}
        <header className="shrink-0 border-b border-black/5 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-escuro">{titulo}</p>
              <p className="text-xs text-medio/60">
                {dados ? `${dados.total} clientes` : "carregando..."}
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

          {/* Busca */}
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-medio/50" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou telefone"
              className="w-full rounded-lg border border-black/10 bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-tiffany"
            />
          </div>
        </header>

        {/* Detalhe de clima (modo Climatizador) + lista de clientes */}
        <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">
          {climatizador && <ClimaEstadoDetalhe uf={uf} resumo={resumoClima} />}
          {carregando ? (
            <div className="flex h-40 items-center justify-center text-medio/50">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : erro ? (
            <EstadoErro
              mensagem="Nao foi possivel carregar os clientes."
              onRetry={() => void carregar()}
              compacto
            />
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tiffany/10">
                <Users className="h-6 w-6 text-tiffany" />
              </div>
              <p className="text-sm font-medium text-escuro">
                {busca ? "Nenhum cliente encontrado" : "Sem clientes neste estado"}
              </p>
              {busca && (
                <p className="text-xs text-medio/60">Ajuste a busca.</p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-black/5">
              {filtrados.map((c) => (
                <ItemCliente key={c.leadId} c={c} onAbrir={onAbrirNegocio} />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function ItemCliente({
  c,
  onAbrir,
}: {
  c: ClienteEstado;
  onAbrir: (negocioId: string) => void;
}) {
  const clicavel = !!c.negocioId;
  const conteudo = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-escuro">
            {c.nome}
          </span>
          {c.temperatura && (
            <BadgeTemperatura temperatura={c.temperatura} variante="ponto" />
          )}
        </div>
        <p className="truncate text-xs text-medio/60">{c.telefone}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {c.status === "PENDENTE" ? (
            <BadgePendente />
          ) : c.status ? (
            <BadgeStatusNegocio status={c.status} />
          ) : null}
          {c.valorAberto > 0 && (
            <span className="text-xs font-medium text-tiffany">
              {formatarBRL(c.valorAberto)}
            </span>
          )}
          <span className="text-[11px] text-medio/50">{desde(c.ultimoContato)}</span>
        </div>
      </div>
      {clicavel && <ChevronRight className="h-4 w-4 shrink-0 text-medio/40" />}
    </>
  );

  if (!clicavel) {
    return <li className="flex items-center gap-2 px-4 py-3">{conteudo}</li>;
  }
  return (
    <li>
      <button
        onClick={() => onAbrir(c.negocioId as string)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-black/5"
      >
        {conteudo}
      </button>
    </li>
  );
}
