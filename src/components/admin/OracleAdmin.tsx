"use client";

// Admin > Oracle: configuracao do agente de inteligencia de gestao. Modelo,
// orientacoes extras e base de conhecimento. As TRAVAS de seguranca e o escopo
// por usuario ficam FIXAS no codigo (nao editaveis aqui).
import { useState, useEffect, useCallback } from "react";
import { Loader2, Sparkles, Info, ShieldCheck } from "lucide-react";
import { Cabecalho, SkeletonTabela } from "./VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";

type Config = {
  ativo: boolean;
  modelo: string;
  promptSistema: string | null;
  baseConhecimento: string | null;
};

const MODELOS: { id: string; rotulo: string }[] = [
  { id: "claude-opus-4-8", rotulo: "Opus (mais capaz)" },
  { id: "claude-sonnet-4-6", rotulo: "Sonnet (equilibrado)" },
  { id: "claude-haiku-4-5", rotulo: "Haiku (rapido/barato)" },
];

export function OracleAdmin() {
  const toast = useToast();
  const [config, setConfig] = useState<Config | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/admin/oracle");
      if (r.ok) {
        setConfig((await r.json()).config);
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

  async function salvar() {
    if (!config) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/admin/oracle", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (r.ok) {
        setConfig((await r.json()).config);
        toast.sucesso("Oracle salvo");
      } else {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel salvar.");
      }
    } catch {
      toast.erro("Nao foi possivel salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="p-6">
        <SkeletonTabela />
      </div>
    );
  }
  if (erro || !config) {
    return (
      <div className="p-6">
        <EstadoErro mensagem="Nao foi possivel carregar." onRetry={() => void carregar()} />
      </div>
    );
  }

  const c = config;
  const set = (patch: Partial<Config>) => setConfig({ ...c, ...patch });

  return (
    <div className="p-6">
      <Cabecalho titulo="Oracle" subtitulo="Agente de inteligencia de gestao" />

      {/* Nota de seguranca: o que e fixo (nao editavel). */}
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-tiffany/20 bg-tiffany/5 p-3 text-sm text-medio">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-tiffany" />
        <span>
          As travas de seguranca (so leitura) e o escopo por usuario (cada um so ve
          os proprios dados) sao fixos no codigo. Aqui voce ajusta o modelo, o
          estilo e o que o Oracle sabe sobre a empresa — isso COMPLEMENTA, nunca
          sobrepoe as travas.
        </span>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Ativacao */}
        <Secao titulo="Ativacao">
          <Toggle
            titulo="Oracle ativo"
            descricao="Quando desligado, o Oracle responde que esta indisponivel."
            valor={c.ativo}
            onChange={(v) => set({ ativo: v })}
            icone
          />
        </Secao>

        {/* Modelo */}
        <Secao titulo="Modelo">
          <Cartao>
            <Rotulo>Modelo de IA</Rotulo>
            <select
              value={c.modelo}
              onChange={(e) => set({ modelo: e.target.value })}
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            >
              {MODELOS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-medio/50">
              Opus e mais capaz para analises complexas; Sonnet equilibra custo e
              qualidade; Haiku e o mais rapido/barato.
            </p>
          </Cartao>
        </Secao>

        {/* Orientacoes extras */}
        <Secao
          titulo="Orientacoes adicionais"
          descricao="Estilo e enfase que o Oracle deve seguir (complementa a persona; nao sobrepoe as travas)."
        >
          <Cartao>
            <Rotulo>Instrucoes de estilo</Rotulo>
            <textarea
              value={c.promptSistema ?? ""}
              onChange={(e) => set({ promptSistema: e.target.value })}
              rows={5}
              placeholder="Ex.: Sempre destaque a variacao vs. o periodo anterior. Priorize recomendacoes acionaveis."
              className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </Cartao>
        </Secao>

        {/* Base de conhecimento */}
        <Secao
          titulo="Base de conhecimento da empresa"
          descricao="O que o Oracle deve saber sobre a Sixxis (metas, sazonalidade, produtos, politicas)."
        >
          <Cartao>
            <div className="mb-2 flex items-start gap-1 text-xs text-medio/60">
              <Info className="mt-0.5 h-3 w-3 shrink-0 text-tiffany" />
              O Oracle usa isto como contexto — NAO inventa numeros. Dados vem sempre
              das consultas reais, no escopo do usuario.
            </div>
            <textarea
              value={c.baseConhecimento ?? ""}
              onChange={(e) => set({ baseConhecimento: e.target.value })}
              rows={10}
              placeholder="Ex.: Alta temporada de climatizadores e de setembro a marco. Ticket medio saudavel acima de R$ ..."
              className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </Cartao>
        </Secao>

        <div className="sticky bottom-0 -mx-6 flex items-center gap-3 border-t border-black/5 bg-fundo px-6 py-3">
          <button
            onClick={() => void salvar()}
            disabled={salvando}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar configuracao
          </button>
        </div>
      </div>
    </div>
  );
}

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-escuro">{titulo}</h3>
      {descricao && <p className="mb-2 text-xs text-medio/60">{descricao}</p>}
      <div className={descricao ? "space-y-3" : "mt-2 space-y-3"}>{children}</div>
    </section>
  );
}

function Cartao({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-4">{children}</div>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-sm font-medium text-escuro">{children}</label>
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
        {icone && <Sparkles className="h-5 w-5 text-tiffany" />}
        <div>
          <p className="text-sm font-medium text-escuro">{titulo}</p>
          <p className="text-xs text-medio/60">{descricao}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!valor)}
        role="switch"
        aria-checked={valor}
        aria-label={titulo}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          valor ? "bg-tiffany" : "bg-black/15"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            valor ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
