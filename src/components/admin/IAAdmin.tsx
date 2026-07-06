"use client";

// Admin > Agente IA: SOMENTE configuracao (sem inferencia nesta fase).
// Organizado em secoes: Ativacao, Horario de operacao, Comportamento, Handoff e
// Persona.
import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Bot,
  Info,
  ListTree,
  AlertTriangle,
  Clock,
  Power,
  Check,
} from "lucide-react";
import { Cabecalho, SkeletonTabela } from "./VendedoresAdmin";
import { EditorHorarios, type DiaHorario } from "./EditorHorarios";
import { SandboxLuna } from "./SandboxLuna";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";

type Config = {
  ativo: boolean;
  modelo: string;
  promptSistema: string | null;
  baseConhecimento: string | null;
  // Somente leitura (vem do GET): template para popular a base de conhecimento.
  templateBaseConhecimento?: string;
  responderForaHorario: boolean;
  responderLeadNovo: boolean;
  handoffPalavras: string | null;
  opera24h: boolean;
  usarHorarioComercial: boolean;
  horarios: DiaHorario[];
  saudacaoAutomatica: string | null;
  segundosAntesDeResponder: number | null;
  segundosEntreMensagens: number | null;
  maxMensagensAntesHandoff: number | null;
  mensagemHandoff: string | null;
  handoffSeClientePedir: boolean;
  handoffSeLeadQuente: boolean;
  cupomPrimeiraCompra: string | null;
  cupomDescricao: string | null;
  cupomAtivo: boolean;
  atendeVenda: boolean;
  atendePosVenda: boolean;
  instanciasAtendidas: string[] | null;
};

type InstanciaSol = {
  id: string;
  nome: string;
  numero: string | null;
  finalidade: "VENDA" | "POS_VENDA";
};

const MODELOS: { id: string; rotulo: string }[] = [
  { id: "claude-opus-4-8", rotulo: "Opus (mais capaz)" },
  { id: "claude-sonnet-4-6", rotulo: "Sonnet (equilibrado)" },
  { id: "claude-haiku-4-5", rotulo: "Haiku (rapido/barato)" },
];

// Resumo do horario comercial vigente (da ConfiguracaoCRM), so leitura.
type HorarioCRM = { horarios: DiaHorario[]; abertoAgora: boolean };
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

// "09:00-18:00" por dia aberto, agrupado; dias fechados omitidos.
function resumoHorario(horarios: DiaHorario[]): string {
  const partes = horarios
    .filter((h) => h.aberto && h.faixas.length > 0)
    .map(
      (h) =>
        `${DIAS_CURTOS[h.dia]} ${h.faixas
          .map((f) => `${f.inicio}-${f.fim}`)
          .join(", ")}`,
    );
  return partes.length ? partes.join(" · ") : "Nenhum dia aberto configurado";
}

export function IAAdmin() {
  const toast = useToast();
  const [config, setConfig] = useState<Config | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // Resumo do horario comercial vigente (so leitura, para o painel de controle).
  const [horarioCRM, setHorarioCRM] = useState<HorarioCRM | null>(null);
  // Numeros (instancias) ativos, para escolher quais a Sol atende.
  const [instancias, setInstancias] = useState<InstanciaSol[]>([]);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.config?.horarios) {
          setHorarioCRM({
            horarios: d.config.horarios as DiaHorario[],
            abertoAgora: Boolean(d.abertoAgora),
          });
        }
      })
      .catch(() => undefined);
    fetch("/api/instancias")
      .then((r) => (r.ok ? r.json() : { instancias: [] }))
      .then((d) => setInstancias(d.instancias ?? []))
      .catch(() => undefined);
  }, []);

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

  // Marca/desmarca uma instancia na lista de numeros atendidos pela Sol.
  const alternarInstancia = (id: string) => {
    const atual = c.instanciasAtendidas ?? [];
    const nova = atual.includes(id)
      ? atual.filter((x) => x !== id)
      : [...atual, id];
    set({ instanciasAtendidas: nova });
  };

  return (
    <div className="p-6">
      <Cabecalho titulo="Agente IA" subtitulo="Configuracao do atendente automatico" />

      {/* Painel de controle da Luna: liga/desliga o atendimento REAL + gatilho. */}
      <div className="mb-6 max-w-2xl">
        <div
          className={`rounded-2xl border p-4 ${
            c.ativo
              ? "border-tiffany/40 bg-tiffany/5"
              : "border-black/10 bg-white"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  c.ativo ? "bg-tiffany/15 text-tiffany" : "bg-black/5 text-medio"
                }`}
              >
                <Bot className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-escuro">
                  Sol no WhatsApp
                </p>
                <p className="text-xs text-medio/60">
                  Atendimento automatico com clientes reais.
                </p>
              </div>
            </div>
            <span
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                c.ativo
                  ? "bg-tiffany/15 text-tiffany"
                  : "bg-black/5 text-medio/70"
              }`}
            >
              <Power className="h-3.5 w-3.5" />
              {c.ativo ? "Ativa" : "Inativa"}
            </span>
          </div>

          {/* Aviso forte antes de ativar. */}
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Ao ativar, a Sol passa a responder clientes reais fora do horario
              comercial (ou a qualquer hora, se &quot;atende direto&quot; estiver
              ligado). Deixe desligada ate ter certeza.
            </span>
          </div>

          {/* Toggle mestre. */}
          <div className="mt-3">
            <Toggle
              titulo="Sol ativa (responder clientes reais)"
              descricao="Liga/desliga o atendimento automatico no WhatsApp."
              valor={c.ativo}
              onChange={(v) => set({ ativo: v })}
              icone
            />
          </div>

          {/* Resumo do gatilho. */}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <InfoCard
              rotulo="Quando responde"
              valor={
                c.opera24h ? "A qualquer hora (direto)" : "So fora do horario"
              }
            />
            <InfoCard
              rotulo="Ritmo"
              valor={`${c.segundosAntesDeResponder ?? 5}s antes · ${c.segundosEntreMensagens ?? 3}s entre`}
            />
            <InfoCard
              rotulo="Estado agora"
              valor={
                horarioCRM
                  ? horarioCRM.abertoAgora
                    ? "Dentro do horario"
                    : "Fora do horario"
                  : "—"
              }
            />
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-medio/60">
            <Clock className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Horario comercial:{" "}
              {horarioCRM ? resumoHorario(horarioCRM.horarios) : "carregando..."}
            </span>
          </p>
        </div>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Ativacao (o liga/desliga mestre fica no painel de controle acima). */}
        <Secao titulo="Ativacao">
          <Toggle
            titulo="Responder lead novo"
            descricao="A IA inicia o atendimento de leads recem-chegados."
            valor={c.responderLeadNovo}
            onChange={(v) => set({ responderLeadNovo: v })}
          />
        </Secao>

        {/* O que a Sol atende: setores + numeros (alem das travas ativo/horario). */}
        <Secao
          titulo="O que a Sol atende"
          descricao="Escolha os setores e numeros que a Sol atende. As travas de ativa e horario continuam valendo."
        >
          <Toggle
            titulo="Atende Venda"
            descricao="A Sol responde conversas do setor de Venda."
            valor={c.atendeVenda}
            onChange={(v) => set({ atendeVenda: v })}
          />
          <Toggle
            titulo="Atende Pos-venda"
            descricao="A Sol responde conversas do setor de Pos-venda."
            valor={c.atendePosVenda}
            onChange={(v) => set({ atendePosVenda: v })}
          />

          {(["VENDA", "POS_VENDA"] as const).map((fin) => {
            const habilitado =
              fin === "VENDA" ? c.atendeVenda : c.atendePosVenda;
            if (!habilitado) return null;
            const doSetor = instancias.filter((i) => i.finalidade === fin);
            if (doSetor.length === 0) return null;
            return (
              <Cartao key={fin}>
                <Rotulo>
                  {fin === "VENDA" ? "Numeros de Venda" : "Numeros de Pos-venda"}
                </Rotulo>
                <p className="mb-2 flex items-start gap-1 text-xs text-medio/60">
                  <Info className="mt-0.5 h-3 w-3 shrink-0 text-tiffany" />
                  Nenhum marcado = a Sol atende TODOS os numeros deste setor.
                </p>
                <div className="space-y-1.5">
                  {doSetor.map((i) => {
                    const marcado = (c.instanciasAtendidas ?? []).includes(i.id);
                    return (
                      <button
                        key={i.id}
                        onClick={() => alternarInstancia(i.id)}
                        aria-pressed={marcado}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-left transition-colors hover:bg-fundo"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-escuro">
                            {i.nome}
                          </span>
                          {i.numero && (
                            <span className="block truncate text-xs text-medio/60">
                              {i.numero}
                            </span>
                          )}
                        </span>
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                            marcado
                              ? "border-tiffany bg-tiffany text-white"
                              : "border-black/15 bg-white text-transparent"
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Cartao>
            );
          })}
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
              placeholder="Ex.: 5"
              sufixo="segundos"
            />
            <p className="mt-1 text-xs text-medio/50">
              Espera antes da 1a mensagem, para parecer mais natural (padrao 5s).
            </p>
          </Cartao>
          <Cartao>
            <Rotulo>Segundos entre mensagens</Rotulo>
            <CampoNumero
              valor={c.segundosEntreMensagens}
              onChange={(v) => set({ segundosEntreMensagens: v })}
              placeholder="Ex.: 3"
              sufixo="segundos"
            />
            <p className="mt-1 text-xs text-medio/50">
              Intervalo entre cada bolha quando responde em varias mensagens
              (padrao 3s).
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

        {/* Base de conhecimento de produtos */}
        <Secao
          titulo="Base de conhecimento de produtos"
          descricao="O que a Sol sabe sobre os produtos para vender e atender bem."
        >
          <Cartao>
            <div className="mb-1 flex items-center justify-between gap-2">
              <Rotulo>Descricoes, diferencas e recomendacao por area</Rotulo>
              {!(c.baseConhecimento ?? "").trim() && c.templateBaseConhecimento && (
                <button
                  onClick={() =>
                    set({ baseConhecimento: c.templateBaseConhecimento ?? "" })
                  }
                  className="rounded-md border border-black/10 px-2 py-1 text-xs font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany"
                >
                  Usar template inicial
                </button>
              )}
            </div>
            <p className="mb-2 flex items-start gap-1 text-xs text-medio/60">
              <Info className="mt-0.5 h-3 w-3 shrink-0 text-tiffany" />
              Preencha com os DADOS REAIS de cada produto (area recomendada,
              diferenciais). Enquanto os campos estiverem em branco, a Sol nao vai
              afirmar especificacoes — ela e instruida a nao inventar.
            </p>
            {/* Convencao de secoes para organizar a base (Fatia 2.98). */}
            <div className="mb-2 rounded-lg border border-black/5 bg-black/[0.02] p-2.5 text-xs text-medio/70 dark:bg-white/5">
              <p className="mb-1 flex items-center gap-1 font-medium text-escuro">
                <ListTree className="h-3.5 w-3.5 text-tiffany" /> Organize em secoes
                demarcadas
              </p>
              <ul className="space-y-0.5 pl-4">
                <li>
                  <code>=== FICHAS DE PRODUTO ===</code> — uma ficha por produto:
                  indicado para, voltagem, reservatorio, garantia, diferenciais,
                  objecoes comuns e como contorna-las.
                </li>
                <li>
                  <code>=== POLITICAS ===</code> — frete, prazos (em faixas
                  honestas), pagamento, troca/devolucao, garantia.
                </li>
                <li>
                  <code>=== FAQ ===</code> — perguntas e respostas frequentes.
                </li>
              </ul>
              <p className="mt-1.5">
                PRECO e LINK vem da ferramenta ao vivo (buscar_produto) — NAO
                escreva na base. PRECO e DISPONIBILIDADE de PEÇAS tambem vem da
                ferramenta ao vivo (buscar_peca) — nao escreva na base. A secao{" "}
                <code>=== GUIA DE ATENDIMENTO (Oracle) ===</code> e gerida pelo
                Oracle.
              </p>
            </div>
            <textarea
              value={c.baseConhecimento ?? ""}
              onChange={(e) => set({ baseConhecimento: e.target.value })}
              rows={12}
              placeholder="Clique em 'Usar template inicial' e preencha os campos com ___"
              className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-tiffany"
            />
          </Cartao>
        </Secao>

        {/* Cupom / promocao */}
        <Secao
          titulo="Cupom de primeira compra"
          descricao="A Sol oferece este cupom em momentos estrategicos (intencao de compra, objecao de preco, fechamento) — com inteligencia de venda, sem spam."
        >
          <Toggle
            titulo="Oferecer cupom de primeira compra"
            descricao="Habilita a Sol a mencionar o cupom quando fizer sentido."
            valor={c.cupomAtivo}
            onChange={(v) => set({ cupomAtivo: v })}
          />
          {c.cupomAtivo && (
            <>
              <Cartao>
                <Rotulo>Codigo do cupom</Rotulo>
                <input
                  value={c.cupomPrimeiraCompra ?? ""}
                  onChange={(e) => set({ cupomPrimeiraCompra: e.target.value })}
                  placeholder="Ex.: SIXXIS05"
                  className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
                />
              </Cartao>
              <Cartao>
                <Rotulo>Descricao do beneficio</Rotulo>
                <input
                  value={c.cupomDescricao ?? ""}
                  onChange={(e) => set({ cupomDescricao: e.target.value })}
                  placeholder="Ex.: 5% na primeira compra"
                  className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
                />
              </Cartao>
            </>
          )}
        </Secao>

        {/* Persona */}
        <Secao titulo="Persona">
          <Cartao>
            <Rotulo>Prompt do sistema (personalidade extra)</Rotulo>
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

        {/* Sandbox de teste (efemero; nada e enviado a clientes) */}
        <SandboxLuna />

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

// Cartao compacto de leitura (rotulo + valor) do painel de controle da Luna.
function InfoCard({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-black/5 bg-white px-3 py-2">
      <p className="truncate text-[10px] uppercase tracking-wide text-medio/50">
        {rotulo}
      </p>
      <p className="mt-0.5 truncate text-xs font-semibold text-escuro" title={valor}>
        {valor}
      </p>
    </div>
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
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            valor ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
