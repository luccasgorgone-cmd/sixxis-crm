"use client";

// Aba Google Trends: hub de demanda. Tres secoes, nesta ordem: (1) links ao
// Google Trends por categoria (o Trends nao tem API oficial e bloqueia
// datacenter -> so links, que abrem no site do Google); (2) Tendencias do
// Mercado Livre (OAuth oficial, atras de "Conectar"; zero numero inventado
// enquanto desconectado); (3) demanda interna do CRM (ancora que nunca falha).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  TrendingUp,
  ExternalLink,
  Fan,
  Bike,
  Wind,
  ShoppingBag,
  Loader2,
  RefreshCw,
  Unplug,
  Info,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "@/components/inteligencia/Reveal";
import { useAgente } from "@/components/shell/AgenteContext";
import type { EstadosResp } from "@/components/mapa/tipos";

const BASE_TRENDS = "https://trends.google.com/trends/explore?geo=BR&hl=pt-BR&q=";
function urlTrends(termo: string): string {
  return BASE_TRENDS + encodeURIComponent(termo);
}

const CATEGORIAS_TRENDS: {
  rotulo: string;
  icon: LucideIcon;
  termos: string[];
}[] = [
  {
    rotulo: "Climatizadores",
    icon: Fan,
    termos: [
      "climatizador",
      "climatizador de ar",
      "climatizador evaporativo",
      "ar condicionado portatil",
      "ventilador",
    ],
  },
  {
    rotulo: "Bikes de Spinning",
    icon: Bike,
    termos: ["bike spinning", "bicicleta ergometrica", "spinning", "bike indoor"],
  },
  {
    rotulo: "Aspiradores",
    icon: Wind,
    termos: [
      "aspirador de po",
      "aspirador vertical",
      "aspirador robo",
      "aspirador de po e agua",
    ],
  },
];

function desde(iso: string | null): string {
  if (!iso) return "sem registro";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `ha ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `ha ${h} h`;
  return `ha ${Math.round(h / 24)} d`;
}

export function TrendsHub() {
  const agente = useAgente();
  const ehAdmin = (agente?.papel ?? "COLABORADOR") === "ADMIN";

  return (
    <div className="space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-escuro">Google Trends</h2>
        <p className="text-sm text-medio/60">
          Sinais de demanda por categoria: interesse de busca, tendencias do
          Mercado Livre e o dado interno do seu CRM.
        </p>
      </div>

      <SecaoGoogleTrends />
      <SecaoMercadoLivre ehAdmin={ehAdmin} />
      <SecaoDemandaInterna />
    </div>
  );
}

// ---- 1. Google Trends (links externos) ----
function SecaoGoogleTrends() {
  return (
    <Reveal>
      <div className="rounded-xl border border-black/5 bg-white p-4">
        <div className="mb-1 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-tiffany" />
          <p className="text-sm font-semibold text-escuro">
            Interesse de busca (Google Trends)
          </p>
        </div>
        <p className="mb-3 text-xs text-medio/60">
          Tendencia de buscas no Brasil por termo. Cada botao abre no site do
          Google Trends, fora do CRM.
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {CATEGORIAS_TRENDS.map((cat) => (
            <div
              key={cat.rotulo}
              className="flex flex-col gap-2 rounded-lg border border-black/5 bg-fundo p-3"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tiffany/10">
                  <cat.icon className="h-4 w-4 text-tiffany" />
                </div>
                <span className="text-sm font-semibold text-escuro">
                  {cat.rotulo}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cat.termos.map((termo) => (
                  <a
                    key={termo}
                    href={urlTrends(termo)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Ver "${termo}" no Google Trends`}
                    className="flex items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany"
                  >
                    {termo}
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

// ---- 2. Mercado Livre (OAuth, atras de Conectar) ----
type TrendsML = {
  conectado: boolean;
  atualizadoEm?: string | null;
  stale?: boolean;
  itens: { keyword: string; url: string }[];
};

function SecaoMercadoLivre({ ehAdmin }: { ehAdmin: boolean }) {
  const params = useSearchParams();
  const feedback = params.get("ml");
  const [dados, setDados] = useState<TrendsML | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async (refresh = false) => {
    if (refresh) setAtualizando(true);
    else setCarregando(true);
    try {
      const r = await fetch(
        `/api/trends/mercadolivre${refresh ? "?refresh=1" : ""}`,
      );
      if (!r.ok) throw new Error();
      setDados(await r.json());
    } catch {
      setDados({ conectado: false, itens: [] });
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const desconectar = async () => {
    if (!confirm("Desconectar a integracao do Mercado Livre?")) return;
    try {
      await fetch("/api/admin/integracoes/mercadolivre/desconectar", {
        method: "POST",
      });
    } catch {
      // segue e recarrega o estado de qualquer forma
    }
    void carregar();
  };

  return (
    <Reveal delay={60}>
      <div className="rounded-xl border border-black/5 bg-white p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-tiffany" />
            <p className="text-sm font-semibold text-escuro">
              Mercado Livre — Tendencias de busca
            </p>
          </div>
          {dados?.conectado && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => void carregar(true)}
                disabled={atualizando}
                className="flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany disabled:opacity-60"
              >
                {atualizando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Atualizar
              </button>
              {ehAdmin && (
                <button
                  onClick={() => void desconectar()}
                  className="flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-medio transition-colors hover:border-erro hover:text-erro"
                >
                  <Unplug className="h-3.5 w-3.5" />
                  Desconectar
                </button>
              )}
            </div>
          )}
        </div>

        {feedback && <BannerFeedback tipo={feedback} />}

        {carregando ? (
          <div className="skeleton mt-2 h-28 w-full rounded-lg" />
        ) : dados?.conectado ? (
          <ConectadoML dados={dados} />
        ) : (
          <DesconectadoML ehAdmin={ehAdmin} />
        )}
      </div>
    </Reveal>
  );
}

function BannerFeedback({ tipo }: { tipo: string }) {
  const ok = tipo === "conectado";
  const msg =
    tipo === "conectado"
      ? "Mercado Livre conectado com sucesso."
      : tipo === "erro_config"
        ? "Integracao nao configurada no servidor (credenciais ausentes)."
        : tipo === "erro_state"
          ? "Falha de seguranca na conexao (state invalido). Tente de novo."
          : tipo === "erro_token"
            ? "Nao foi possivel concluir a conexao com o Mercado Livre."
            : null;
  if (!msg) return null;
  return (
    <div
      className={`mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
        ok
          ? "bg-sucesso/10 text-sucesso"
          : "border border-amber-300/60 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      )}
      {msg}
    </div>
  );
}

function ConectadoML({ dados }: { dados: TrendsML }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-medio/60">
        <span className="rounded-full bg-tiffany/10 px-2 py-0.5 font-medium text-tiffany">
          Fonte: Mercado Livre — atualizado semanalmente
        </span>
        <span>Cache {desde(dados.atualizadoEm ?? null)}</span>
        {dados.stale && (
          <span className="font-medium text-amber-600 dark:text-amber-400">
            · desatualizado
          </span>
        )}
      </div>
      {dados.itens.length === 0 ? (
        <p className="py-6 text-center text-sm text-medio/50">
          Sem tendencias no momento. Tente atualizar em instantes.
        </p>
      ) : (
        <ol className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {dados.itens.map((it, i) => (
            <li key={`${it.keyword}-${i}`}>
              <a
                href={it.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-black/5"
              >
                <span className="w-6 shrink-0 text-right text-xs font-semibold text-medio/50">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-escuro">
                  {it.keyword}
                </span>
                {it.url && (
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-medio/40" />
                )}
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function DesconectadoML({ ehAdmin }: { ehAdmin: boolean }) {
  if (ehAdmin) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-black/10 bg-fundo p-4">
        <p className="text-sm text-medio/70">
          Conecte para ver as buscas mais populares do Mercado Livre,
          atualizadas semanalmente.
        </p>
        <a
          href="/api/admin/integracoes/mercadolivre/conectar"
          className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro"
        >
          <ShoppingBag className="h-4 w-4" />
          Conectar Mercado Livre
        </a>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-black/10 bg-fundo p-4 text-sm text-medio/60">
      <Info className="h-4 w-4 shrink-0" />
      Integracao do Mercado Livre ainda nao conectada. Peca ao administrador para
      conectar e ver as buscas mais populares.
    </div>
  );
}

// ---- 3. Demanda interna do CRM (ancora) ----
function SecaoDemandaInterna() {
  const [dados, setDados] = useState<EstadosResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/mapa/estados");
        if (!r.ok) throw new Error();
        const j = (await r.json()) as EstadosResp;
        if (vivo) {
          setDados(j);
          setErro(false);
        }
      } catch {
        if (vivo) setErro(true);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Soma produtosTop de todas as UFs por categoria (dado interno real).
  const categorias = useMemo(() => {
    const m = new Map<string, number>();
    dados?.porUF.forEach((uf) =>
      uf.produtosTop.forEach((p) =>
        m.set(p.rotulo, (m.get(p.rotulo) ?? 0) + p.qtd),
      ),
    );
    return [...m.entries()]
      .map(([rotulo, qtd]) => ({ rotulo, qtd }))
      .sort((a, b) => b.qtd - a.qtd);
  }, [dados]);

  const total = categorias.reduce((s, c) => s + c.qtd, 0);
  const max = categorias[0]?.qtd ?? 0;

  return (
    <Reveal delay={120}>
      <div className="rounded-xl border border-black/5 bg-white p-4">
        <div className="mb-1 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-tiffany" />
          <p className="text-sm font-semibold text-escuro">
            Demanda interna Sixxis
          </p>
        </div>
        <p className="mb-3 flex items-center gap-1 text-xs text-medio/60">
          <Info className="h-3 w-3 shrink-0" />
          Dado interno do CRM (clientes por categoria de produto). A classificacao
          depende do anuncio de origem — muitos ainda ficam em &quot;Nao
          classificado&quot;.
        </p>

        {carregando ? (
          <div className="skeleton h-24 w-full rounded-lg" />
        ) : erro ? (
          <p className="py-4 text-center text-sm text-medio/50">
            Nao foi possivel carregar o dado interno.
          </p>
        ) : total === 0 ? (
          <p className="py-4 text-center text-sm text-medio/50">
            Ainda sem clientes classificados por categoria.
          </p>
        ) : (
          <ul className="space-y-2">
            {categorias.map((c) => (
              <li key={c.rotulo} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate text-sm text-medio/80">
                  {c.rotulo}
                </span>
                <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-black/5">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-tiffany"
                    style={{ width: `${max ? (c.qtd / max) * 100 : 0}%` }}
                  />
                </span>
                <span className="w-10 shrink-0 text-right text-sm font-semibold text-escuro">
                  {c.qtd}
                </span>
              </li>
            ))}
          </ul>
        )}
        {total > 0 && (
          <p className="mt-2 text-[11px] text-medio/50">
            {total} clientes classificados no total.
          </p>
        )}
      </div>
    </Reveal>
  );
}
