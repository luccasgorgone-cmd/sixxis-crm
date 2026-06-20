"use client";

// Painel do cliente/negocio (drawer largo). Layout de DUAS COLUNAS em telas
// largas: esquerda = conversa (thread + compositor); direita = detalhes com
// ROLAGEM PROPRIA (cliente, acoes, etiquetas, produtos, historico, loja, notas).
// Header fixo. Em telas estreitas, empilha com abas Conversa | Detalhes.
import { useState, useEffect, useCallback } from "react";
import {
  X,
  Loader2,
  Tag,
  Plus,
  Trophy,
  XCircle,
  ArrowRight,
  StickyNote,
  UserCheck,
  DollarSign,
  Sparkles,
  Trash2,
  Repeat,
  UserPlus,
  MessageSquare,
  ListChecks,
  ShoppingBag,
  History,
} from "lucide-react";
import { ConversaEmbed } from "./ConversaEmbed";
import { ModalFechamento } from "./ModalFechamento";
import { LojaCliente } from "@/components/loja/LojaCliente";
import { AvatarCliente } from "@/components/AvatarCliente";
import { BlocoCliente } from "@/components/cliente/BlocoCliente";
import { HistoricoCliente } from "@/components/cliente/HistoricoCliente";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";
import {
  BadgeFinalidade,
  BadgeStatusNegocio,
  BadgeTemperatura,
} from "@/components/badges";
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

type AbaMobile = "conversa" | "detalhes";
type SubAba = "historico" | "loja" | "notas" | "negocio";

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
  const toast = useToast();
  const [detalhe, setDetalhe] = useState<DetalheNegocio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [abaMobile, setAbaMobile] = useState<AbaMobile>("conversa");
  const [subAba, setSubAba] = useState<SubAba>("historico");
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
      setErro(false);
    } catch {
      setDetalhe(null);
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [negocioId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    fetch("/api/observacoes")
      .then((r) => (r.ok ? r.json() : { observacoes: [] }))
      .then((d) => setPresets(d.observacoes ?? []))
      .catch(() => undefined);
  }, []);

  const salvar = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      try {
        const r = await fetch(`/api/negocios/${negocioId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (r.ok) {
          await carregar();
          onAtualizado();
        } else {
          const d = await r.json().catch(() => null);
          toast.erro(d?.erro ?? "Nao foi possivel salvar a alteracao.");
        }
        return r.ok;
      } catch {
        toast.erro("Falha de conexao ao salvar.");
        return false;
      }
    },
    [negocioId, carregar, onAtualizado, toast],
  );

  const etapasFunil = detalhe
    ? etapas.filter(
        (e) =>
          !e.finalidade ||
          e.finalidade === "AMBAS" ||
          e.finalidade === detalhe.finalidade,
      )
    : [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fade-in absolute inset-0 bg-black/30" onClick={onFechar} />

      <aside className="drawer-in relative flex h-full w-full max-w-[64rem] flex-col bg-fundo shadow-xl">
        {/* Cabecalho fixo */}
        <header className="shrink-0 border-b border-black/5 bg-white">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <AvatarCliente
                nome={detalhe?.cliente.nomeEfetivo ?? null}
                telefone={detalhe?.cliente.telefone ?? ""}
                fotoUrl={detalhe?.cliente.fotoUrl ?? null}
                tamanho={40}
              />
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-escuro">
                    {detalhe?.cliente.nomeEfetivo ||
                      detalhe?.cliente.telefone ||
                      "Negocio"}
                  </p>
                  {detalhe && (
                    <>
                      <BadgeFinalidade finalidade={detalhe.finalidade} />
                      <BadgeStatusNegocio status={detalhe.status} />
                    </>
                  )}
                </div>
                {detalhe && (
                  <p className="truncate text-xs text-medio/60">
                    {formatarTelefone(detalhe.cliente.telefone)}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onFechar}
              aria-label="Fechar"
              className="rounded-lg p-1.5 text-medio/60 transition-colors hover:bg-black/5 hover:text-escuro"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Abas (so em telas estreitas) */}
          {detalhe && (
            <div className="flex gap-1 border-t border-black/5 px-2 lg:hidden">
              {(
                [
                  ["conversa", "Conversa", MessageSquare],
                  ["detalhes", "Detalhes", ListChecks],
                ] as [AbaMobile, string, typeof MessageSquare][]
              ).map(([chave, rotulo, Icone]) => (
                <button
                  key={chave}
                  onClick={() => setAbaMobile(chave)}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                    abaMobile === chave
                      ? "border-tiffany text-tiffany"
                      : "border-transparent text-medio/60 hover:text-escuro"
                  }`}
                >
                  <Icone className="h-4 w-4" />
                  {rotulo}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* Corpo */}
        {carregando ? (
          <div className="flex-1 space-y-3 p-4">
            <div className="skeleton h-6 w-2/3" />
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-24 w-full" />
          </div>
        ) : !detalhe ? (
          <div className="flex-1 p-4">
            <EstadoErro
              mensagem={
                erro
                  ? "Nao foi possivel carregar este negocio."
                  : "Negocio nao encontrado."
              }
              onRetry={() => {
                setCarregando(true);
                void carregar();
              }}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* Conversa */}
            <div
              className={`${
                abaMobile === "conversa" ? "flex" : "hidden"
              } min-h-0 w-full flex-col lg:flex lg:w-1/2 lg:border-r lg:border-black/5`}
            >
              {detalhe.conversaId ? (
                <ConversaEmbed
                  conversaId={detalhe.conversaId}
                  leadNome={detalhe.cliente.nomeEfetivo}
                  leadTelefone={detalhe.cliente.telefone}
                  atendidoPor={detalhe.atendidoPor}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-medio/50">
                  <MessageSquare className="h-8 w-8 text-medio/30" />
                  <p className="text-sm">Este lead ainda nao tem conversa.</p>
                </div>
              )}
            </div>

            {/* Detalhes (rolagem propria) */}
            <div
              className={`${
                abaMobile === "detalhes" ? "flex" : "hidden"
              } min-h-0 w-full flex-col lg:flex lg:w-1/2`}
            >
              <div className="scroll-fino flex-1 space-y-5 overflow-y-auto p-4">
                <BlocoCliente
                  cliente={detalhe.cliente}
                  onAtualizado={() => {
                    void carregar();
                    onAtualizado();
                  }}
                />

                <NegocioAcoes
                  detalhe={detalhe}
                  ehAdmin={ehAdmin}
                  agenteIdAtual={agenteIdAtual}
                  agentes={agentes}
                  etiquetas={etiquetas}
                  etapas={etapasFunil}
                  negocioId={negocioId}
                  salvar={salvar}
                  recarregar={carregar}
                  onAtualizado={onAtualizado}
                  abrirModal={(tipo, etapaId) => setModal({ tipo, etapaId })}
                />

                {/* Sub-navegacao dos paineis inferiores */}
                <div>
                  <div className="mb-3 flex gap-1 overflow-x-auto border-b border-black/5">
                    {(
                      [
                        ["historico", "Historico", History],
                        ["negocio", "Negocio", ListChecks],
                        ["loja", "Loja", ShoppingBag],
                        ["notas", "Notas", StickyNote],
                      ] as [SubAba, string, typeof History][]
                    ).map(([chave, rotulo, Icone]) => (
                      <button
                        key={chave}
                        onClick={() => setSubAba(chave)}
                        className={`flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-1.5 text-sm font-medium transition-colors ${
                          subAba === chave
                            ? "border-tiffany text-tiffany"
                            : "border-transparent text-medio/60 hover:text-escuro"
                        }`}
                      >
                        <Icone className="h-3.5 w-3.5" />
                        {rotulo}
                      </button>
                    ))}
                  </div>

                  {subAba === "historico" && (
                    <HistoricoCliente leadId={detalhe.cliente.id} />
                  )}
                  {subAba === "negocio" && <TimelineNegocio detalhe={detalhe} />}
                  {subAba === "loja" && (
                    <LojaCliente
                      telefone={detalhe.cliente.telefone}
                      origem={detalhe.cliente.origem}
                    />
                  )}
                  {subAba === "notas" && (
                    <Notas
                      detalhe={detalhe}
                      negocioId={negocioId}
                      presets={presets}
                      recarregar={carregar}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
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

// ----------------------------------------------------------------------------
// Acoes do negocio: valor, temperatura, etapa, dono/transferencia, etiquetas,
// produtos e fechamento (ganho/perdido).
// ----------------------------------------------------------------------------
function NegocioAcoes({
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
  const [addEtiqueta, setAddEtiqueta] = useState(false);
  const [novoProduto, setNovoProduto] = useState("");
  const [transferindo, setTransferindo] = useState(false);
  const [destino, setDestino] = useState("");
  const [vendedores, setVendedores] = useState<{ id: string; nome: string }[]>([]);
  const produtos = produtosParaLista(detalhe.produtos);

  const etapaGanho = etapas.find((e) => e.tipo === "GANHO");
  const etapaPerda = etapas.find((e) => e.tipo === "PERDIDO");
  const naoAplicadas = etiquetas.filter(
    (e) => !detalhe.etiquetas.some((ap) => ap.id === e.id),
  );

  // Vendedores da finalidade (para transferir), carregados sob demanda.
  useEffect(() => {
    if (!transferindo || vendedores.length > 0) return;
    fetch(`/api/vendedores?finalidade=${detalhe.finalidade}`)
      .then((r) => (r.ok ? r.json() : { vendedores: [] }))
      .then((d) => setVendedores(d.vendedores ?? []))
      .catch(() => undefined);
  }, [transferindo, vendedores.length, detalhe.finalidade]);

  function aoTrocarEtapa(novaEtapaId: string) {
    const et = etapas.find((e) => e.id === novaEtapaId);
    if (!et || novaEtapaId === detalhe.etapaId) return;
    if (et.tipo === "GANHO") return abrirModal("ganho", novaEtapaId);
    if (et.tipo === "PERDIDO") return abrirModal("perdido", novaEtapaId);
    void salvar({ etapaId: novaEtapaId });
  }

  async function aplicarEtiqueta(etiquetaId: string) {
    setAddEtiqueta(false);
    await fetch(`/api/negocios/${negocioId}/etiquetas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etiquetaId }),
    });
    await recarregar();
    onAtualizado();
  }

  async function removerEtiqueta(etiquetaId: string) {
    await fetch(`/api/negocios/${negocioId}/etiquetas/${etiquetaId}`, {
      method: "DELETE",
    });
    await recarregar();
    onAtualizado();
  }

  async function transferir() {
    if (!destino) return;
    await fetch(`/api/leads/${detalhe.cliente.id}/transferir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agenteId: destino, finalidade: detalhe.finalidade }),
    });
    setTransferindo(false);
    setDestino("");
    await recarregar();
    onAtualizado();
  }

  return (
    <section className="space-y-4 rounded-xl border border-black/5 bg-white p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-medio/50">
        Negocio
      </h4>

      {/* Valor + temperatura */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Rotulo>Valor</Rotulo>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onBlur={() => {
                const v =
                  valor.trim() === "" ? null : Number(valor.replace(",", "."));
                if (v !== detalhe.valor) void salvar({ valor: v });
              }}
              placeholder="0,00"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </div>
          <p className="mt-1 text-xs text-medio/50">{formatarBRL(detalhe.valor)}</p>
        </div>
        <div>
          <Rotulo>Temperatura</Rotulo>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TEMPERATURA_INFO) as Temperatura[]).map((t) => {
              const ativo = detalhe.temperatura === t;
              return (
                <button
                  key={t}
                  onClick={() => {
                    if (!ativo) void salvar({ temperatura: t });
                  }}
                  className={`rounded-lg border px-1.5 py-1 transition-colors ${
                    ativo
                      ? "border-tiffany bg-tiffany/5"
                      : "border-transparent hover:bg-black/5"
                  }`}
                >
                  <BadgeTemperatura temperatura={t} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Etapa */}
      <div>
        <Rotulo>Etapa</Rotulo>
        <select
          value={detalhe.etapaId ?? ""}
          onChange={(e) => aoTrocarEtapa(e.target.value)}
          className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
        >
          {etapas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
      </div>

      {/* Dono / atribuicao / transferencia */}
      <div>
        <Rotulo>Dono</Rotulo>
        {ehAdmin ? (
          <select
            value={detalhe.agente?.id ?? ""}
            onChange={(e) => void salvar({ agenteId: e.target.value || null })}
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
          >
            <option value="">Sem dono</option>
            {agentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-escuro">
              {detalhe.agente?.nome ?? "Sem dono"}
            </span>
            {!detalhe.agente && (
              <button
                onClick={() => void salvar({ agenteId: agenteIdAtual })}
                className="flex items-center gap-1 rounded-lg bg-tiffany px-2.5 py-1 text-xs font-semibold text-white hover:bg-tiffany-escuro"
              >
                <UserPlus className="h-3.5 w-3.5" /> Assumir
              </button>
            )}
          </div>
        )}
        <button
          onClick={() => setTransferindo((v) => !v)}
          className="mt-2 flex items-center gap-1.5 text-xs font-medium text-medio transition-colors hover:text-tiffany"
        >
          <Repeat className="h-3.5 w-3.5" /> Transferir cliente
        </button>
        {transferindo && (
          <div className="mt-2 flex gap-2">
            <select
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className="flex-1 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-tiffany"
            >
              <option value="">Escolher...</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
            <button
              onClick={() => void transferir()}
              disabled={!destino}
              className="rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-50"
            >
              Ok
            </button>
          </div>
        )}
      </div>

      {/* Etiquetas */}
      <div>
        <Rotulo>Etiquetas</Rotulo>
        <div className="flex flex-wrap items-center gap-1.5">
          {detalhe.etiquetas.map((e) => (
            <span
              key={e.id}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: e.cor }}
            >
              {e.nome}
              <button
                onClick={() => void removerEtiqueta(e.id)}
                aria-label={`Remover ${e.nome}`}
                className="rounded-full hover:bg-black/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {naoAplicadas.length > 0 && (
            <button
              onClick={() => setAddEtiqueta((v) => !v)}
              className="flex items-center gap-1 rounded-full border border-dashed border-medio/30 px-2 py-0.5 text-xs text-medio transition-colors hover:border-tiffany hover:text-tiffany"
            >
              <Plus className="h-3 w-3" /> Etiqueta
            </button>
          )}
        </div>
        {addEtiqueta && naoAplicadas.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg border border-black/5 bg-fundo p-2">
            {naoAplicadas.map((e) => (
              <button
                key={e.id}
                onClick={() => void aplicarEtiqueta(e.id)}
                className="flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2 py-0.5 text-xs text-escuro hover:bg-black/5"
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

      {/* Produtos */}
      <div>
        <Rotulo>Produtos</Rotulo>
        <div className="space-y-1.5">
          {produtos.length === 0 && (
            <p className="text-sm text-medio/50">Nenhum produto.</p>
          )}
          {produtos.map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg bg-fundo px-3 py-1.5 text-sm"
            >
              <span>{p}</span>
              <button
                onClick={() =>
                  void salvar({ produtos: produtos.filter((_, j) => j !== i) })
                }
                aria-label="Remover produto"
                className="text-medio/50 hover:text-erro"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <input
            value={novoProduto}
            onChange={(e) => setNovoProduto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && novoProduto.trim()) {
                void salvar({ produtos: [...produtos, novoProduto.trim()] });
                setNovoProduto("");
              }
            }}
            placeholder="Adicionar produto e Enter"
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm outline-none focus:border-tiffany"
          />
        </div>
      </div>

      {/* Fechamento */}
      <div className="flex gap-2">
        {etapaGanho && (
          <button
            onClick={() => abrirModal("ganho", etapaGanho.id)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sucesso px-3 py-2 text-sm font-semibold text-white transition-colors hover:brightness-95"
          >
            <Trophy className="h-4 w-4" /> Ganho
          </button>
        )}
        {etapaPerda && (
          <button
            onClick={() => abrirModal("perdido", etapaPerda.id)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-erro px-3 py-2 text-sm font-semibold text-white transition-colors hover:brightness-95"
          >
            <XCircle className="h-4 w-4" /> Perdido
          </button>
        )}
      </div>
    </section>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-medium text-medio/70">{children}</label>
  );
}

// ----------------------------------------------------------------------------
// Notas internas do negocio.
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
        <p className="py-6 text-center text-sm text-medio/50">Nenhuma nota ainda.</p>
      ) : (
        detalhe.notas.map((n) => (
          <div key={n.id} className="rounded-xl border border-black/5 bg-white p-3">
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
// Linha do tempo do NEGOCIO (HistoricoNegocio).
// ----------------------------------------------------------------------------
function TimelineNegocio({ detalhe }: { detalhe: DetalheNegocio }) {
  if (detalhe.historico.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-medio/50">Sem eventos ainda.</p>
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
