"use client";

// Admin > Alertas de SLA: configura o tempo maximo (minutos) que um negocio pode
// ficar em cada etapa antes de alertar o dono, SEPARADO por Venda e Pos-venda.
// Ativar/desativar e escolher o som (com previa). Salva por (finalidade, etapa).
import { useState, useEffect, useCallback } from "react";
import { Play, Loader2, Save } from "lucide-react";
import { Cabecalho, SkeletonTabela } from "./VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";
import { SONS_ALERTA, SOM_PADRAO, arquivoSom } from "@/lib/sons";

type Etapa = { id: string; nome: string; ordem: number; finalidade: string };
type Config = {
  id: string;
  finalidade: "VENDA" | "POS_VENDA";
  etapaId: string;
  minutosParaAlerta: number;
  ativo: boolean;
  som: string | null;
};

type Finalidade = "VENDA" | "POS_VENDA";

function etapasDoFunil(etapas: Etapa[], f: Finalidade): Etapa[] {
  return etapas.filter((e) => e.finalidade === f || e.finalidade === "AMBAS");
}

function tocar(som: string | null) {
  try {
    const a = new Audio(arquivoSom(som));
    a.volume = 0.6;
    void a.play().catch(() => undefined);
  } catch {
    /* ignora */
  }
}

export function AlertasAdmin() {
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/alertas");
      if (r.ok) {
        const d = await r.json();
        setEtapas(d.etapas ?? []);
        setConfigs(d.configs ?? []);
        setErro(false);
      } else {
        setErro(true);
      }
    } catch {
      setErro(true);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function configDe(f: Finalidade, etapaId: string): Config | undefined {
    return configs.find((c) => c.finalidade === f && c.etapaId === etapaId);
  }

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Alertas de SLA"
        subtitulo="Tempo maximo (min) por etapa antes de alertar o dono. Separado por Venda e Pos-venda. Negocios parados alem do tempo mostram selo e tocam o som ate a acao."
      />

      {carregando ? (
        <SkeletonTabela />
      ) : erro ? (
        <EstadoErro mensagem="Nao foi possivel carregar." onRetry={() => void carregar()} />
      ) : (
        <div className="space-y-8">
          {(["VENDA", "POS_VENDA"] as Finalidade[]).map((f) => {
            const lista = etapasDoFunil(etapas, f);
            return (
              <section key={f}>
                <h3 className="mb-3 text-sm font-semibold text-escuro">
                  {f === "VENDA" ? "Venda" : "Pos-venda"}
                </h3>
                {lista.length === 0 ? (
                  <p className="text-sm text-medio/50">Nenhuma etapa neste funil.</p>
                ) : (
                  <div className="space-y-2">
                    {lista.map((etapa) => (
                      <LinhaConfig
                        key={`${f}:${etapa.id}`}
                        finalidade={f}
                        etapa={etapa}
                        config={configDe(f, etapa.id)}
                        onSalvo={() => void carregar()}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LinhaConfig({
  finalidade,
  etapa,
  config,
  onSalvo,
}: {
  finalidade: Finalidade;
  etapa: Etapa;
  config: Config | undefined;
  onSalvo: () => void;
}) {
  const toast = useToast();
  const [minutos, setMinutos] = useState(
    config ? String(config.minutosParaAlerta) : "",
  );
  const [ativo, setAtivo] = useState(config?.ativo ?? true);
  const [som, setSom] = useState(config?.som ?? SOM_PADRAO);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const m = Number(minutos);
    if (!Number.isFinite(m) || m < 1) {
      toast.erro("Informe os minutos (>= 1).");
      return;
    }
    setSalvando(true);
    const r = await fetch("/api/admin/alertas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        finalidade,
        etapaId: etapa.id,
        minutosParaAlerta: m,
        ativo,
        som,
      }),
    });
    setSalvando(false);
    if (r.ok) {
      toast.sucesso("Alerta salvo");
      onSalvo();
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel salvar.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-black/5 bg-white p-3">
      <span className="min-w-40 flex-1 text-sm font-medium text-escuro">
        {etapa.nome}
      </span>

      <label className="flex items-center gap-1.5 text-xs text-medio/70">
        Alertar apos
        <input
          type="number"
          min={1}
          value={minutos}
          onChange={(e) => setMinutos(e.target.value)}
          placeholder="min"
          className="w-20 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-tiffany"
        />
        min
      </label>

      <select
        value={som}
        onChange={(e) => setSom(e.target.value)}
        className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-tiffany"
      >
        {SONS_ALERTA.map((s) => (
          <option key={s.valor} value={s.valor}>
            {s.rotulo}
          </option>
        ))}
      </select>
      <button
        onClick={() => tocar(som)}
        title="Ouvir previa"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 text-medio hover:bg-black/5"
      >
        <Play className="h-4 w-4" />
      </button>

      <button
        onClick={() => setAtivo((v) => !v)}
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          ativo ? "bg-green-100 text-green-700" : "bg-black/10 text-medio/60"
        }`}
      >
        {ativo ? "Ativo" : "Inativo"}
      </button>

      <button
        onClick={() => void salvar()}
        disabled={salvando}
        className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
      >
        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar
      </button>
    </div>
  );
}
