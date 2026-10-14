"use client";

// Aba CONFIGURAÇÕES do Supervisor: o gestor vê e edita os parâmetros que antes
// eram fixos no código (prazos, limiares, metas do semáforo, pesos de cobertura)
// e liga/ajusta a varredura periódica. Lê de GET /config, grava em PUT /config
// (que valida faixas no servidor e registra a mudança para auditoria/undo). A IA
// edita os MESMOS campos pelo chat; aqui é o caminho manual.
import { useState, useEffect, useCallback } from "react";
import { SlidersHorizontal, Radar, Target, Save, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { EstadoErro } from "@/components/ui/Estado";
import { Secao } from "./PainelPartes";
import type {
  ConfigEditavel,
  ItensVigiados,
  CortesSemaforo,
} from "@/lib/supervisor/tipos";

const ROTULO_META: Record<string, string> = {
  pct_dentro_prazo_1a_resposta: "% 1ª resposta no prazo",
  conversao: "Conversão",
  cobertura_funil: "Cobertura de funil",
  sem_proximo_passo: "% sem próximo passo",
  tempo_1a_resposta_seg: "Tempo 1ª resposta (s)",
  ticket_medio: "Ticket médio",
};

const ROTULO_VIGIA: Record<keyof ItensVigiados, string> = {
  semResposta: "Cliente sem resposta",
  semProximoPasso: "Sem próximo passo",
  parado: "Parado além do limiar",
  primeiraResposta: "1ª resposta estourada",
};

function Campo({
  rotulo,
  children,
  dica,
}: {
  rotulo: string;
  children: React.ReactNode;
  dica?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-medio">{rotulo}</span>
      {children}
      {dica && <span className="text-[11px] text-medio/50">{dica}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-escuro outline-none transition-colors focus:border-tiffany tabular-nums";

export function PainelConfiguracoes() {
  const toast = useToast();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  // Estado editável (strings nos numéricos para permitir campo vazio).
  const [ativa, setAtiva] = useState(false);
  const [cadenciaMin, setCadenciaMin] = useState("30");
  const [semRespostaHoras, setSemRespostaHoras] = useState("4");
  const [vigia, setVigia] = useState<ItensVigiados>({
    semResposta: true,
    semProximoPasso: true,
    parado: true,
    primeiraResposta: true,
  });
  const [prazoMin, setPrazoMin] = useState("60");
  const [paradoDias, setParadoDias] = useState("7");
  const [metaReais, setMetaReais] = useState("");
  const [pesoQuente, setPesoQuente] = useState("0.8");
  const [pesoMorno, setPesoMorno] = useState("0.5");
  const [pesoFrio, setPesoFrio] = useState("0.2");
  const [metas, setMetas] = useState<Record<string, CortesSemaforo>>({});

  const popular = useCallback((c: ConfigEditavel) => {
    setPrazoMin(String(Math.round(c.limiares.prazo1aRespostaSeg / 60)));
    setParadoDias(String(c.limiares.paradoDiasPadrao));
    setMetaReais(c.limiares.metaPeriodoReais == null ? "" : String(c.limiares.metaPeriodoReais));
    setPesoQuente(String(c.limiares.pesosCobertura.QUENTE));
    setPesoMorno(String(c.limiares.pesosCobertura.MORNO));
    setPesoFrio(String(c.limiares.pesosCobertura.FRIO));
    setMetas(c.limiares.metas);
    setAtiva(c.varredura.ativa);
    setCadenciaMin(String(c.varredura.cadenciaMin));
    setSemRespostaHoras(String(c.varredura.semRespostaHoras));
    setVigia(c.varredura.vigia);
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    try {
      const r = await fetch("/api/admin/supervisor/config");
      if (!r.ok) {
        setErro(true);
        return;
      }
      popular((await r.json()) as ConfigEditavel);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [popular]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar() {
    if (salvando) return;
    setSalvando(true);
    setErroSalvar(null);
    const corpo = {
      limiares: {
        prazo1aRespostaSeg: Math.round(Number(prazoMin) * 60),
        paradoDiasPadrao: Number(paradoDias),
        metaPeriodoReais: metaReais.trim() === "" ? null : Number(metaReais),
        pesosCobertura: {
          QUENTE: Number(pesoQuente),
          MORNO: Number(pesoMorno),
          FRIO: Number(pesoFrio),
        },
        metas,
      },
      varredura: {
        ativa,
        cadenciaMin: Number(cadenciaMin),
        semRespostaHoras: Number(semRespostaHoras),
        vigia,
      },
    };
    try {
      const r = await fetch("/api/admin/supervisor/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const resp = (await r.json().catch(() => null)) as
        | { ok?: boolean; erro?: string; config?: ConfigEditavel }
        | null;
      if (!r.ok || !resp?.ok) {
        setErroSalvar(resp?.erro ?? "Não foi possível salvar. Revise os valores.");
        return;
      }
      if (resp.config) popular(resp.config);
      toast.sucesso("Configuração salva.");
    } catch {
      setErroSalvar("Falha de conexão ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (erro) {
    return <EstadoErro mensagem="Não foi possível carregar a configuração." onRetry={() => void carregar()} />;
  }
  if (carregando) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-40 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      {/* Varredura */}
      <Secao titulo="Varredura periódica" icone={Radar}>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-escuro">
              Varredura ligada
              <span className="ml-2 text-xs text-medio/60">
                examina os atendimentos de tempos em tempos e abre alertas
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={ativa}
              onClick={() => setAtiva((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${ativa ? "bg-tiffany" : "bg-black/15"}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${ativa ? "translate-x-5" : "translate-x-0.5"}`}
              />
            </button>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Cadência (min)" dica="5 a 1440">
              <input className={inputCls} type="number" min={5} max={1440} value={cadenciaMin} onChange={(e) => setCadenciaMin(e.target.value)} />
            </Campo>
            <Campo rotulo="Horas sem resposta" dica="1 a 168">
              <input className={inputCls} type="number" min={1} max={168} value={semRespostaHoras} onChange={(e) => setSemRespostaHoras(e.target.value)} />
            </Campo>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-medio">O que vigiar</span>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(ROTULO_VIGIA) as (keyof ItensVigiados)[]).map((k) => (
                <label key={k} className="flex items-center gap-2 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-sm text-escuro">
                  <input
                    type="checkbox"
                    checked={vigia[k]}
                    onChange={(e) => setVigia((v) => ({ ...v, [k]: e.target.checked }))}
                    className="h-4 w-4 accent-tiffany"
                  />
                  {ROTULO_VIGIA[k]}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Secao>

      {/* Prazos & limiares */}
      <Secao titulo="Prazos & limiares" icone={SlidersHorizontal}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Campo rotulo="Prazo 1ª resposta (min)" dica="meta de velocidade">
            <input className={inputCls} type="number" min={1} value={prazoMin} onChange={(e) => setPrazoMin(e.target.value)} />
          </Campo>
          <Campo rotulo='Dias para "parado"' dica="1 a 365">
            <input className={inputCls} type="number" min={1} max={365} value={paradoDias} onChange={(e) => setParadoDias(e.target.value)} />
          </Campo>
          <Campo rotulo="Meta do período (R$)" dica="vazio = sem meta">
            <input className={inputCls} type="number" min={0} value={metaReais} onChange={(e) => setMetaReais(e.target.value)} placeholder="sem meta" />
          </Campo>
        </div>
      </Secao>

      {/* Pesos de cobertura */}
      <Secao titulo="Pesos de cobertura" icone={Target}>
        <div className="grid grid-cols-3 gap-3">
          <Campo rotulo="Quente" dica="0 a 1">
            <input className={inputCls} type="number" step={0.1} min={0} max={1} value={pesoQuente} onChange={(e) => setPesoQuente(e.target.value)} />
          </Campo>
          <Campo rotulo="Morno" dica="0 a 1">
            <input className={inputCls} type="number" step={0.1} min={0} max={1} value={pesoMorno} onChange={(e) => setPesoMorno(e.target.value)} />
          </Campo>
          <Campo rotulo="Frio" dica="0 a 1">
            <input className={inputCls} type="number" step={0.1} min={0} max={1} value={pesoFrio} onChange={(e) => setPesoFrio(e.target.value)} />
          </Campo>
        </div>
      </Secao>

      {/* Metas do semáforo (avançado) */}
      <details className="rounded-2xl border border-black/5 bg-white">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-escuro">
          Metas do semáforo (avançado)
        </summary>
        <div className="space-y-2 border-t border-black/5 p-4">
          {Object.entries(metas).map(([chave, corte]) => (
            <div key={chave} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <span className="truncate text-sm text-escuro">{ROTULO_META[chave] ?? chave}</span>
              <input
                aria-label={`${chave} verde`}
                className={`${inputCls} w-24`}
                type="number"
                value={corte.verde}
                onChange={(e) => setMetas((m) => ({ ...m, [chave]: { ...m[chave], verde: Number(e.target.value) } }))}
              />
              <input
                aria-label={`${chave} amarelo`}
                className={`${inputCls} w-24`}
                type="number"
                value={corte.amarelo}
                onChange={(e) => setMetas((m) => ({ ...m, [chave]: { ...m[chave], amarelo: Number(e.target.value) } }))}
              />
            </div>
          ))}
          <p className="pt-1 text-[11px] text-medio/50">
            Cada indicador: corte verde e corte amarelo. A direção (maior ou menor
            é melhor) é fixa por indicador.
          </p>
        </div>
      </details>

      {/* Salvar */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => void salvar()}
          disabled={salvando}
          className="flex items-center gap-1.5 rounded-lg bg-tiffany px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-50"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar configuração
        </button>
        {erroSalvar && <span className="text-sm text-erro">{erroSalvar}</span>}
      </div>
    </div>
  );
}
