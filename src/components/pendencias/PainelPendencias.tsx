"use client";

// Painel de PENDENCIAS (Fatia 3.17): resumo dos negocios atualmente pendentes no
// escopo do usuario (admin ve tudo e pode filtrar por responsavel; colaborador ve
// os seus). Cards de resumo + quebra por motivo + por responsavel (clicavel p/
// filtrar, admin) + por tempo + lista clicavel (-> /inbox?lead=). Filtros: periodo,
// motivo, responsavel. Tudo agregado no servidor (/api/pendencias). ~383px ok.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PauseCircle, Clock, Users, Loader2, ChevronRight, Filter, X } from "lucide-react";
import { MOTIVOS_PENDENCIA } from "@/lib/motivosPendencia";
import { formatarTelefoneCurto, tempoDesde } from "@/lib/format";
import {
  FiltroPeriodoEntrada,
  PERIODO_TODOS,
  paramsPeriodo,
  type PeriodoEntrada,
} from "@/components/ui/FiltroPeriodoEntrada";

type Motivo = { code: string; label: string; quantidade: number };
type Usuario = {
  agenteId: string | null;
  nome: string;
  quantidade: number;
  topMotivo: { code: string; label: string; quantidade: number } | null;
};
type Faixa = { faixa: string; label: string; quantidade: number };
type NegocioPend = {
  negocioId: string;
  leadId: string;
  clienteNome: string;
  telefone: string;
  finalidade: "VENDA" | "POS_VENDA";
  motivoCode: string | null;
  motivoLabel: string | null;
  observacao: string | null;
  donoNome: string;
  pendenteDesde: string | null;
};
type Resposta = {
  totalClientes: number;
  totalNegocios: number;
  porMotivo: Motivo[];
  porUsuario: Usuario[];
  porTempo: Faixa[];
  negocios: NegocioPend[];
  ehAdmin: boolean;
};

export function PainelPendencias({ ehAdmin }: { ehAdmin: boolean }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const [periodo, setPeriodo] = useState<PeriodoEntrada>(PERIODO_TODOS);
  const [motivo, setMotivo] = useState<string>(""); // code ou ""
  const [agenteId, setAgenteId] = useState<string>(""); // filtro admin por responsavel

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const p = new URLSearchParams();
      if (motivo) p.set("motivo", motivo);
      if (ehAdmin && agenteId) p.set("agenteId", agenteId);
      for (const [k, v] of Object.entries(paramsPeriodo(periodo))) p.set(k, v);
      const qs = p.toString();
      const r = await fetch(`/api/pendencias${qs ? `?${qs}` : ""}`);
      if (!r.ok) throw new Error();
      setDados((await r.json()) as Resposta);
      setErro(false);
    } catch {
      setErro(true);
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [motivo, agenteId, periodo, ehAdmin]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const maxMotivo = useMemo(
    () => Math.max(1, ...(dados?.porMotivo ?? []).map((m) => m.quantidade)),
    [dados],
  );
  const temFiltro = !!motivo || !!agenteId || !!periodo.periodo;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PauseCircle className="h-5 w-5 text-tiffany" />
          <h1 className="text-lg font-semibold text-escuro">Pendências</h1>
          {carregando && <Loader2 className="h-4 w-4 animate-spin text-tiffany" />}
        </div>
        <FiltroPeriodoEntrada
          valor={periodo}
          onChange={setPeriodo}
          contador={dados?.totalNegocios ?? 0}
        />
      </div>

      {/* Chips de motivo */}
      <div className="scroll-fino flex gap-1.5 overflow-x-auto pb-1">
        <ChipFiltro ativo={!motivo} onClick={() => setMotivo("")}>
          Todos os motivos
        </ChipFiltro>
        {MOTIVOS_PENDENCIA.map((m) => (
          <ChipFiltro key={m.code} ativo={motivo === m.code} onClick={() => setMotivo(m.code)}>
            {m.label}
          </ChipFiltro>
        ))}
      </div>

      {(motivo || agenteId) && (
        <button
          onClick={() => {
            setMotivo("");
            setAgenteId("");
          }}
          className="flex items-center gap-1 text-xs font-medium text-medio hover:text-tiffany"
        >
          <X className="h-3.5 w-3.5" /> Limpar filtros
        </button>
      )}

      {erro ? (
        <div className="rounded-xl border border-dashed border-black/10 bg-white p-6 text-center">
          <p className="text-sm text-medio/70">Não foi possível carregar as pendências.</p>
          <button
            onClick={() => void carregar()}
            className="mt-2 rounded-lg border border-black/10 px-3 py-1 text-xs font-medium text-medio hover:border-tiffany hover:text-tiffany"
          >
            Tentar de novo
          </button>
        </div>
      ) : !dados ? (
        <div className="skeleton h-40 w-full rounded-xl" />
      ) : (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card
              icone={<Users className="h-4 w-4 text-tiffany" />}
              rotulo="Clientes pendentes"
              valor={dados.totalClientes}
            />
            <Card
              icone={<PauseCircle className="h-4 w-4 text-tiffany" />}
              rotulo="Negócios pendentes"
              valor={dados.totalNegocios}
            />
            <Card
              icone={<Filter className="h-4 w-4 text-tiffany" />}
              rotulo="Motivo mais comum"
              valorTexto={dados.porMotivo[0]?.label ?? "—"}
            />
          </div>

          {/* Por motivo (barras) + Por tempo */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-black/5 bg-white p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-medio/50">
                Por motivo
              </h2>
              {dados.porMotivo.length === 0 ? (
                <p className="text-xs text-medio/50">Nenhuma pendência.</p>
              ) : (
                <ul className="space-y-2">
                  {dados.porMotivo.map((m) => (
                    <li key={m.code}>
                      <button
                        onClick={() => setMotivo(motivo === m.code ? "" : m.code)}
                        className="flex w-full items-center gap-2 text-left"
                      >
                        <span className="w-40 shrink-0 truncate text-xs text-escuro">{m.label}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                          <span
                            className="block h-full rounded-full bg-tiffany"
                            style={{ width: `${(m.quantidade / maxMotivo) * 100}%` }}
                          />
                        </span>
                        <span className="w-6 shrink-0 text-right text-xs font-semibold text-escuro">
                          {m.quantidade}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-black/5 bg-white p-4">
              <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-medio/50">
                <Clock className="h-3.5 w-3.5" /> Há quanto tempo
              </h2>
              <div className="grid grid-cols-4 gap-2">
                {dados.porTempo.map((f) => (
                  <div key={f.faixa} className="rounded-lg border border-black/5 bg-fundo p-2 text-center">
                    <p className="text-lg font-bold text-escuro">{f.quantidade}</p>
                    <p className="text-[10px] leading-tight text-medio/60">{f.label}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Por responsavel */}
          <section className="rounded-xl border border-black/5 bg-white p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-medio/50">
              Por responsável
            </h2>
            {dados.porUsuario.length === 0 ? (
              <p className="text-xs text-medio/50">Nenhuma pendência.</p>
            ) : (
              <ul className="divide-y divide-black/5">
                {dados.porUsuario.map((u) => {
                  const key = u.agenteId ?? "sem-dono";
                  const clicavel = ehAdmin && !!u.agenteId;
                  const ativo = ehAdmin && agenteId === u.agenteId;
                  return (
                    <li key={key}>
                      <button
                        disabled={!clicavel}
                        onClick={() => setAgenteId(ativo ? "" : (u.agenteId ?? ""))}
                        className={`flex w-full items-center gap-3 py-2 text-left ${
                          clicavel ? "hover:bg-black/[0.02]" : "cursor-default"
                        } ${ativo ? "bg-tiffany/5" : ""}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-escuro">{u.nome}</span>
                          {u.topMotivo && (
                            <span className="block truncate text-xs text-medio/60">
                              Mais comum: {u.topMotivo.label} ({u.topMotivo.quantidade})
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 rounded-full bg-tiffany/10 px-2.5 py-0.5 text-xs font-semibold text-tiffany">
                          {u.quantidade}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Lista de negocios pendentes (clicavel) */}
          <section className="rounded-xl border border-black/5 bg-white p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-medio/50">
              Negócios pendentes{temFiltro ? " (filtrados)" : ""}
            </h2>
            {dados.negocios.length === 0 ? (
              <p className="text-xs text-medio/50">Nenhum negócio pendente no filtro atual.</p>
            ) : (
              <ul className="space-y-1.5">
                {dados.negocios.map((n) => (
                  <li key={n.negocioId}>
                    <Link
                      href={`/inbox?lead=${n.leadId}`}
                      className="flex items-center gap-2 rounded-lg border border-black/5 bg-fundo px-3 py-2 transition-colors hover:border-tiffany/40 hover:bg-tiffany/[0.03]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-escuro">
                          {n.clienteNome}
                          <span className="ml-1.5 text-[11px] font-normal text-medio/50">
                            {formatarTelefoneCurto(n.telefone)}
                          </span>
                        </p>
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-medio/60">
                          <span className="font-medium text-tiffany">
                            {n.motivoLabel ?? "Sem motivo"}
                          </span>
                          {n.observacao && <span className="truncate">· {n.observacao}</span>}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-medio/60">{n.donoNome}</p>
                        {n.pendenteDesde && (
                          <p className="text-[11px] text-medio/40">{tempoDesde(n.pendenteDesde)}</p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-medio/30" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ChipFiltro({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        ativo ? "bg-tiffany text-white" : "bg-fundo text-medio hover:bg-black/5"
      }`}
    >
      {children}
    </button>
  );
}

function Card({
  icone,
  rotulo,
  valor,
  valorTexto,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor?: number;
  valorTexto?: string;
}) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-medio/50">
        {icone}
        <span className="truncate">{rotulo}</span>
      </div>
      {valor !== undefined ? (
        <p className="text-2xl font-bold text-escuro">{valor}</p>
      ) : (
        <p className="truncate text-sm font-semibold text-escuro">{valorTexto}</p>
      )}
    </div>
  );
}
