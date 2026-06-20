"use client";

// Admin > Agente IA: SOMENTE configuracao (sem inferencia nesta fase).
// Organizado em secoes: Ativacao, Horario de operacao, Comportamento, Handoff e
// Persona.
import { useState, useEffect, useCallback } from "react";
import { Loader2, Bot, Info } from "lucide-react";
import { Cabecalho, SkeletonTabela } from "./VendedoresAdmin";
import { EditorHorarios, type DiaHorario } from "./EditorHorarios";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";

type Config = {
  ativo: boolean;
  modelo: string;
  promptSistema: string | null;
  responderForaHorario: boolean;
  responderLeadNovo: boolean;
  handoffPalavras: string | null;
  opera24h: boolean;
  usarHorarioComercial: boolean;
  horarios: DiaHorario[];
  saudacaoAutomatica: string | null;
  segundosAntesDeResponder: number | null;
  maxMensagensAntesHandoff: number | null;
  mensagemHandoff: string | null;
  handoffSeClientePedir: boolean;
  handoffSeLeadQuente: boolean;
};

const MODELOS: { id: string; rotulo: string }[] = [
  { id: "claude-opus-4-8", rotulo: "Opus (mais capaz)" },
  { id: "claude-sonnet-4-6", rotulo: "Sonnet (equilibrado)" },
  { id: "claude-haiku-4-5", rotulo: "Haiku (rapido/barato)" },
];

export function IAAdmin() {
  const toast = useToast();
  const [config, setConfig] = useState<Config | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/admin/ia");
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
      const r = await fetch("/api/admin/ia", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (r.ok) {
        setConfig((await r.json()).config);
        toast.sucesso("Agente IA salvo");
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
      <Cabecalho titulo="Agente IA" subtitulo="Configuracao do atendente automatico" />

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-tiffany/20 bg-tiffany/5 p-3 text-sm text-medio">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-tiffany" />
        <span>
          Configuracao pronta; a ativacao da IA (execucao real) chega em breve. Por
          enquanto, nada e respondido automaticamente.
        </span>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Ativacao */}
        <Secao titulo="Ativacao">
          <Toggle
            titulo="Agente IA ativo"
            descricao="Habilita o atendente automatico (efetivo na proxima fatia)."
            valor={c.ativo}
            onChange={(v) => set({ ativo: v })}
            icone
          />
          <Toggle
            titulo="Responder lead novo"
            descricao="A IA inicia o atendimento de leads recem-chegados."
            valor={c.responderLeadNovo}
            onChange={(v) => set({ responderLeadNovo: v })}
          />
        </Secao>

        {/* Horario de operacao */}
        <Secao
          titulo="Horario de operacao"
          descricao="Quando a IA pode atender automaticamente."
        >
          <Toggle
            titulo="Operar 24 horas"
            descricao="A IA atende a qualquer momento."
            valor={c.opera24h}
            onChange={(v) => set({ opera24h: v })}
          />
          {!c.opera24h && (
            <>
              <Toggle
                titulo="Usar o horario comercial do CRM"
                descricao="Segue o horario configurado em Geral e horario."
                valor={c.usarHorarioComercial}
                onChange={(v) => set({ usarHorarioComercial: v })}
              />
              {!c.usarHorarioComercial && (
                <div>
                  <p className="mb-2 text-sm font-medium text-escuro">
                    Horario proprio da IA
                  </p>
                  <EditorHorarios
                    valor={c.horarios}
                    onChange={(h) => set({ horarios: h })}
                  />
                </div>
              )}
              <Toggle
                titulo="Responder fora do horario"
                descricao="A IA atende mesmo quando o atendimento estiver fechado."
                valor={c.responderForaHorario}
                onChange={(v) => set({ responderForaHorario: v })}
              />
            </>
          )}
        </Secao>

        {/* Comportamento */}
        <Secao titulo="Comportamento">
          <Cartao>
            <Rotulo>Saudacao automatica</Rotulo>
            <textarea
              value={c.saudacaoAutomatica ?? ""}
              onChange={(e) => set({ saudacaoAutomatica: e.target.value })}
              rows={2}
              placeholder="Ex.: Ola! Sou o atendente virtual da Sixxis. Como posso ajudar?"
              className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </Cartao>
          <Cartao>
            <Rotulo>Segundos antes de responder</Rotulo>
            <CampoNumero
              valor={c.segundosAntesDeResponder}
              onChange={(v) => set({ segundosAntesDeResponder: v })}
              placeholder="Ex.: 3"
              sufixo="segundos"
            />
            <p className="mt-1 text-xs text-medio/50">
              Pequena espera para parecer mais natural.
            </p>
          </Cartao>
        </Secao>

        {/* Handoff */}
        <Secao
          titulo="Handoff (passar para humano)"
          descricao="Quando a IA deve transferir o atendimento."
        >
          <Cartao>
            <Rotulo>Palavras de handoff</Rotulo>
            <input
              value={c.handoffPalavras ?? ""}
              onChange={(e) => set({ handoffPalavras: e.target.value })}
              placeholder="Ex.: humano, atendente, reclamacao (separadas por virgula)"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </Cartao>
          <Cartao>
            <Rotulo>Maximo de mensagens antes de transferir</Rotulo>
            <CampoNumero
              valor={c.maxMensagensAntesHandoff}
              onChange={(v) => set({ maxMensagensAntesHandoff: v })}
              placeholder="Ex.: 8"
              sufixo="mensagens"
            />
          </Cartao>
          <Toggle
            titulo="Transferir se o cliente pedir atendente"
            descricao="Passa para um humano quando o cliente solicitar."
            valor={c.handoffSeClientePedir}
            onChange={(v) => set({ handoffSeClientePedir: v })}
          />
          <Toggle
            titulo="Transferir se o lead estiver quente"
            descricao="Prioriza atendimento humano para leads quentes."
            valor={c.handoffSeLeadQuente}
            onChange={(v) => set({ handoffSeLeadQuente: v })}
          />
          <Cartao>
            <Rotulo>Mensagem ao transferir</Rotulo>
            <textarea
              value={c.mensagemHandoff ?? ""}
              onChange={(e) => set({ mensagemHandoff: e.target.value })}
              rows={2}
              placeholder="Ex.: Vou te passar para um de nossos atendentes, um momento."
              className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </Cartao>
        </Secao>

        {/* Persona */}
        <Secao titulo="Persona">
          <Cartao>
            <Rotulo>Prompt do sistema</Rotulo>
            <textarea
              value={c.promptSistema ?? ""}
              onChange={(e) => set({ promptSistema: e.target.value })}
              rows={5}
              placeholder="Ex.: Voce e o atendente da Sixxis. Seja cordial, objetivo..."
              className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </Cartao>
          <Cartao>
            <Rotulo>Modelo</Rotulo>
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

function CampoNumero({
  valor,
  onChange,
  placeholder,
  sufixo,
}: {
  valor: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  sufixo?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        value={valor ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))
        }
        placeholder={placeholder}
        className="w-32 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
      />
      {sufixo && <span className="text-sm text-medio/60">{sufixo}</span>}
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
        role="switch"
        aria-checked={valor}
        aria-label={titulo}
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
