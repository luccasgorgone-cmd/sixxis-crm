"use client";

// Painel do negocio (drawer lateral). Abas: Resumo, Conversa, Notas, Linha do
// tempo. Acoes rapidas respeitam papel (vendedor nao atribui a terceiros).
import { useState, useEffect, useCallback } from "react";
import {
  X,
  Loader2,
  Tag,
  Plus,
  Trophy,
  XCircle,
  CreditCard,
  Store,
  ArrowRight,
  StickyNote,
  UserCheck,
  DollarSign,
  Sparkles,
  Trash2,
} from "lucide-react";
import { ConversaEmbed } from "./ConversaEmbed";
import { ModalFechamento } from "./ModalFechamento";
import { ClienteAba } from "./ClienteAba";
import {
  TEMPERATURA_INFO,
  type DetalheNegocio,
  type Etapa,
  type EtiquetaChip,
  type AgenteResumo,
  type Temperatura,
  type ObservacaoOpcao,
} from "./tipos";
import { formatarBRL, formatarTelefone } from "@/lib/format";

type Aba = "resumo" | "conversa" | "notas" | "cliente" | "timeline";

const ICONE_HIST: Record<string, typeof Tag> = {
  CRIACAO: Sparkles,
  ETAPA: ArrowRight,
  NOTA: StickyNote,
  ETIQUETA: Tag,
  ATRIBUICAO: UserCheck,
  VALOR: DollarSign,
  GANHO: Trophy,
  PERDA: XCircle,
};

function dataHora(valor: string): string {
  return new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function produtosParaLista(p: unknown): string[] {
  if (Array.isArray(p)) return p.filter((x): x is string => typeof x === "string");
  return [];
}

export function PainelNegocio({
  negocioId,
  papel,
  agenteIdAtual,
  agentes,
  etiquetas,
  etapas,
  onFechar,
  onAtualizado,
}: {
  negocioId: string;
  papel: string;
  agenteIdAtual: string;
  agentes: AgenteResumo[];
  etiquetas: EtiquetaChip[];
  etapas: Etapa[];
  onFechar: () => void;
  onAtualizado: () => void;
}) {
  const ehAdmin = papel === "ADMIN";
  const [detalhe, setDetalhe] = useState<DetalheNegocio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<Aba>("resumo");
  const [presets, setPresets] = useState<ObservacaoOpcao[]>([]);
  const [modal, setModal] = useState<{
    tipo: "ganho" | "perdido";
    etapaId: string;
  } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/negocios/${negocioId}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setDetalhe(d.negocio as DetalheNegocio);
    } catch {
      setDetalhe(null);
    } finally {
      setCarregando(false);
    }
  }, [negocioId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Observacoes preset (uma vez).
  useEffect(() => {
    fetch("/api/observacoes")
      .then((r) => (r.ok ? r.json() : { observacoes: [] }))
      .then((d) => setPresets(d.observacoes ?? []))
      .catch(() => undefined);
  }, []);

  // Aplica um PATCH e recarrega detalhe + quadro.
  const salvar = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      const r = await fetch(`/api/negocios/${negocioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        await carregar();
        onAtualizado();
      }
      return r.ok;
    },
    [negocioId, carregar, onAtualizado],
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fade-in absolute inset-0 bg-black/30" onClick={onFechar} />

      <aside className="drawer-in relative flex h-full w-full max-w-md flex-col bg-fundo shadow-xl">
        {/* Cabecalho */}
        <header className="flex shrink-0 items-center justify-between border-b border-black/5 bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-escuro">
              {detalhe?.cliente.nome?.trim() ||
                detalhe?.cliente.telefone ||
                "Negocio"}
            </p>
            {detalhe && (
              <StatusBadge status={detalhe.status} />
            )}
          </div>
          <button
            onClick={onFechar}
            className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Abas */}
        <nav className="flex shrink-0 gap-1 border-b border-black/5 bg-white px-2">
          {(
            [
              ["resumo", "Resumo"],
              ["conversa", "Conversa"],
              ["notas", "Notas"],
              ["cliente", "Cliente"],
              ["timeline", "Negocio"],
            ] as [Aba, string][]
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              onClick={() => setAba(chave)}
              className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                aba === chave
                  ? "border-tiffany text-tiffany"
                  : "border-transparent text-medio/60 hover:text-escuro"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </nav>

        {/* Conteudo */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {carregando || !detalhe ? (
            <div className="space-y-3 p-4">
              <div className="skeleton h-6 w-2/3" />
              <div className="skeleton h-20 w-full" />
              <div className="skeleton h-20 w-full" />
            </div>
          ) : aba === "conversa" ? (
            detalhe.conversaId ? (
              <ConversaEmbed
                conversaId={detalhe.conversaId}
                leadNome={detalhe.cliente.nome}
                leadTelefone={detalhe.cliente.telefone}
                atendidoPor={detalhe.atendidoPor}
              />
            ) : (
              <p className="p-6 text-sm text-medio/50">
                Este lead ainda nao tem conversa.
              </p>
            )
          ) : (
            <div className="scroll-fino h-full overflow-y-auto p-4">
              {aba === "resumo" && (
                <Resumo
                  detalhe={detalhe}
                  ehAdmin={ehAdmin}
                  agenteIdAtual={agenteIdAtual}
                  agentes={agentes}
                  etiquetas={etiquetas}
                  etapas={etapas}
                  negocioId={negocioId}
                  salvar={salvar}
                  recarregar={carregar}
                  onAtualizado={onAtualizado}
                  abrirModal={(tipo, etapaId) => setModal({ tipo, etapaId })}
                />
              )}
              {aba === "notas" && (
                <Notas
                  detalhe={detalhe}
                  negocioId={negocioId}
                  presets={presets}
                  recarregar={carregar}
                />
              )}
              {aba === "cliente" && (
                <ClienteAba
                  leadId={detalhe.cliente.id}
                  dono={detalhe.dono}
                  finalidade={detalhe.finalidade}
                  onMudou={() => {
                    void carregar();
                    onAtualizado();
                  }}
                />
              )}
              {aba === "timeline" && <Timeline detalhe={detalhe} />}
            </div>
          )}
        </div>
      </aside>

      {modal && detalhe && (
        <ModalFechamento
          tipo={modal.tipo}
          valorInicial={detalhe.valor}
          onConfirmar={async (dados) => {
            const ok = await salvar({ etapaId: modal.etapaId, ...dados });
            if (!ok) throw new Error("falha");
            setModal(null);
          }}
          onCancelar={() => setModal(null)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const mapa: Record<string, { rotulo: string; classe: string }> = {
    ABERTO: { rotulo: "Aberto", classe: "bg-sky-100 text-sky-700" },
    GANHO: { rotulo: "Ganho", classe: "bg-green-100 text-green-700" },
    PERDIDO: { rotulo: "Perdido", classe: "bg-red-100 text-red-700" },
  };
  const info = mapa[status] ?? mapa.ABERTO;
  return (
    <span
      className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${info.classe}`}
    >
      {info.rotulo}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Aba Resumo
// ----------------------------------------------------------------------------
function Resumo({
  detalhe,
  ehAdmin,
  agenteIdAtual,
  agentes,
  etiquetas,
  etapas,
  negocioId,
  salvar,
  recarregar,
  onAtualizado,
  abrirModal,
}: {
  detalhe: DetalheNegocio;
  ehAdmin: boolean;
  agenteIdAtual: string;
  agentes: AgenteResumo[];
  etiquetas: EtiquetaChip[];
  etapas: Etapa[];
  negocioId: string;
  salvar: (body: Record<string, unknown>) => Promise<boolean>;
  recarregar: () => Promise<void>;
  onAtualizado: () => void;
  abrirModal: (tipo: "ganho" | "perdido", etapaId: string) => void;
}) {
  const [valor, setValor] = useState(
    detalhe.valor != null ? String(detalhe.valor) : "",
  );
  const [popEtiqueta, setPopEtiqueta] = useState(false);
  const [novoProduto, setNovoProduto] = useState("");
  const produtos = produtosParaLista(detalhe.produtos);

  const etapaGanho = etapas.find((e) => e.tipo === "GANHO");
  const etapaPerda = etapas.find((e) => e.tipo === "PERDIDO");

  function aoTrocarEtapa(novaEtapaId: string) {
    const et = etapas.find((e) => e.id === novaEtapaId);
    if (!et || novaEtapaId === detalhe.etapaId) return;
    if (et.tipo === "GANHO") return abrirModal("ganho", novaEtapaId);
    if (et.tipo === "PERDIDO") return abrirModal("perdido", novaEtapaId);
    void salvar({ etapaId: novaEtapaId });
  }

  async function addEtiqueta(etiquetaId: string) {
    setPopEtiqueta(false);
    await fetch(`/api/negocios/${negocioId}/etiquetas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etiquetaId }),
    });
    await recarregar();
    onAtualizado();
  }

  async function removeEtiqueta(etiquetaId: string) {
    await fetch(`/api/negocios/${negocioId}/etiquetas/${etiquetaId}`, {
      method: "DELETE",
    });
    await recarregar();
    onAtualizado();
  }

  async function salvarProdutos(lista: string[]) {
    await salvar({ produtos: lista });
  }

  const naoAplicadas = etiquetas.filter(
    (e) => !detalhe.etiquetas.some((ap) => ap.id === e.id),
  );

  return (
    <div className="space-y-5">
      {/* Cliente */}
      <Secao titulo="Cliente">
        <Campo rotulo="Nome" valor={detalhe.cliente.nome ?? "—"} />
        <Campo
          rotulo="Telefone"
          valor={formatarTelefone(detalhe.cliente.telefone)}
        />
        <Campo rotulo="Email" valor={detalhe.cliente.email ?? "—"} />
        <Campo rotulo="Origem" valor={detalhe.cliente.origem ?? "—"} />
      </Secao>

      {/* Valor */}
      <Secao titulo="Valor">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onBlur={() => {
              const v = valor.trim() === "" ? null : Number(valor.replace(",", "."));
              if (v !== detalhe.valor) void salvar({ valor: v });
            }}
            placeholder="0,00"
            className="w-40 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
          />
          <span className="text-sm text-medio/60">
            {formatarBRL(detalhe.valor)}
          </span>
        </div>
      </Secao>

      {/* Temperatura */}
      <Secao titulo="Temperatura">
        <div className="flex gap-2">
          {(Object.keys(TEMPERATURA_INFO) as Temperatura[]).map((t) => {
            const info = TEMPERATURA_INFO[t];
            const ativo = detalhe.temperatura === t;
            return (
              <button
                key={t}
                onClick={() => {
                  if (!ativo) void salvar({ temperatura: t });
                }}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  ativo
                    ? "border-tiffany bg-tiffany/10 text-escuro"
                    : "border-black/10 bg-white text-medio hover:bg-black/5"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${info.ponto}`} />
                {info.rotulo}
              </button>
            );
          })}
        </div>
      </Secao>

      {/* Etiquetas */}
      <Secao titulo="Etiquetas">
        <div className="flex flex-wrap items-center gap-1.5">
          {detalhe.etiquetas.map((e) => (
            <span
              key={e.id}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: e.cor }}
            >
              {e.nome}
              <button
                onClick={() => void removeEtiqueta(e.id)}
                className="rounded-full hover:bg-black/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <div className="relative">
            <button
              onClick={() => setPopEtiqueta((v) => !v)}
              disabled={naoAplicadas.length === 0}
              className="flex items-center gap-1 rounded-full border border-dashed border-medio/30 px-2 py-0.5 text-xs text-medio hover:bg-black/5 disabled:opacity-40"
            >
              <Plus className="h-3 w-3" /> Etiqueta
            </button>
            {popEtiqueta && (
              <div className="absolute z-10 mt-1 w-44 rounded-lg border border-black/10 bg-white p-1 shadow-lg">
                {naoAplicadas.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => void addEtiqueta(e.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-fundo"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: e.cor }}
                    />
                    {e.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Secao>

      {/* Produtos */}
      <Secao titulo="Produtos">
        <div className="space-y-1.5">
          {produtos.length === 0 && (
            <p className="text-sm text-medio/50">Nenhum produto.</p>
          )}
          {produtos.map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-sm"
            >
              <span>{p}</span>
              <button
                onClick={() =>
                  void salvarProdutos(produtos.filter((_, j) => j !== i))
                }
                className="text-medio/50 hover:text-erro"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={novoProduto}
              onChange={(e) => setNovoProduto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && novoProduto.trim()) {
                  void salvarProdutos([...produtos, novoProduto.trim()]);
                  setNovoProduto("");
                }
              }}
              placeholder="Adicionar produto"
              className="flex-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm outline-none focus:border-tiffany"
            />
          </div>
        </div>
      </Secao>

      {/* Etapa + atribuicao */}
      <Secao titulo="Acoes">
        <label className="mb-1 block text-xs font-medium text-medio/70">
          Etapa
        </label>
        <select
          value={detalhe.etapaId ?? ""}
          onChange={(e) => aoTrocarEtapa(e.target.value)}
          className="mb-3 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
        >
          {etapas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-xs font-medium text-medio/70">
          Vendedor
        </label>
        {ehAdmin ? (
          <select
            value={detalhe.agente?.id ?? ""}
            onChange={(e) => void salvar({ agenteId: e.target.value || null })}
            className="mb-3 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
          >
            <option value="">Sem dono</option>
            {agentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        ) : (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm text-escuro">
              {detalhe.agente?.nome ?? "Sem dono"}
            </span>
            {!detalhe.agente && (
              <button
                onClick={() => void salvar({ agenteId: agenteIdAtual })}
                className="rounded-lg bg-tiffany px-2.5 py-1 text-xs font-semibold text-white hover:bg-tiffany-escuro"
              >
                Assumir
              </button>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {etapaGanho && (
            <button
              onClick={() => abrirModal("ganho", etapaGanho.id)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              <Trophy className="h-4 w-4" /> Ganho
            </button>
          )}
          {etapaPerda && (
            <button
              onClick={() => abrirModal("perdido", etapaPerda.id)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-erro px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              <XCircle className="h-4 w-4" /> Perdido
            </button>
          )}
        </div>
      </Secao>

      {/* Integracoes (stubs) */}
      <Secao titulo="Integracoes">
        <button
          onClick={() => alert("Integracao com Mercado Pago em breve.")}
          className="mb-2 flex w-full items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-medio hover:bg-black/5"
        >
          <CreditCard className="h-4 w-4 text-tiffany" />
          Enviar link de pagamento
        </button>
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-black/10 px-3 py-2 text-sm text-medio/50">
          <Store className="h-4 w-4" />
          Historico de pedidos da loja (conectar a loja)
        </div>
      </Secao>
    </div>
  );
}

function Secao({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
        {titulo}
      </h4>
      {children}
    </section>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-medio/60">{rotulo}</span>
      <span className="min-w-0 truncate text-right font-medium text-escuro">
        {valor}
      </span>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Aba Notas
// ----------------------------------------------------------------------------
function Notas({
  detalhe,
  negocioId,
  presets,
  recarregar,
}: {
  detalhe: DetalheNegocio;
  negocioId: string;
  presets: ObservacaoOpcao[];
  recarregar: () => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function adicionar() {
    if (!texto.trim() || salvando) return;
    setSalvando(true);
    try {
      await fetch(`/api/negocios/${negocioId}/notas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.trim() }),
      });
      setTexto("");
      await recarregar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3">
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => setTexto(p.texto)}
              title="Inserir observacao"
              className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs text-medio transition-colors hover:border-tiffany hover:text-escuro"
            >
              {p.texto}
            </button>
          ))}
        </div>
      )}
      <div className="rounded-xl border border-black/5 bg-white p-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="Escreva uma nota interna..."
          className="scroll-fino w-full resize-none text-sm outline-none"
        />
        <div className="flex justify-end">
          <button
            onClick={() => void adicionar()}
            disabled={salvando || !texto.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-50"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Adicionar
          </button>
        </div>
      </div>

      {detalhe.notas.length === 0 ? (
        <p className="py-6 text-center text-sm text-medio/50">
          Nenhuma nota ainda.
        </p>
      ) : (
        detalhe.notas.map((n) => (
          <div
            key={n.id}
            className="rounded-xl border border-black/5 bg-white p-3"
          >
            <p className="whitespace-pre-wrap text-sm text-escuro">{n.texto}</p>
            <p className="mt-2 text-[11px] text-medio/50">
              {n.agente ?? "—"} &middot; {dataHora(n.criadoEm)}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Aba Linha do tempo
// ----------------------------------------------------------------------------
function Timeline({ detalhe }: { detalhe: DetalheNegocio }) {
  if (detalhe.historico.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-medio/50">
        Sem eventos ainda.
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {detalhe.historico.map((h) => {
        const Icone = ICONE_HIST[h.tipo] ?? StickyNote;
        return (
          <li key={h.id} className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tiffany/10 text-tiffany">
              <Icone className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-sm text-escuro">{h.descricao}</p>
              <p className="text-[11px] text-medio/50">
                {h.agente ? `${h.agente} · ` : ""}
                {dataHora(h.criadoEm)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
