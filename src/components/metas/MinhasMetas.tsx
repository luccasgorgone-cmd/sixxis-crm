"use client";

// Tela "Minhas metas" do colaborador: cards com donut de progresso, numero
// grande, ritmo colorido, dias restantes, ranking e celebracao ao bater a meta.
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Target,
  Trophy,
  PartyPopper,
  CalendarClock,
  TrendingUp,
  Users,
  Plus,
  Pencil,
  Trash2,
  UserCog,
  Shield,
  ChevronRight,
} from "lucide-react";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";
import { corFinalidade } from "@/components/BadgeFinalidade";
import { Donut } from "./Donut";
import { FormMetaColaborador } from "./FormMetaColaborador";
import {
  type Meta,
  ROTULO_METRICA,
  ROTULO_PERIODO,
  RITMO_INFO,
  corRitmoHex,
  formatarValor,
  pctExibido,
} from "./tipos";

type Resposta = { minhas: Meta[]; equipe: Meta[] };

export function MinhasMetas() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [form, setForm] = useState<{ aberta: boolean; meta: Meta | null }>({
    aberta: false,
    meta: null,
  });
  const toast = useToast();

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/metas");
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
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function remover(id: string) {
    const r = await fetch(`/api/metas/${id}`, { method: "DELETE" });
    if (r.ok) {
      toast.sucesso("Meta excluida.");
      await carregar();
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel excluir.");
    }
  }

  const minhas = dados?.minhas ?? [];
  const equipe = dados?.equipe ?? [];
  const batidas = [...minhas, ...equipe].filter((m) => m.progresso.atingida);
  const vazio = !carregando && minhas.length === 0 && equipe.length === 0;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-escuro">Minhas metas</h2>
          <p className="text-sm text-medio/60">
            Acompanhe seu progresso, ritmo e posicao na equipe
          </p>
        </div>
        <button
          onClick={() => setForm({ aberta: true, meta: null })}
          className="flex items-center gap-2 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro"
        >
          <Plus className="h-4 w-4" /> Nova meta
        </button>
      </div>

      {batidas.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-gradient-to-r from-green-50 to-tiffany/5 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-600">
            <PartyPopper className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-escuro">
              {batidas.length === 1
                ? "Voce bateu 1 meta!"
                : `Voce bateu ${batidas.length} metas!`}
            </p>
            <p className="text-xs text-medio/70">
              Mandou muito bem. Continue assim ate o fim do periodo.
            </p>
          </div>
        </div>
      )}

      {carregando ? (
        <GradeSkeleton />
      ) : erro ? (
        <EstadoErro
          mensagem="Nao foi possivel carregar suas metas."
          onRetry={() => void carregar()}
        />
      ) : vazio ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/10 bg-white py-16 text-center">
          <Target className="h-8 w-8 text-medio/30" />
          <p className="text-sm font-medium text-escuro">Nenhuma meta ativa</p>
          <p className="text-xs text-medio/60">
            Crie uma meta para voce ou aguarde as definidas pela administracao.
          </p>
          <button
            onClick={() => setForm({ aberta: true, meta: null })}
            className="mt-2 flex items-center gap-2 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro"
          >
            <Plus className="h-4 w-4" /> Nova meta
          </button>
        </div>
      ) : (
        <>
          {minhas.length > 0 && (
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
                <Target className="h-4 w-4 text-tiffany" /> Suas metas
              </h3>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {minhas.map((m) => (
                  <CartaoMeta
                    key={m.id}
                    meta={m}
                    onEditar={() => setForm({ aberta: true, meta: m })}
                    onRemover={() => void remover(m.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {equipe.length > 0 && (
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-escuro">
                <Users className="h-4 w-4 text-tiffany" /> Metas da equipe
              </h3>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {equipe.map((m) => (
                  <CartaoMeta key={m.id} meta={m} daEquipe />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {form.aberta && (
        <FormMetaColaborador
          meta={form.meta}
          onFechar={() => setForm({ aberta: false, meta: null })}
          onSalvo={() => {
            setForm({ aberta: false, meta: null });
            void carregar();
          }}
        />
      )}
    </div>
  );
}

function CartaoMeta({
  meta,
  daEquipe,
  onEditar,
  onRemover,
}: {
  meta: Meta;
  daEquipe?: boolean;
  onEditar?: () => void;
  onRemover?: () => void;
}) {
  const p = meta.progresso;
  const ritmo = RITMO_INFO[p.ritmo];
  // Arco verde quando batida; senao na cor do ritmo (verde/ambar/vermelho).
  const corRitmo = corRitmoHex(p.ritmo);
  const corArco = p.atingida ? "#16a34a" : corRitmo;
  // Cor do numero grande do %: verde quando batida, senao acompanha o ritmo.
  const corPct = p.atingida ? "#16a34a" : corRitmo;
  const titulo = meta.nome ?? ROTULO_METRICA[meta.metrica];
  const minha = meta.podeEditar === true;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        p.atingida ? "border-green-300 ring-1 ring-green-200" : "border-black/5"
      }`}
    >
      {p.atingida && (
        <span className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-green-500/15 px-2.5 py-1 text-[11px] font-semibold text-green-700 ring-1 ring-green-300/60">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white">
            <Trophy className="h-2.5 w-2.5" />
          </span>
          Meta batida
        </span>
      )}

      <div className="flex items-center gap-2">
        <ChipFinalidade finalidade={meta.finalidade} />
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-medio/70">
          {ROTULO_PERIODO[meta.periodo]}
        </span>
        {!daEquipe && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              minha
                ? "bg-tiffany/10 text-tiffany"
                : "bg-black/5 text-medio/70"
            }`}
          >
            {minha ? (
              <>
                <UserCog className="h-3 w-3" /> Definida por voce
              </>
            ) : (
              <>
                <Shield className="h-3 w-3" /> Definida pela administracao
              </>
            )}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <Link
          href={`/metas/${meta.id}`}
          className="group min-w-0 flex-1"
        >
          <p className="flex items-center gap-1 text-sm font-semibold text-escuro group-hover:text-tiffany">
            <span className="truncate">{titulo}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </p>
          <p className="text-xs text-medio/60">
            {ROTULO_METRICA[meta.metrica]}
            {!p.maiorMelhor && " · abaixo de"}
          </p>
        </Link>
        {minha && (onEditar || onRemover) && (
          <div className="flex shrink-0 items-center gap-0.5">
            {onEditar && (
              <button
                onClick={onEditar}
                aria-label="Editar meta"
                className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {onRemover && (
              <button
                onClick={onRemover}
                aria-label="Excluir meta"
                className="rounded-lg p-1.5 text-medio/50 hover:bg-black/5 hover:text-erro"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-5">
        <Donut
          pct={pctExibido(p)}
          cor={corArco}
          centro={`${pctExibido(p)}%`}
          legenda="do alvo"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p
              className="text-2xl font-semibold leading-none"
              style={{ color: corPct }}
            >
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
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-medio/60">
            <span className="inline-flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Projecao {formatarValor(meta.metrica, p.projecao)}
            </span>
            {!daEquipe && meta.ranking && meta.ranking.posicao > 0 && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${
                  meta.ranking.posicao === 1
                    ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300/60"
                    : "bg-black/5 text-escuro"
                }`}
              >
                <Trophy
                  className={`h-3.5 w-3.5 ${
                    meta.ranking.posicao === 1 ? "text-amber-500" : "text-medio/60"
                  }`}
                />
                {meta.ranking.posicao}o de {meta.ranking.total}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChipFinalidade({ finalidade }: { finalidade: Meta["finalidade"] }) {
  if (finalidade === "AMBAS") {
    return (
      <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-medio/70">
        Geral
      </span>
    );
  }
  const c = corFinalidade(finalidade);
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.badge}`}>
      {c.rotulo}
    </span>
  );
}

function GradeSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-black/5 bg-white p-5">
          <div className="skeleton h-4 w-24" />
          <div className="mt-4 flex items-center gap-5">
            <div className="skeleton h-32 w-32 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-7 w-24" />
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-6 w-28 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
