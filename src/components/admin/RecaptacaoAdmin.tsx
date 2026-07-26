"use client";

// SOL-4 B5: painel da recaptacao em ondas.
//
// Esta tela dispara mensagem para cliente real. O desenho segue disso:
// ARMAR pede confirmacao escrita dizendo em numeros o que vai acontecer, o
// limite comeca baixo, e o motivo de uma pausa automatica fica em destaque —
// nao adianta o freio existir se o dono nao ficar sabendo que ele puxou.
import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";

type Status = "RASCUNHO" | "ARMADA" | "PAUSADA" | "CONCLUIDA";

type Campanha = {
  id: string;
  nome: string;
  mensagemTemplate: string;
  status: Status;
  limiteDiario: number;
  enviadosHoje: number;
  pausadaMotivo: string | null;
  pausadaEm: string | null;
  criadoEm: string;
  metricas: {
    pendentes: number;
    alcancados: number;
    respondidos: number;
    optouts: number;
    erros: number;
    pulados: number;
    entregues: number;
    lidas: number;
    taxaResposta: number;
  };
};

type Publico = {
  etapa: { id: string; nome: string };
  total: number;
  descartes: { telefone_nao_br: number; sem_instancia: number };
  truncado: boolean;
  previa: {
    leadId: string;
    telefone: string;
    primeiroNome: string | null;
    mensagem: string | null;
  }[];
};

const nf = new Intl.NumberFormat("pt-BR");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const CORES: Record<Status, string> = {
  RASCUNHO: "bg-black/5 text-medio",
  ARMADA: "bg-tiffany/10 text-tiffany",
  PAUSADA: "bg-amber-100 text-amber-800",
  CONCLUIDA: "bg-emerald-100 text-emerald-800",
};

const MODELO_INICIAL =
  "Oi {{nome}}, tudo bem? Aqui e da Sixxis. Vi que voce falou com a gente e a conversa acabou parando. Ainda tem interesse?";

export function RecaptacaoAdmin() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [limiteMax, setLimiteMax] = useState(300);
  const [publico, setPublico] = useState<Publico | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [novaNome, setNovaNome] = useState("");
  const [novaMensagem, setNovaMensagem] = useState(MODELO_INICIAL);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/recaptacao");
      if (!r.ok) throw new Error();
      const d = await r.json();
      setCampanhas(d.campanhas ?? []);
      setLimiteMax(d.limiteMax ?? 300);
      setErro(null);
    } catch {
      setErro("Nao foi possivel carregar as campanhas.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const carregarPublico = useCallback(async (campanhaId?: string) => {
    setPublico(null);
    try {
      const q = campanhaId ? `?campanhaId=${encodeURIComponent(campanhaId)}` : "";
      const r = await fetch(`/api/admin/recaptacao/publico${q}`);
      if (!r.ok) throw new Error();
      setPublico((await r.json()) as Publico);
    } catch {
      setErro("Nao foi possivel calcular o publico.");
    }
  }, []);

  async function criar() {
    if (!novaNome.trim() || !novaMensagem.trim()) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/admin/recaptacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novaNome, mensagemTemplate: novaMensagem }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        setErro(d?.erro ?? "Nao foi possivel criar a campanha.");
        return;
      }
      setNovaNome("");
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setSalvando(true);
    try {
      const r = await fetch(`/api/admin/recaptacao?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        setErro(d?.erro ?? "Nao foi possivel atualizar.");
        return;
      }
      setErro(null);
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  // ARMAR e a unica acao que libera envio real: a confirmacao diz em numeros o
  // que vai acontecer, e o dono confirma sabendo.
  async function armar(c: Campanha) {
    const alvo = publico?.total;
    const texto =
      `ARMAR "${c.nome}"\n\n` +
      `Isto envia MENSAGENS REAIS a clientes pelo mesmo numero por onde eles falaram.\n\n` +
      `- Ate ${c.limiteDiario} por dia (o resto fica na fila para os proximos dias)\n` +
      `- Somente entre 9h e 20h e dentro do horario comercial\n` +
      `- Em lotes pequenos, com intervalo de dezenas de segundos entre cada uma\n` +
      (alvo != null ? `- Publico calculado agora: ${nf.format(alvo)} pessoas\n` : "") +
      `\nA campanha pausa sozinha se a taxa de erro passar de 20% num lote.\n\n` +
      `Confirmar?`;
    if (!window.confirm(texto)) return;
    await patch(c.id, { status: "ARMADA" });
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-escuro">
            Recaptacao em ondas
          </h3>
          <p className="text-xs text-medio/60">
            Reengaja quem parou na entrada do funil, devagar. Nada sai enquanto a
            campanha nao for armada por voce.
          </p>
        </div>
        <button
          onClick={() => void carregar()}
          disabled={carregando}
          title="Recarregar"
          className="rounded-lg border border-black/10 bg-white p-1.5 text-medio transition-colors hover:border-tiffany/40 hover:text-tiffany disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {erro && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        {/* Previa do publico — read-only, nao cria nem envia nada. */}
        <div className="rounded-xl border border-black/5 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-escuro">Publico</p>
            <button
              onClick={() => void carregarPublico(selecionada ?? undefined)}
              className="flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-medium text-medio transition-colors hover:border-tiffany/40 hover:text-tiffany"
            >
              <Users className="h-3.5 w-3.5" />
              Calcular
            </button>
          </div>
          {publico ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-escuro">
                <span className="text-xl font-semibold">{nf.format(publico.total)}</span>{" "}
                pessoas na etapa &quot;{publico.etapa.nome}&quot; receberiam a mensagem.
              </p>
              {(publico.descartes.telefone_nao_br > 0 ||
                publico.descartes.sem_instancia > 0) && (
                <p className="text-xs text-medio/60">
                  Fora do publico:{" "}
                  {nf.format(publico.descartes.telefone_nao_br)} sem telefone BR
                  valido, {nf.format(publico.descartes.sem_instancia)} sem numero de
                  origem identificavel (nao adivinhamos por qual numero enviar).
                </p>
              )}
              {publico.truncado && (
                <p className="text-xs text-amber-700">
                  A varredura bateu o teto — ha mais candidatos do que os contados.
                </p>
              )}
              {publico.previa.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[11px] uppercase tracking-wide text-medio/50">
                    Primeiros da fila
                  </p>
                  {publico.previa.slice(0, 5).map((p) => (
                    <div
                      key={p.leadId}
                      className="rounded-lg border border-black/5 bg-fundo px-3 py-2"
                    >
                      <p className="text-xs font-medium text-escuro">
                        {p.primeiroNome ?? "(sem nome)"} · {p.telefone}
                      </p>
                      {p.mensagem && (
                        <p className="mt-0.5 text-xs text-medio/70">{p.mensagem}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-medio/50">
              Clique em Calcular para ver quantas pessoas entram e como o texto fica.
              Isso nao envia nada.
            </p>
          )}
        </div>

        {/* Nova campanha */}
        <div className="rounded-xl border border-black/5 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-escuro">Nova onda</p>
          <input
            value={novaNome}
            onChange={(e) => setNovaNome(e.target.value)}
            placeholder="Nome (ex.: Recaptacao Novo - julho)"
            className="mb-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
          />
          <textarea
            value={novaMensagem}
            onChange={(e) => setNovaMensagem(e.target.value)}
            rows={3}
            className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
          />
          <p className="mt-1 text-[11px] text-medio/50">
            {"{{nome}}"} vira o primeiro nome do cliente. Quem nao tem nome de
            verdade recebe a saudacao sem nome — nunca o telefone.
          </p>
          <button
            onClick={() => void criar()}
            disabled={salvando || !novaNome.trim() || !novaMensagem.trim()}
            className="mt-2 flex items-center gap-2 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar em rascunho
          </button>
        </div>

        {/* Campanhas */}
        {carregando ? (
          <div className="flex h-24 items-center justify-center rounded-xl border border-black/5 bg-white text-sm text-medio/50">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : campanhas.length === 0 ? (
          <div className="rounded-xl border border-black/5 bg-white px-6 py-8 text-center text-sm text-medio/50">
            Nenhuma onda criada ainda.
          </div>
        ) : (
          campanhas.map((c) => (
            <div key={c.id} className="rounded-xl border border-black/5 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-semibold text-escuro">{c.nome}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CORES[c.status]}`}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {c.status !== "ARMADA" && c.status !== "CONCLUIDA" && (
                    <button
                      onClick={() => void armar(c)}
                      disabled={salvando}
                      className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-60"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Armar
                    </button>
                  )}
                  {c.status === "ARMADA" && (
                    <button
                      onClick={() => void patch(c.id, { status: "PAUSADA" })}
                      disabled={salvando}
                      className="flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-xs font-semibold text-medio transition-colors hover:border-amber-300 hover:text-amber-700 disabled:opacity-60"
                    >
                      <Pause className="h-3.5 w-3.5" />
                      Pausar
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelecionada(c.id);
                      void carregarPublico(c.id);
                    }}
                    className="rounded-lg border border-black/10 p-1.5 text-medio transition-colors hover:border-tiffany/40 hover:text-tiffany"
                    title="Ver publico com esta mensagem"
                  >
                    <Users className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Pausa automatica em destaque: o freio so serve se o dono souber
                  que ele puxou, e por que. */}
              {c.status === "PAUSADA" && c.pausadaMotivo && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>{c.pausadaMotivo}</p>
                </div>
              )}

              <p className="mt-2 rounded-lg bg-fundo px-3 py-2 text-xs text-medio/80">
                {c.mensagemTemplate}
              </p>

              <div className="mt-3 grid grid-cols-3 gap-2 lg:grid-cols-6">
                <Mini rotulo="Hoje" valor={`${c.enviadosHoje}/${c.limiteDiario}`} />
                <Mini rotulo="Alcancados" valor={nf.format(c.metricas.alcancados)} />
                <Mini
                  rotulo="Entregues"
                  valor={nf.format(c.metricas.entregues)}
                  titulo="Confirmacao de entrega do WhatsApp. 0 pode significar 'sem confirmacao', nao necessariamente 'nao chegou'."
                />
                <Mini
                  rotulo="Responderam"
                  valor={`${nf.format(c.metricas.respondidos)} (${pct(c.metricas.taxaResposta)})`}
                />
                <Mini rotulo="Opt-out" valor={nf.format(c.metricas.optouts)} />
                <Mini
                  rotulo="Erros"
                  valor={nf.format(c.metricas.erros)}
                  titulo={`${c.metricas.pulados} pulados (sem numero de origem ou sem consentimento no momento do envio)`}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="text-xs text-medio/70">Limite por dia</label>
                <input
                  type="number"
                  min={1}
                  max={limiteMax}
                  defaultValue={c.limiteDiario}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (n !== c.limiteDiario) void patch(c.id, { limiteDiario: n });
                  }}
                  className="w-20 rounded-lg border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-tiffany"
                />
                <span className="text-[11px] text-medio/50">
                  Comece baixo e suba olhando erros e opt-outs — e assim que se
                  descobre o limite seguro do numero. Maximo {limiteMax}.
                </span>
              </div>
            </div>
          ))
        )}

        <p className="flex items-start gap-1.5 text-[11px] text-medio/50">
          <Send className="mt-0.5 h-3 w-3 shrink-0" />
          Envio so com campanha ARMADA, das 9h as 20h, dentro do horario comercial,
          em lotes pequenos e pela mesma instancia por onde o cliente falou. Cada
          lead recebe no maximo uma vez (trava no banco), e quem responde
          &quot;parar&quot; sai da lista para sempre.
        </p>
      </div>
    </section>
  );
}

function Mini({
  rotulo,
  valor,
  titulo,
}: {
  rotulo: string;
  valor: string;
  titulo?: string;
}) {
  return (
    <div
      className="min-w-0 rounded-lg border border-black/5 bg-fundo px-2.5 py-2"
      title={titulo}
    >
      <p className="truncate text-[10px] uppercase tracking-wide text-medio/50">
        {rotulo}
      </p>
      <p className="truncate text-sm font-semibold text-escuro">{valor}</p>
    </div>
  );
}
