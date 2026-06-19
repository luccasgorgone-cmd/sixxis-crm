"use client";

// Admin > Agente IA: SOMENTE configuracao (sem inferencia nesta fase).
import { useState, useEffect, useCallback } from "react";
import { Loader2, Bot, Info } from "lucide-react";
import { Cabecalho, SkeletonTabela } from "./VendedoresAdmin";

type Config = {
  ativo: boolean;
  modelo: string;
  promptSistema: string | null;
  responderForaHorario: boolean;
  responderLeadNovo: boolean;
  handoffPalavras: string | null;
};

const MODELOS: { id: string; rotulo: string }[] = [
  { id: "claude-opus-4-8", rotulo: "Opus (mais capaz)" },
  { id: "claude-sonnet-4-6", rotulo: "Sonnet (equilibrado)" },
  { id: "claude-haiku-4-5", rotulo: "Haiku (rapido/barato)" },
];

export function IAAdmin() {
  const [config, setConfig] = useState<Config | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/admin/ia");
    if (r.ok) setConfig((await r.json()).config);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar() {
    if (!config) return;
    setSalvando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/admin/ia", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (r.ok) {
        setConfig((await r.json()).config);
        setAviso("Configuracao salva.");
      } else {
        const d = await r.json().catch(() => null);
        setAviso(
          d?.erro ? `Erro: ${d.erro}` : "Nao foi possivel salvar a configuracao.",
        );
      }
    } catch {
      setAviso("Falha de rede ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando || !config) {
    return (
      <div className="p-6">
        <SkeletonTabela />
      </div>
    );
  }

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Agente IA"
        subtitulo="Configuracao do atendente automatico"
      />

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-tiffany/20 bg-tiffany/5 p-3 text-sm text-medio">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-tiffany" />
        <span>
          Configuracao pronta; a ativacao da IA (execucao real) chega em breve.
          Por enquanto, nada e respondido automaticamente.
        </span>
      </div>

      <div className="max-w-2xl space-y-4">
        <Toggle
          titulo="Agente IA ativo"
          descricao="Habilita o atendente automatico (efetivo na proxima fatia)."
          valor={config.ativo}
          onChange={(v) => setConfig({ ...config, ativo: v })}
          icone
        />

        <div className="rounded-xl border border-black/5 bg-white p-4">
          <label className="mb-1 block text-sm font-medium text-escuro">
            Modelo
          </label>
          <select
            value={config.modelo}
            onChange={(e) => setConfig({ ...config, modelo: e.target.value })}
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
          >
            {MODELOS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-black/5 bg-white p-4">
          <label className="mb-1 block text-sm font-medium text-escuro">
            Prompt do sistema
          </label>
          <textarea
            value={config.promptSistema ?? ""}
            onChange={(e) =>
              setConfig({ ...config, promptSistema: e.target.value })
            }
            rows={5}
            placeholder="Ex.: Voce e o atendente da Sixxis. Seja cordial, objetivo..."
            className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
          />
        </div>

        <Toggle
          titulo="Responder fora do horario"
          descricao="A IA atende quando o CRM estiver fechado."
          valor={config.responderForaHorario}
          onChange={(v) => setConfig({ ...config, responderForaHorario: v })}
        />
        <Toggle
          titulo="Responder lead novo"
          descricao="A IA inicia o atendimento de leads recem-chegados."
          valor={config.responderLeadNovo}
          onChange={(v) => setConfig({ ...config, responderLeadNovo: v })}
        />

        <div className="rounded-xl border border-black/5 bg-white p-4">
          <label className="mb-1 block text-sm font-medium text-escuro">
            Palavras de handoff (passar para humano)
          </label>
          <input
            value={config.handoffPalavras ?? ""}
            onChange={(e) =>
              setConfig({ ...config, handoffPalavras: e.target.value })
            }
            placeholder="Ex.: humano, atendente, reclamacao (separadas por virgula)"
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void salvar()}
            disabled={salvando}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
          {aviso && <span className="text-sm text-medio/60">{aviso}</span>}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  titulo,
  descricao,
  valor,
  onChange,
  icone = false,
}: {
  titulo: string;
  descricao: string;
  valor: boolean;
  onChange: (v: boolean) => void;
  icone?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-black/5 bg-white p-4">
      <div className="flex items-center gap-2">
        {icone && <Bot className="h-5 w-5 text-tiffany" />}
        <div>
          <p className="text-sm font-medium text-escuro">{titulo}</p>
          <p className="text-xs text-medio/60">{descricao}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!valor)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          valor ? "bg-tiffany" : "bg-black/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            valor ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
