"use client";

// Aba Clima: mapa coropletico do Brasil + rankings por estado e regiao. Cruza a
// previsao do tempo (Open-Meteo) com os dados internos (clientes por UF) para
// sugerir onde ha mais oportunidade de venda de climatizador. Se o clima estiver
// indisponivel, degrada para a densidade de clientes (dado interno).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshCw,
  Loader2,
  ThermometerSun,
  Users,
  Info,
  Sparkles,
  Clock,
  CloudOff,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { infoPorUF } from "@/lib/ddd";
import { formatarBRL } from "@/lib/format";
import { EstadoErro } from "@/components/ui/Estado";
import { LegendaGradiente } from "@/components/ui/LegendaGradiente";
import { useAgente } from "@/components/shell/AgenteContext";
import { SeletorVendedor } from "@/components/shared/SeletorVendedor";
import { paramsEscopo } from "@/lib/escopo";
import { PainelNegocio } from "@/components/kanban/PainelNegocio";
import type {
  Etapa,
  EtiquetaChip,
  AgenteResumo,
} from "@/components/kanban/tipos";
import { MapaBrasil } from "./MapaBrasil";
import { RankingEstados, type ItemRanking } from "./RankingEstados";
import { DistribuicaoRegiao } from "./DistribuicaoRegiao";
import { PainelClientesEstado } from "./PainelClientesEstado";
import { Reveal } from "./Reveal";
import {
  ESCALA_DENSIDADE,
  ESCALA_INDICE,
  COR_SEM_DADO,
  FILTROS_VAZIO,
  corEscala,
  gradienteCss,
  algumFiltroAtivo,
  combinaFiltros,
  faixaDeTemp,
  faixaDeUmid,
  faixaDeChuva,
  faixaDeSensacao,
  faixaDeIndice,
  type ClimaResp,
  type ClimaUF,
  type FiltrosClima,
  type RegioesResp,
  type RegiaoUF,
} from "./tipos";

function estadoDe(uf: string, reg?: RegiaoUF): string {
  return reg?.estado ?? infoPorUF(uf)?.estado ?? uf;
}

// Janelas de previsao suportadas (16 = teto de forecast diario da Open-Meteo).
type Dias = 3 | 7 | 14 | 16;

export function InteligenciaRegional() {
  const [dias, setDias] = useState<Dias>(7);

  const [regioes, setRegioes] = useState<RegioesResp | null>(null);
  const [clima, setClima] = useState<ClimaResp | null>(null);
  const [carregandoReg, setCarregandoReg] = useState(true);
  const [carregandoClima, setCarregandoClima] = useState(false);
  const [erroReg, setErroReg] = useState(false);
  const [erroClima, setErroClima] = useState(false);
  const [ufAtivo, setUfAtivo] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [cooldownAte, setCooldownAte] = useState(0);
  const [filtros, setFiltros] = useState<FiltrosClima>(FILTROS_VAZIO);

  // Clique no estado -> drawer de clientes; item do drawer -> painel do negocio.
  const [ufClientes, setUfClientes] = useState<string | null>(null);
  const [negocioId, setNegocioId] = useState<string | null>(null);

  const agente = useAgente();
  const papel = agente?.papel ?? "COLABORADOR";
  const ehAdmin = papel === "ADMIN";
  const agenteId = agente?.id ?? "";
  const [escopo, setEscopo] = useState(""); // admin: "" (Todos) | agenteId | SEM_DONO
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [etiquetas, setEtiquetas] = useState<EtiquetaChip[]>([]);
  const [agentes, setAgentes] = useState<AgenteResumo[]>([]);

  // Datasets para o PainelNegocio (reuso do Kanban), carregados uma vez.
  useEffect(() => {
    fetch("/api/etapas")
      .then((r) => (r.ok ? r.json() : { etapas: [] }))
      .then((d) => setEtapas(d.etapas ?? []))
      .catch(() => undefined);
    fetch("/api/etiquetas")
      .then((r) => (r.ok ? r.json() : { etiquetas: [] }))
      .then((d) => setEtiquetas(d.etiquetas ?? []))
      .catch(() => undefined);
    if (ehAdmin) {
      fetch("/api/agentes")
        .then((r) => (r.ok ? r.json() : { agentes: [] }))
        .then((d) => setAgentes(d.agentes ?? []))
        .catch(() => undefined);
    }
  }, [ehAdmin]);

  // Relogio leve p/ "atualizado ha X min".
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Re-habilita o botao exatamente quando o cooldown termina (sem ticker de 1s).
  useEffect(() => {
    if (cooldownAte <= Date.now()) return;
    const t = setTimeout(() => setAgora(Date.now()), cooldownAte - Date.now() + 50);
    return () => clearTimeout(t);
  }, [cooldownAte]);

  const carregarRegioes = useCallback(async () => {
    setCarregandoReg(true);
    try {
      const p = new URLSearchParams();
      for (const [k, v] of paramsEscopo(escopo)) p.set(k, v);
      const qs = p.toString();
      const r = await fetch(`/api/inteligencia/regioes${qs ? `?${qs}` : ""}`);
      if (!r.ok) throw new Error();
      setRegioes(await r.json());
      setErroReg(false);
    } catch {
      setErroReg(true);
    } finally {
      setCarregandoReg(false);
    }
  }, [escopo]);

  const carregarClima = useCallback(
    async (d: Dias, refresh = false) => {
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

  // Carrega o clima ao montar ou trocar de periodo (uma vez por combinacao; o
  // cache do servidor evita refetch pesado).
  const climaCarregadoRef = useRef<string>("");
  useEffect(() => {
    const chave = `${dias}`;
    if (climaCarregadoRef.current === chave && clima) return;
    climaCarregadoRef.current = chave;
    void carregarClima(dias);
  }, [dias, carregarClima, clima]);

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
      if (r.clientes > mx) mx = r.clientes;
    });
    return mx;
  }, [regioes]);

  // Clima realmente utilizavel? (existe e ao menos uma UF sem erro)
  const climaUtil = useMemo(
    () => !!clima && clima.porUF.some((c) => !c.erro && c.indiceOportunidade != null),
    [clima],
  );
  // Sem clima utilizavel -> degrada para densidade de clientes (dado interno) + aviso.
  const modoDensidade = !climaUtil;

  // Filtros de faixa: so no modo clima util. UF sem dado nao bate filtro ativo.
  const filtrosLigados = climaUtil && algumFiltroAtivo(filtros);
  const dimUF = useCallback(
    (uf: string): boolean => {
      if (!filtrosLigados) return false;
      const c = climaPorUF.get(uf);
      if (!c || c.erro) return true;
      return !combinaFiltros(c, filtros);
    },
    [filtrosLigados, climaPorUF, filtros],
  );

  // Contagem de estados por faixa (feedback nos chips: "Alta >30 (7)"). So conta
  // UF com clima valido; UF sem dado na dimensao nao entra em nenhuma faixa.
  const contagens = useMemo(() => {
    const base = {
      temp: { alta: 0, media: 0, baixa: 0 },
      umidade: { alta: 0, media: 0, baixa: 0 },
      chuva: { com: 0, sem: 0 },
      sensacao: { alta: 0, media: 0, baixa: 0 },
      indice: { alto: 0, medio: 0, baixo: 0 },
    };
    (clima?.porUF ?? []).forEach((c) => {
      if (c.erro) return;
      const t = faixaDeTemp(c.tempMax);
      if (t) base.temp[t]++;
      const u = faixaDeUmid(c.umidade);
      if (u) base.umidade[u]++;
      const ch = faixaDeChuva(c.chuvaPrevista);
      if (ch) base.chuva[ch]++;
      const s = faixaDeSensacao(c.sensacao, c.tempMax);
      if (s) base.sensacao[s]++;
      const i = faixaDeIndice(c.indiceOportunidade);
      if (i) base.indice[i]++;
    });
    return base;
  }, [clima]);

  const corPorUF = useCallback(
    (uf: string): string => {
      if (!modoDensidade) {
        const c = climaPorUF.get(uf);
        if (!c || c.erro || c.indiceOportunidade == null) return COR_SEM_DADO;
        return corEscala(c.indiceOportunidade / 100, ESCALA_INDICE);
      }
      const r = regPorUF.get(uf);
      const v = r ? r.clientes : 0;
      if (!v || maxDensidade === 0) return COR_SEM_DADO;
      return corEscala(v / maxDensidade, ESCALA_DENSIDADE);
    },
    [modoDensidade, climaPorUF, regPorUF, maxDensidade],
  );

  const tooltip = useCallback(
    (uf: string): React.ReactNode => {
      const reg = regPorUF.get(uf);
      const nome = estadoDe(uf, reg);
      const clientes = reg?.clientes ?? 0;
      if (climaUtil) {
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
                <Linha rotulo="Sensacao" valor={fmtTemp(c.sensacao)} />
                <Linha
                  rotulo="Máx / mín"
                  valor={`${fmtTemp(c.tempMax)} / ${fmtTemp(c.tempMin)}`}
                />
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
                {c.atualizadoEm && (
                  <p className="flex items-center gap-1 pt-0.5 text-[11px] text-medio/50">
                    <Clock className="h-3 w-3" />
                    atualizado {fmtDesde(c.atualizadoEm, agora)}
                    {c.stale && (
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        · desatualizado
                      </span>
                    )}
                  </p>
                )}
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
    [climaUtil, climaPorUF, regPorUF, dias, agora],
  );

  // Ranking (top 10) pela metrica ativa.
  const ranking: ItemRanking[] = useMemo(() => {
    if (climaUtil) {
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
      .map((r) => ({
        uf: r.uf,
        valor: r.clientes,
        cor: corEscala(maxDensidade ? r.clientes / maxDensidade : 0, ESCALA_DENSIDADE),
      }))
      .filter((i) => i.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }, [climaUtil, clima, regioes, maxDensidade]);

  const distRegiao = useMemo(
    () =>
      (regioes?.porRegiao ?? []).map((r) => ({
        regiao: r.regiao,
        valor: r.clientes,
      })),
    [regioes],
  );

  // Melhores oportunidades (climatizador): top indice x presenca de clientes.
  const oportunidades = useMemo(() => {
    if (!climaUtil) return [];
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
  }, [climaUtil, clima, regPorUF]);

  // Min/max do indice (para os rotulos das pontas da legenda).
  const faixaIndice = useMemo(() => {
    const vals = (clima?.porUF ?? [])
      .filter((c) => !c.erro && c.indiceOportunidade != null)
      .map((c) => c.indiceOportunidade as number);
    if (!vals.length) return { min: 0, max: 100 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [clima]);

  const minAtualizado =
    clima?.atualizadoEm != null
      ? Math.max(0, Math.round((agora - new Date(clima.atualizadoEm).getTime()) / 60000))
      : null;

  const atualizando = carregandoClima;
  const emCooldown = agora < cooldownAte;
  const atualizar = async () => {
    if (atualizando || emCooldown) return;
    await carregarClima(dias, true);
    // Debounce: bloqueia novos refresh por ~60s (evita rajada na Open-Meteo).
    setCooldownAte(Date.now() + 60_000);
  };

  const rotuloMetrica = "Indice de oportunidade (clima)";

  return (
    <div className="space-y-4 p-6">
      {/* Cabecalho + filtros */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-escuro">Clima</h2>
          <p className="text-sm text-medio/60">
            Onde o clima favorece a venda de climatizador agora
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ehAdmin && (
            <SeletorVendedor
              valor={escopo}
              vendedores={agentes}
              onChange={setEscopo}
            />
          )}
          {/* Periodo do clima */}
          <div className="flex overflow-hidden rounded-lg border border-black/10">
            {([3, 7, 14, 16] as const).map((d) => (
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

          <button
            onClick={() => void atualizar()}
            disabled={atualizando || emCooldown}
            title={
              atualizando
                ? "Atualizando..."
                : emCooldown
                  ? "Atualizado agora — aguarde para atualizar de novo"
                  : "Buscar dados mais recentes"
            }
            className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-black/10 disabled:hover:text-medio"
          >
            {atualizando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {emCooldown && !atualizando ? "Atualizado" : "Atualizar"}
          </button>
        </div>
      </div>

      {/* Status do clima */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-medio/60">
        {minAtualizado != null && !erroClima && (
          <span>
            Clima atualizado{" "}
            {minAtualizado === 0 ? "agora" : `ha ${minAtualizado} min`} · fonte{" "}
            {clima?.fonte}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Info className="h-3 w-3" />O indice deriva do clima real (temperatura,
          umidade e chuva) — nao e indice meteorologico oficial.
        </span>
      </div>

      {/* Aviso de degradacao do clima */}
      {!climaUtil && !carregandoClima && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <CloudOff className="h-4 w-4 shrink-0" />
          Clima indisponivel no momento — mostrando densidade de clientes por
          estado. Tente novamente em instantes.
        </div>
      )}

      {/* Filtros de faixa: recolorem/atenuam o mapa */}
      {climaUtil && (
        <BarraFiltros
          filtros={filtros}
          onChange={setFiltros}
          contagens={contagens}
        />
      )}

      {/* Estado vazio honesto: escopo sem nenhum cliente (mesmo padrao do Mapa). */}
      {regioes && regioes.total.clientes === 0 && !carregandoReg && (
        <p className="flex items-center gap-1.5 text-xs text-medio/50">
          <Info className="h-3 w-3" />
          Nenhum cliente no seu escopo atual — o mapa mostra so o clima.
        </p>
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
                  onClickUF={setUfClientes}
                  dimUF={filtrosLigados ? dimUF : undefined}
                />
              )}
              {climaUtil ? (
                <LegendaGradiente
                  rotulo="Indice de oportunidade Sixxis (calor + seco + sem chuva) — nao meteorologico"
                  gradiente={gradienteCss(ESCALA_INDICE)}
                  min={String(faixaIndice.min)}
                  max={String(faixaIndice.max)}
                  icone={<ThermometerSun className="h-3.5 w-3.5" />}
                />
              ) : (
                <LegendaGradiente
                  rotulo="Densidade de clientes (dado interno)"
                  gradiente={gradienteCss(ESCALA_DENSIDADE)}
                  min="0"
                  max={`${maxDensidade} clientes`}
                  icone={<Users className="h-3.5 w-3.5" />}
                />
              )}
              <p className="mt-2 text-center text-[11px] text-medio/50">
                Clique num estado para ver os clientes de la.
              </p>
            </div>
          </Reveal>

          {/* Painel lateral: ranking + distribuicao */}
          <div className="space-y-4">
            <Reveal delay={60}>
              <RankingEstados
                titulo={
                  climaUtil
                    ? "Maiores indices de oportunidade"
                    : "Estados com mais clientes"
                }
                itens={ranking}
              />
            </Reveal>
            <Reveal delay={120}>
              <DistribuicaoRegiao
                dados={distRegiao}
                rotulo="Por clientes (dado interno)"
              />
            </Reveal>
          </div>
        </div>
      )}

      {/* Melhores oportunidades (climatizador) */}
      {climaUtil && oportunidades.length > 0 && (
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

      {/* Drawer de clientes do estado (clique no mapa) */}
      {ufClientes && (
        <PainelClientesEstado
          uf={ufClientes}
          escopo={escopo}
          onFechar={() => setUfClientes(null)}
          onAbrirNegocio={(id) => setNegocioId(id)}
          climatizador={climaUtil}
          resumoClima={climaPorUF.get(ufClientes)}
        />
      )}

      {/* Painel do negocio (reuso do Kanban) — abre por cima do drawer */}
      {negocioId && (
        <PainelNegocio
          negocioId={negocioId}
          papel={papel}
          agenteIdAtual={agenteId}
          agentes={agentes}
          etiquetas={etiquetas}
          etapas={etapas}
          onFechar={() => setNegocioId(null)}
          onAtualizado={() => undefined}
        />
      )}
    </div>
  );
}

// ---- auxiliares de UI ----

// Barra de filtros de faixa (multi-select). Cada chip alterna uma faixa; grupos
// ativos combinam em AND (dentro do grupo, OR).
type Contagens = Record<keyof FiltrosClima, Record<string, number>>;

function BarraFiltros({
  filtros,
  onChange,
  contagens,
}: {
  filtros: FiltrosClima;
  onChange: (f: FiltrosClima) => void;
  contagens: Contagens;
}) {
  const algum = algumFiltroAtivo(filtros);

  function alternar<K extends keyof FiltrosClima>(
    grupo: K,
    valor: FiltrosClima[K][number],
  ) {
    const atual = filtros[grupo] as string[];
    const proximo = atual.includes(valor as string)
      ? atual.filter((v) => v !== valor)
      : [...atual, valor as string];
    onChange({ ...filtros, [grupo]: proximo });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-black/5 bg-white px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-medio/70">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filtrar mapa
      </span>

      <GrupoFiltro
        titulo="Temperatura"
        opcoes={[
          { v: "alta", r: "Alta >30" },
          { v: "media", r: "Média 22-30" },
          { v: "baixa", r: "Baixa <22" },
        ]}
        ativos={filtros.temp}
        contagens={contagens.temp}
        onToggle={(v) => alternar("temp", v as FiltrosClima["temp"][number])}
      />
      <GrupoFiltro
        titulo="Umidade"
        opcoes={[
          { v: "alta", r: "Alta >70" },
          { v: "media", r: "Média 40-70" },
          { v: "baixa", r: "Baixa <40" },
        ]}
        ativos={filtros.umidade}
        contagens={contagens.umidade}
        onToggle={(v) => alternar("umidade", v as FiltrosClima["umidade"][number])}
      />
      <GrupoFiltro
        titulo="Chuva"
        opcoes={[
          { v: "com", r: "Com chuva" },
          { v: "sem", r: "Sem chuva" },
        ]}
        ativos={filtros.chuva}
        contagens={contagens.chuva}
        onToggle={(v) => alternar("chuva", v as FiltrosClima["chuva"][number])}
      />
      <GrupoFiltro
        titulo="Sensacao"
        opcoes={[
          { v: "alta", r: "Alta >32" },
          { v: "media", r: "Média 24-32" },
          { v: "baixa", r: "Baixa <24" },
        ]}
        ativos={filtros.sensacao}
        contagens={contagens.sensacao}
        onToggle={(v) =>
          alternar("sensacao", v as FiltrosClima["sensacao"][number])
        }
      />
      <GrupoFiltro
        titulo="Indice Sixxis"
        dica="Indice proprietario da Sixxis (calor + seco + sem chuva), nao meteorologico oficial."
        opcoes={[
          { v: "alto", r: "Alto ≥70" },
          { v: "medio", r: "Médio 40-69" },
          { v: "baixo", r: "Baixo <40" },
        ]}
        ativos={filtros.indice}
        contagens={contagens.indice}
        onToggle={(v) => alternar("indice", v as FiltrosClima["indice"][number])}
      />

      {algum && (
        <button
          onClick={() => onChange(FILTROS_VAZIO)}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-medio/70 transition-colors hover:bg-black/5 hover:text-escuro"
        >
          <X className="h-3.5 w-3.5" />
          Limpar filtros
        </button>
      )}
    </div>
  );
}

function GrupoFiltro({
  titulo,
  opcoes,
  ativos,
  onToggle,
  dica,
  contagens,
}: {
  titulo: string;
  opcoes: { v: string; r: string }[];
  ativos: string[];
  onToggle: (v: string) => void;
  dica?: string;
  // Quantos estados casam cada faixa (feedback nos chips). Opcional.
  contagens?: Record<string, number>;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        title={dica}
        className={`text-[11px] uppercase tracking-wide text-medio/50 ${
          dica ? "cursor-help underline decoration-dotted underline-offset-2" : ""
        }`}
      >
        {titulo}
      </span>
      <div className="flex flex-wrap gap-1">
        {opcoes.map((o) => {
          const on = ativos.includes(o.v);
          const qtd = contagens?.[o.v];
          return (
            <button
              key={o.v}
              onClick={() => onToggle(o.v)}
              aria-pressed={on}
              className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
                on
                  ? "border-tiffany bg-tiffany text-white"
                  : "border-black/10 bg-white text-medio hover:border-tiffany hover:text-tiffany"
              }`}
            >
              {o.r}
              {qtd != null && (
                <span className={on ? "opacity-80" : "text-medio/50"}>
                  {" "}
                  ({qtd})
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-medio/70">{rotulo}</span>
      <span className="font-medium text-escuro">{valor}</span>
    </div>
  );
}

// "há X min" / "há X h" / "há X d" a partir de um ISO e do relogio atual.
function fmtDesde(iso: string, agora: number): string {
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `ha ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `ha ${h} h`;
  return `ha ${Math.round(h / 24)} d`;
}

function fmtTemp(v: number | null): string {
  return v == null ? "—" : `${Math.round(v)}°C`;
}
function fmtPct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v)}%`;
}

