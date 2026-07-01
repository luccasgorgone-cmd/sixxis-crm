"use client";

// Inteligencia Regional: mapa coropletico do Brasil + rankings por estado e
// regiao. Cruza dados internos (clientes/vendas/faturamento por UF) com a
// previsao do tempo (Open-Meteo) para sugerir onde ha mais oportunidade de
// venda de climatizador. Spinning/Aspirador usam so a densidade interna.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshCw,
  Loader2,
  ThermometerSun,
  Users,
  Info,
  Sparkles,
} from "lucide-react";
import { infoPorUF } from "@/lib/ddd";
import { formatarBRL } from "@/lib/format";
import { EstadoErro } from "@/components/ui/Estado";
import { MapaBrasil } from "./MapaBrasil";
import { RankingEstados, type ItemRanking } from "./RankingEstados";
import { DistribuicaoRegiao } from "./DistribuicaoRegiao";
import { Reveal } from "./Reveal";
import {
  CATEGORIAS,
  ESCALA_DENSIDADE,
  ESCALA_INDICE,
  COR_SEM_DADO,
  corEscala,
  type Categoria,
  type ClimaResp,
  type ClimaUF,
  type MetricaBase,
  type RegioesResp,
  type RegiaoUF,
} from "./tipos";

function estadoDe(uf: string, reg?: RegiaoUF): string {
  return reg?.estado ?? infoPorUF(uf)?.estado ?? uf;
}

export function InteligenciaRegional() {
  const [categoria, setCategoria] = useState<Categoria>("CLIMATIZADOR");
  const [dias, setDias] = useState<7 | 14>(7);
  const [metricaBase, setMetricaBase] = useState<MetricaBase>("clientes");

  const [regioes, setRegioes] = useState<RegioesResp | null>(null);
  const [clima, setClima] = useState<ClimaResp | null>(null);
  const [carregandoReg, setCarregandoReg] = useState(true);
  const [carregandoClima, setCarregandoClima] = useState(false);
  const [erroReg, setErroReg] = useState(false);
  const [erroClima, setErroClima] = useState(false);
  const [ufAtivo, setUfAtivo] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  const ehClima = categoria === "CLIMATIZADOR";

  // Relogio leve p/ "atualizado ha X min".
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const carregarRegioes = useCallback(async () => {
    setCarregandoReg(true);
    try {
      const r = await fetch("/api/inteligencia/regioes");
      if (!r.ok) throw new Error();
      setRegioes(await r.json());
      setErroReg(false);
    } catch {
      setErroReg(true);
    } finally {
      setCarregandoReg(false);
    }
  }, []);

  const carregarClima = useCallback(
    async (d: 7 | 14, refresh = false) => {
      setCarregandoClima(true);
      try {
        const r = await fetch(
          `/api/inteligencia/clima?dias=${d}${refresh ? "&refresh=1" : ""}`,
        );
        if (!r.ok) throw new Error();
        setClima(await r.json());
        setErroClima(false);
      } catch {
        setErroClima(true);
      } finally {
        setCarregandoClima(false);
      }
    },
    [],
  );

  useEffect(() => {
    void carregarRegioes();
  }, [carregarRegioes]);

  // Carrega o clima ao entrar em Climatizador ou trocar de periodo (uma vez por
  // combinacao; o cache do servidor evita refetch pesado).
  const climaCarregadoRef = useRef<string>("");
  useEffect(() => {
    if (!ehClima) return;
    const chave = `${dias}`;
    if (climaCarregadoRef.current === chave && clima) return;
    climaCarregadoRef.current = chave;
    void carregarClima(dias);
  }, [ehClima, dias, carregarClima, clima]);

  const regPorUF = useMemo(() => {
    const m = new Map<string, RegiaoUF>();
    regioes?.porUF.forEach((r) => m.set(r.uf, r));
    return m;
  }, [regioes]);

  const climaPorUF = useMemo(() => {
    const m = new Map<string, ClimaUF>();
    clima?.porUF.forEach((c) => m.set(c.uf, c));
    return m;
  }, [clima]);

  const maxDensidade = useMemo(() => {
    let mx = 0;
    regioes?.porUF.forEach((r) => {
      const v = metricaBase === "vendas" ? r.vendas : r.clientes;
      if (v > mx) mx = v;
    });
    return mx;
  }, [regioes, metricaBase]);

  // Clima realmente utilizavel? (existe e ao menos uma UF sem erro)
  const climaUtil = useMemo(
    () => !!clima && clima.porUF.some((c) => !c.erro && c.indiceOportunidade != null),
    [clima],
  );
  // Em Climatizador sem clima -> degrada para densidade de clientes + aviso.
  const modoDensidade = !ehClima || !climaUtil;

  const corPorUF = useCallback(
    (uf: string): string => {
      if (!modoDensidade) {
        const c = climaPorUF.get(uf);
        if (!c || c.erro || c.indiceOportunidade == null) return COR_SEM_DADO;
        return corEscala(c.indiceOportunidade / 100, ESCALA_INDICE);
      }
      const r = regPorUF.get(uf);
      const v = r ? (metricaBase === "vendas" ? r.vendas : r.clientes) : 0;
      if (!v || maxDensidade === 0) return COR_SEM_DADO;
      return corEscala(v / maxDensidade, ESCALA_DENSIDADE);
    },
    [modoDensidade, climaPorUF, regPorUF, metricaBase, maxDensidade],
  );

  const tooltip = useCallback(
    (uf: string): React.ReactNode => {
      const reg = regPorUF.get(uf);
      const nome = estadoDe(uf, reg);
      const clientes = reg?.clientes ?? 0;
      if (ehClima && climaUtil) {
        const c = climaPorUF.get(uf);
        return (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-escuro">
              {nome} <span className="text-medio/60">({uf})</span>
            </p>
            {!c || c.erro ? (
              <p className="text-medio/60">Sem dados de clima.</p>
            ) : (
              <>
                <Linha rotulo="Temp. atual" valor={fmtTemp(c.tempAtual)} />
                <Linha rotulo="Maxima prevista" valor={fmtTemp(c.tempMax)} />
                <Linha rotulo="Umidade" valor={fmtPct(c.umidade)} />
                <Linha
                  rotulo={`Chuva (${dias}d)`}
                  valor={c.chuvaPrevista != null ? `${c.chuvaPrevista} mm` : "—"}
                />
                <div className="mt-1 flex items-center justify-between border-t border-black/5 pt-1">
                  <span className="text-medio/70">Indice oportunidade</span>
                  <span className="font-semibold text-escuro">
                    {c.indiceOportunidade ?? "—"}
                  </span>
                </div>
              </>
            )}
            <Linha rotulo="Seus clientes" valor={String(clientes)} />
          </div>
        );
      }
      return (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-escuro">
            {nome} <span className="text-medio/60">({uf})</span>
          </p>
          <Linha rotulo="Clientes" valor={String(clientes)} />
          <Linha rotulo="Vendas" valor={String(reg?.vendas ?? 0)} />
          <Linha rotulo="Faturamento" valor={formatarBRL(reg?.faturamento ?? 0)} />
        </div>
      );
    },
    [ehClima, climaUtil, climaPorUF, regPorUF, dias],
  );

  // Ranking (top 10) pela metrica ativa.
  const ranking: ItemRanking[] = useMemo(() => {
    if (ehClima && climaUtil) {
      return (clima?.porUF ?? [])
        .filter((c) => !c.erro && c.indiceOportunidade != null)
        .map((c) => ({
          uf: c.uf,
          valor: c.indiceOportunidade as number,
          cor: corEscala((c.indiceOportunidade as number) / 100, ESCALA_INDICE),
        }))
        .sort((a, b) => b.valor - a.valor);
    }
    return (regioes?.porUF ?? [])
      .map((r) => {
        const v = metricaBase === "vendas" ? r.vendas : r.clientes;
        return {
          uf: r.uf,
          valor: v,
          cor: corEscala(maxDensidade ? v / maxDensidade : 0, ESCALA_DENSIDADE),
        };
      })
      .filter((i) => i.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }, [ehClima, climaUtil, clima, regioes, metricaBase, maxDensidade]);

  const distRegiao = useMemo(
    () =>
      (regioes?.porRegiao ?? []).map((r) => ({
        regiao: r.regiao,
        valor: metricaBase === "vendas" ? r.vendas : r.clientes,
      })),
    [regioes, metricaBase],
  );

  // Melhores oportunidades (climatizador): top indice x presenca de clientes.
  const oportunidades = useMemo(() => {
    if (!(ehClima && climaUtil)) return [];
    return (clima?.porUF ?? [])
      .filter((c) => !c.erro && c.indiceOportunidade != null)
      .sort((a, b) => (b.indiceOportunidade ?? 0) - (a.indiceOportunidade ?? 0))
      .slice(0, 6)
      .map((c) => ({
        uf: c.uf,
        nome: estadoDe(c.uf, regPorUF.get(c.uf)),
        indice: c.indiceOportunidade as number,
        tempMax: c.tempMax,
        clientes: regPorUF.get(c.uf)?.clientes ?? 0,
      }));
  }, [ehClima, climaUtil, clima, regPorUF]);

  const minAtualizado =
    clima?.atualizadoEm != null
      ? Math.max(0, Math.round((agora - new Date(clima.atualizadoEm).getTime()) / 60000))
      : null;

  const atualizar = () => {
    if (ehClima) void carregarClima(dias, true);
    else void carregarRegioes();
  };
  const atualizando = ehClima ? carregandoClima : carregandoReg;

  const rotuloMetrica = ehClima
    ? "Indice de oportunidade (clima)"
    : `Densidade de ${metricaBase === "vendas" ? "vendas" : "clientes"} (dado interno)`;

  return (
    <div className="space-y-4 p-6">
      {/* Cabecalho + filtros */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-escuro">
            Inteligencia Regional
          </h2>
          <p className="text-sm text-medio/60">
            Onde estao seus clientes e onde ha mais oportunidade agora
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Categoria */}
          <div className="flex overflow-hidden rounded-lg border border-black/10">
            {CATEGORIAS.map((c) => (
              <button
                key={c.chave}
                onClick={() => setCategoria(c.chave)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  categoria === c.chave
                    ? "bg-tiffany text-white"
                    : "bg-white text-medio hover:bg-black/5"
                }`}
              >
                {c.rotulo}
              </button>
            ))}
          </div>

          {/* Periodo (climatizador) */}
          {ehClima && (
            <div className="flex overflow-hidden rounded-lg border border-black/10">
              {([7, 14] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDias(d)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    dias === d
                      ? "bg-tiffany text-white"
                      : "bg-white text-medio hover:bg-black/5"
                  }`}
                >
                  {d} dias
                </button>
              ))}
            </div>
          )}

          {/* Metrica base (spinning/aspirador) */}
          {!ehClima && (
            <div className="flex overflow-hidden rounded-lg border border-black/10">
              {(["clientes", "vendas"] as const).map((mb) => (
                <button
                  key={mb}
                  onClick={() => setMetricaBase(mb)}
                  className={`px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                    metricaBase === mb
                      ? "bg-tiffany text-white"
                      : "bg-white text-medio hover:bg-black/5"
                  }`}
                >
                  {mb}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={atualizar}
            disabled={atualizando}
            className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany disabled:opacity-60"
          >
            {atualizando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Atualizar
          </button>
        </div>
      </div>

      {/* Status do clima */}
      {ehClima && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-medio/60">
          {minAtualizado != null && !erroClima && (
            <span>
              Clima atualizado{" "}
              {minAtualizado === 0 ? "agora" : `ha ${minAtualizado} min`} ·
              fonte {clima?.fonte}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Info className="h-3 w-3" />O indice deriva do clima real
            (temperatura, umidade e chuva) — nao e indice meteorologico oficial.
          </span>
        </div>
      )}

      {/* Aviso de degradacao do clima */}
      {ehClima && !climaUtil && !carregandoClima && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          Nao foi possivel carregar o clima agora. Mostrando a presenca de
          clientes por estado; tente novamente em instantes.
        </div>
      )}

      {erroReg && !regioes ? (
        <EstadoErro
          mensagem="Nao foi possivel carregar os dados regionais."
          onRetry={() => void carregarRegioes()}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Mapa + legenda */}
          <Reveal className="lg:col-span-2">
            <div className="rounded-xl border border-black/5 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-escuro">{rotuloMetrica}</p>
                {regioes && (
                  <p className="text-xs text-medio/60">
                    {regioes.total.clientes} clientes · {regioes.total.vendas}{" "}
                    vendas · {formatarBRL(regioes.total.faturamento)}
                    {regioes.semUF > 0 && ` · ${regioes.semUF} sem UF`}
                  </p>
                )}
              </div>
              {carregandoReg && !regioes ? (
                <div className="skeleton h-[360px] w-full rounded-xl" />
              ) : (
                <MapaBrasil
                  cor={corPorUF}
                  tooltip={tooltip}
                  ufAtivo={ufAtivo}
                  onHoverUF={setUfAtivo}
                />
              )}
              <Legenda
                clima={ehClima && climaUtil}
                maxDensidade={maxDensidade}
                metricaBase={metricaBase}
              />
            </div>
          </Reveal>

          {/* Painel lateral: ranking + distribuicao */}
          <div className="space-y-4">
            <Reveal delay={60}>
              <RankingEstados
                titulo={
                  ehClima && climaUtil
                    ? "Maiores indices de oportunidade"
                    : `Estados com mais ${
                        metricaBase === "vendas" ? "vendas" : "clientes"
                      }`
                }
                itens={ranking}
              />
            </Reveal>
            <Reveal delay={120}>
              <DistribuicaoRegiao
                dados={distRegiao}
                rotulo={`Por ${metricaBase === "vendas" ? "vendas" : "clientes"} (dado interno)`}
              />
            </Reveal>
          </div>
        </div>
      )}

      {/* Melhores oportunidades (climatizador) */}
      {ehClima && climaUtil && oportunidades.length > 0 && (
        <Reveal delay={80}>
          <div className="rounded-xl border border-black/5 bg-white p-4">
            <div className="mb-1 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-tiffany" />
              <p className="text-sm font-semibold text-escuro">
                Melhores oportunidades agora
              </p>
            </div>
            <p className="mb-3 text-xs text-medio/60">
              Estados com maior indice de oportunidade (clima quente/seco) e
              quantos clientes voce ja tem la.
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {oportunidades.map((o, i) => (
                <Reveal key={o.uf} delay={i * 60}>
                  <div className="rounded-lg border border-black/5 bg-fundo p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-escuro">
                        {o.nome}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                        style={{
                          backgroundColor: corEscala(
                            o.indice / 100,
                            ESCALA_INDICE,
                          ),
                        }}
                      >
                        {o.indice}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-medio/70">
                      <span className="flex items-center gap-1">
                        <ThermometerSun className="h-3.5 w-3.5" />
                        {fmtTemp(o.tempMax)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {o.clientes} clientes
                      </span>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      {/* Rodape honesto para spinning/aspirador */}
      {!ehClima && (
        <p className="flex items-center gap-1.5 text-xs text-medio/60">
          <Info className="h-3 w-3" />
          Camada de densidade de clientes/vendas (dado interno real). Sem
          previsao de vendas: ela chega quando houver historico suficiente.
        </p>
      )}
    </div>
  );
}

// ---- auxiliares de UI ----

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-medio/70">{rotulo}</span>
      <span className="font-medium text-escuro">{valor}</span>
    </div>
  );
}

function fmtTemp(v: number | null): string {
  return v == null ? "—" : `${Math.round(v)}°C`;
}
function fmtPct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v)}%`;
}

function Legenda({
  clima,
  maxDensidade,
  metricaBase,
}: {
  clima: boolean;
  maxDensidade: number;
  metricaBase: MetricaBase;
}) {
  const grad = clima
    ? "linear-gradient(90deg,#5b7a76 0%,#3cbfb3 35%,#f59e0b 65%,#dc2626 100%)"
    : "linear-gradient(90deg,#e2f4f1 0%,#3cbfb3 50%,#12433d 100%)";
  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="flex items-center gap-1.5 text-xs text-medio/60">
        {clima ? <ThermometerSun className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
        {clima ? "Menor" : "0"}
      </div>
      <div
        className="h-2.5 flex-1 rounded-full"
        style={{ background: grad }}
        aria-hidden
      />
      <div className="text-xs text-medio/60">
        {clima ? "Maior oportunidade" : `${maxDensidade} ${metricaBase}`}
      </div>
    </div>
  );
}
