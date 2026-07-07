"use client";

// Painel do cliente/negocio (drawer largo). Layout de DUAS COLUNAS em telas
// largas: esquerda = conversa (thread + compositor); direita = detalhes com
// ROLAGEM PROPRIA (cliente, acoes, etiquetas, produtos, historico, loja, notas).
// Header fixo. Em telas estreitas, empilha com abas Conversa | Detalhes.
import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Loader2,
  Tag,
  Plus,
  Trophy,
  XCircle,
  ChevronRight,
  ArrowRight,
  StickyNote,
  UserCheck,
  DollarSign,
  Sparkles,
  Trash2,
  Repeat,
  ArrowLeftRight,
  UserPlus,
  MessageSquare,
  MessageCircle,
  ListChecks,
  ShoppingBag,
  History,
  PauseCircle,
  PlayCircle,
  AlarmClock,
  CalendarPlus,
  Check,
  RotateCcw,
  FileText,
  Building2,
  ClipboardList,
  ShieldCheck,
  ShieldOff,
  Truck,
} from "lucide-react";
import { ConversaEmbed } from "./ConversaEmbed";
import type { MensagemItem } from "@/components/inbox/tipos";
import { MOTIVOS_PENDENCIA } from "@/lib/motivosPendencia";
import { ModalFechamento } from "./ModalFechamento";
import { ModalMoverFinalidade } from "./ModalMoverFinalidade";
import { LojaCliente } from "@/components/loja/LojaCliente";
import { AvatarCliente } from "@/components/AvatarCliente";
import { BlocoCliente } from "@/components/cliente/BlocoCliente";
import { HistoricoCliente } from "@/components/cliente/HistoricoCliente";
import { BlocoProdutosInteresse } from "@/components/cliente/BlocoProdutosInteresse";
import { BlocoAssistencia } from "@/components/local/BlocoAssistencia";
import { BlocoOrcamento, OrcamentosAnteriores } from "@/components/pecas/BlocoOrcamento";
import { BlocoPedidos, type ItemPedidoSeed } from "@/components/cliente/BlocoPedidos";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";
import {
  BadgeFinalidade,
  BadgeStatusNegocio,
  BadgeTemperatura,
  BadgePendente,
} from "@/components/badges";
import {
  TEMPERATURA_INFO,
  type DetalheNegocio,
  type Etapa,
  type EtiquetaChip,
  type AgenteResumo,
  type Temperatura,
  type ObservacaoOpcao,
  type LembreteItem,
} from "./tipos";
import { formatarBRL, formatarTelefone, dataNascParaInput, formatarNumeroPedido, calcularTotalFinal } from "@/lib/format";
import { useAgente } from "@/components/shell/AgenteContext";

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
    itensIniciais?: (ItemPedidoSeed & { garantia?: boolean })[];
    // Pre-carga do orcamento (Fatia 3.09): frete/empresa, valor final e desconto.
    orc?: {
      frete: number | null;
      fretePagoPelaEmpresa: boolean;
      valorFinal: number;
      descontoInfo: { cupom: string | null; descontoPct: number | null; descValor: number } | null;
    };
  } | null>(null);
  const [iniciandoConversa, setIniciandoConversa] = useState(false);
  // Injetor da thread embutida (ConversaEmbed): o BlocoOrcamento o usa para a bolha
  // do PDF aparecer na hora do envio. Registrado por ConversaEmbed ao montar. 3.15.
  const injetorThreadRef = useRef<((msg: MensagemItem) => void) | null>(null);
  const registrarInjetorThread = useCallback((fn: (msg: MensagemItem) => void) => {
    injetorThreadRef.current = fn;
  }, []);

  // Repetir pedido: abre o compositor de ganho pre-carregado com os itens do
  // pedido escolhido (editavel). Alvo: a etapa de GANHO do funil.
  const etapaGanhoId = etapas.find((e) => e.tipo === "GANHO")?.id ?? null;
  function repetirPedido(itens: ItemPedidoSeed[]) {
    if (etapaGanhoId) setModal({ tipo: "ganho", etapaId: etapaGanhoId, itensIniciais: itens });
  }

  // Abre o modal de fechamento. No GANHO de POS-VENDA, carrega as pecas
  // NECESSARIAS (planejadas no atendimento) como itens iniciais — sem duplicar as
  // que ja estejam na base (chave produtoCatalogoId); um pedido reaberto mantem o
  // que tinha. O staging e apagado no servidor apos o fechamento bem-sucedido.
  async function abrirModalPedido(
    tipo: "ganho" | "perdido",
    etapaId: string,
  ): Promise<void> {
    // So o GANHO pre-carrega o staging + o resumo do orcamento (venda E pos-venda).
    if (tipo !== "ganho") {
      setModal({ tipo, etapaId });
      return;
    }
    const base: (ItemPedidoSeed & { garantia?: boolean })[] = [];
    let orc: {
      frete: number | null;
      fretePagoPelaEmpresa: boolean;
      valorFinal: number;
      descontoInfo: { cupom: string | null; descontoPct: number | null; descValor: number } | null;
    } | undefined;
    try {
      const r = await fetch(`/api/negocios/${negocioId}/pecas-necessarias`);
      if (r.ok) {
        const d = await r.json();
        const jaTem = new Set(
          base.map((i) => i.produtoCatalogoId).filter(Boolean) as string[],
        );
        for (const p of d.pecas ?? []) {
          if (p.pecaId && jaTem.has(p.pecaId)) continue;
          base.push({
            produtoCatalogoId: p.pecaId,
            descricao: [p.nome, p.modelo, p.voltagem].filter(Boolean).join(" "),
            quantidade: p.quantidade,
            valorUnitario: p.precoSugerido ?? 0,
            garantia: p.garantia,
          });
        }
        // Resumo do orcamento -> pre-carga do modal (frete/empresa/valor final).
        const cobravel = base
          .filter((i) => !i.garantia)
          .reduce((a, i) => a + i.quantidade * i.valorUnitario, 0);
        const od = d.orc ?? {};
        const descPct = od.descontoPct ?? null;
        const valorFinal = calcularTotalFinal({
          totalCobravel: cobravel,
          descontoPct: descPct,
          frete: od.frete ?? null,
          fretePagoPelaEmpresa: od.fretePagoPelaEmpresa === true,
        });
        orc = {
          frete: od.frete ?? null,
          fretePagoPelaEmpresa: od.fretePagoPelaEmpresa === true,
          valorFinal,
          descontoInfo:
            descPct && descPct > 0
              ? { cupom: od.cupom ?? null, descontoPct: descPct, descValor: cobravel * (descPct / 100) }
              : null,
        };
      }
    } catch {
      // Falha ao carregar necessarias: abre o modal vazio (nao trava o fechamento).
    }
    setModal({ tipo, etapaId, itensIniciais: base.length ? base : undefined, orc });
  }

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

  // Inicia a conversa do lead (in-place): cria/garante e recarrega o painel para
  // o embed da conversa aparecer. Nao dispara nada — o embed permite o 1o envio.
  const iniciarConversa = useCallback(async () => {
    if (!detalhe || iniciandoConversa) return;
    setIniciandoConversa(true);
    try {
      const r = await fetch("/api/conversas/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: detalhe.cliente.id,
          finalidade: detalhe.finalidade,
        }),
      });
      if (r.ok) await carregar();
    } catch {
      // silencioso: o botao volta ao estado normal
    } finally {
      setIniciandoConversa(false);
    }
  }, [detalhe, iniciandoConversa, carregar]);

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
        const d = await r.json().catch(() => null);
        if (r.ok) {
          await carregar();
          onAtualizado();
          // Decisao gerou um orcamento numerado: confirma com o numero (Fatia 3.07).
          if (typeof d?.orcamentoNumero === "number") {
            toast.sucesso(`Orcamento ${formatarNumeroPedido(d.orcamentoNumero)} registrado.`);
          }
        } else {
          toast.erro(d?.erro ?? "Nao foi possivel salvar a alteracao.");
        }
        return r.ok;
      } catch {
        toast.erro("Falha de conexão ao salvar.");
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
                expandivel
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
                      {detalhe.pendente && (
                        <BadgePendente
                          motivo={detalhe.motivoPendenciaLabel ?? detalhe.motivoPendencia}
                        />
                      )}
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
            <div className="flex shrink-0 items-center gap-2">
              {detalhe && !detalhe.agente && (
                <button
                  onClick={() => void salvar({ agenteId: agenteIdAtual })}
                  className="flex items-center gap-1 rounded-lg bg-tiffany px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-tiffany-escuro"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Assumir
                </button>
              )}
              <button
                onClick={onFechar}
                aria-label="Fechar"
                className="rounded-lg p-1.5 text-medio/60 transition-colors hover:bg-black/5 hover:text-escuro"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
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
                  ehAdmin={ehAdmin}
                  onRegistrarInjetor={registrarInjetorThread}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-medio/50">
                  <MessageSquare className="h-8 w-8 text-medio/30" />
                  <p className="text-sm">Este lead ainda nao tem conversa.</p>
                  <button
                    onClick={() => void iniciarConversa()}
                    disabled={iniciandoConversa}
                    className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-60"
                  >
                    {iniciandoConversa ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MessageCircle className="h-4 w-4" />
                    )}
                    Iniciar conversa
                  </button>
                </div>
              )}
            </div>

            {/* Detalhes (rolagem propria) */}
            <div
              className={`${
                abaMobile === "detalhes" ? "flex" : "hidden"
              } min-h-0 w-full flex-col lg:flex lg:w-1/2`}
            >
              <div className="scroll-fino flex-1 space-y-5 overflow-y-auto p-4 pb-6">
                <BlocoCliente
                  cliente={detalhe.cliente}
                  onAtualizado={() => {
                    void carregar();
                    onAtualizado();
                  }}
                />

                {/* Orcamento do atendimento (pecas no pos-venda, produtos na venda). */}
                <BlocoOrcamento
                  negocioId={negocioId}
                  finalidade={detalhe.finalidade === "POS_VENDA" ? "POS_VENDA" : "VENDA"}
                  clienteNome={detalhe.cliente.nomeEfetivo}
                  clienteTelefone={detalhe.cliente.telefone}
                  onMensagemEnviada={(msg) => injetorThreadRef.current?.(msg)}
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
                  abrirModal={(tipo, etapaId) => void abrirModalPedido(tipo, etapaId)}
                />

                <BlocoProdutosInteresse
                  leadId={detalhe.cliente.id}
                  onAtualizado={() => void carregar()}
                />

                <BlocoPedidos
                  leadId={detalhe.cliente.id}
                  onRepetir={etapaGanhoId ? repetirPedido : undefined}
                />

                <BlocoAcompanhamento
                  detalhe={detalhe}
                  recarregar={carregar}
                  onAtualizado={onAtualizado}
                />

                <BlocoRastreio
                  detalhe={detalhe}
                  recarregar={carregar}
                  onAtualizado={onAtualizado}
                />

                {/* Assistencia (Local): so para pos-venda; cliente continua no funil. */}
                <BlocoAssistencia leadId={detalhe.cliente.id} />

                {/* Historico numerado de orcamentos do cliente (colapsado). */}
                <OrcamentosAnteriores leadId={detalhe.cliente.id} />

                <BlocoAgendar detalhe={detalhe} recarregar={carregar} />

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
                  {subAba === "negocio" && (
                    <div className="space-y-5">
                      <div>
                        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-medio/50">
                          Linha do tempo
                        </h4>
                        <TimelineNegocio detalhe={detalhe} />
                      </div>
                    </div>
                  )}
                  {subAba === "loja" && (
                    <LojaCliente
                      telefone={detalhe.cliente.telefone}
                      origem={detalhe.cliente.origem}
                      ehAdmin={ehAdmin}
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
          finalidade={detalhe.finalidade}
          negocioId={negocioId}
          itensIniciais={modal.itensIniciais}
          freteInicial={modal.orc?.frete}
          fretePagoPelaEmpresaInicial={modal.orc?.fretePagoPelaEmpresa}
          valorFinalInicial={modal.orc?.valorFinal}
          descontoInfo={modal.orc?.descontoInfo}
          onConfirmar={async (dados) => {
            // Ganho/Perdido limpam a pendencia (estados mutuamente exclusivos).
            const ok = await salvar({
              etapaId: modal.etapaId,
              ...dados,
              ...(detalhe.pendente ? { pendente: false } : {}),
            });
            if (!ok) throw new Error("falha");
            // Confirmacao da decisao (o toast do numero do orcamento, quando ha
            // itens, ja saiu no salvar). Fatia 3.07.
            toast.sucesso(
              modal.tipo === "ganho" ? "Pedido fechado como ganho." : "Negócio marcado como perdido.",
            );
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
export function NegocioAcoes({
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
  onTransferido,
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
  // Chamado apos transferir DONO ou mover SETOR com sucesso — o pai reconsulta a
  // LISTA (conversas do Inbox / board do Kanban) sem depender do socket (Fatia
  // 3.20). Opcional: onde a lista ja se atualiza por onAtualizado, pode ser omitido.
  onTransferido?: () => void;
  abrirModal: (tipo: "ganho" | "perdido", etapaId: string) => void;
}) {
  const toast = useToast();
  const agente = useAgente();
  const [addEtiqueta, setAddEtiqueta] = useState(false);
  const [transferindo, setTransferindo] = useState(false);
  const [destino, setDestino] = useState("");
  const [reativando, setReativando] = useState(false);
  const [vendedores, setVendedores] = useState<{ id: string; nome: string }[]>([]);
  const [moverAberto, setMoverAberto] = useState(false);

  // Mover atendimento entre finalidades: destino = a oposta da atual. Aparece para
  // quem tem acesso a finalidade DESTINO ou a de ORIGEM (a atual) — ou admin. Assim
  // o atendente que recebeu o cliente no setor errado (so tem acesso a origem) pode
  // corrigir. Mesma regra do endpoint. Fatia 3.18.
  const finalidadeDestino =
    detalhe.finalidade === "POS_VENDA" ? "VENDA" : "POS_VENDA";
  const podeMover =
    ehAdmin || !!agente?.acessoVenda || !!agente?.acessoPosVenda;

  const etapaGanho = etapas.find((e) => e.tipo === "GANHO");
  const etapaPerda = etapas.find((e) => e.tipo === "PERDIDO");
  const etapaAberta = etapas.find((e) => e.tipo === "ABERTA");

  // Estados mutuamente exclusivos: ABERTO / PENDENTE / GANHO / PERDIDO.
  const ehGanho = detalhe.status === "GANHO";
  const ehPerdido = detalhe.status === "PERDIDO";
  const ehPendente = detalhe.pendente;
  const [pendAbrir, setPendAbrir] = useState(false);
  // Motivo ESTRUTURADO da pendencia (Fatia 3.17): code predefinido + observacao.
  const [pendCode, setPendCode] = useState("");
  const [pendObs, setPendObs] = useState("");
  const [mudandoPend, setMudandoPend] = useState(false);

  // Reabre o negocio (volta a primeira etapa ABERTA => status ABERTO).
  async function reabrir() {
    if (!etapaAberta) return;
    await salvar({ etapaId: etapaAberta.id });
  }

  // Toggle Ganho: clicar quando ja ganho desmarca (reabre); senao abre o modal.
  function clicarGanho() {
    if (ehGanho) {
      void reabrir();
      return;
    }
    if (etapaGanho) abrirModal("ganho", etapaGanho.id);
  }
  function clicarPerdido() {
    if (ehPerdido) {
      void reabrir();
      return;
    }
    if (etapaPerda) abrirModal("perdido", etapaPerda.id);
  }
  // Toggle Pendente: ativo => desmarca; inativo => captura motivo e marca (se
  // estava ganho/perdido, reabre junto => volta a ABERTO+pendente).
  function clicarPendente() {
    if (ehPendente) {
      void salvar({ pendente: false });
      return;
    }
    setPendCode("");
    setPendObs("");
    setPendAbrir(true);
  }
  async function confirmarPendente() {
    if (!pendCode) {
      toast.erro("Escolha o motivo da pendência.");
      return;
    }
    const obs = pendObs.trim();
    if (pendCode === "OUTRO" && !obs) {
      toast.erro("Descreva o motivo (Outro).");
      return;
    }
    setMudandoPend(true);
    const body: Record<string, unknown> = {
      pendente: true,
      motivoPendenciaCode: pendCode,
      motivoPendencia: obs || null,
    };
    if ((ehGanho || ehPerdido) && etapaAberta) body.etapaId = etapaAberta.id;
    const ok = await salvar(body);
    setMudandoPend(false);
    if (ok) {
      setPendAbrir(false);
      setPendCode("");
      setPendObs("");
      toast.sucesso("Negócio marcado como pendente.");
    }
  }

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
    try {
      const r = await fetch(`/api/negocios/${negocioId}/etiquetas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etiquetaId }),
      });
      if (!r.ok) throw new Error();
      toast.sucesso("Etiqueta aplicada.");
    } catch {
      toast.erro("Não foi possível aplicar a etiqueta.");
    }
    await recarregar();
    onAtualizado();
  }

  async function removerEtiqueta(etiquetaId: string) {
    try {
      const r = await fetch(`/api/negocios/${negocioId}/etiquetas/${etiquetaId}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error();
      toast.sucesso("Etiqueta removida.");
    } catch {
      toast.erro("Não foi possível remover a etiqueta.");
    }
    await recarregar();
    onAtualizado();
  }

  async function reativar() {
    setReativando(true);
    try {
      const r = await fetch(`/api/negocios/${negocioId}/reativar`, {
        method: "POST",
      });
      if (r.ok) {
        toast.sucesso("Negocio reativado.");
        await recarregar();
        onAtualizado();
      } else {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel reativar.");
      }
    } catch {
      toast.erro("Falha de conexão.");
    } finally {
      setReativando(false);
    }
  }

  async function transferir() {
    if (!destino) return;
    try {
      const r = await fetch(`/api/leads/${detalhe.cliente.id}/transferir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agenteId: destino, finalidade: detalhe.finalidade }),
      });
      if (!r.ok) throw new Error();
      toast.sucesso("Cliente transferido.");
    } catch {
      toast.erro("Não foi possível transferir.");
    }
    setTransferindo(false);
    setDestino("");
    await recarregar();
    onAtualizado();
    onTransferido?.();
  }

  return (
    <section className="space-y-4 rounded-xl border border-black/5 bg-white p-4">
      {/* DECISAO do orcamento (Fatia 3.07): Pendente e Perdido lado a lado
          (secundarios, sutis); o GANHO em destaque abaixo, ocupando a largura dos
          dois. Clicar um estado ativo desmarca (volta a ABERTO). */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            onClick={clicarPendente}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              ehPendente
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "border border-amber-300 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-500/10"
            }`}
          >
            <PauseCircle className="h-4 w-4" /> Pendente
          </button>
          {etapaPerda && (
            <button
              onClick={clicarPerdido}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                ehPerdido
                  ? "bg-erro text-white hover:brightness-95"
                  : "border border-erro/40 text-erro hover:bg-erro/10"
              }`}
            >
              <XCircle className="h-4 w-4" /> Perdido
            </button>
          )}
        </div>
        {etapaGanho && (
          <button
            onClick={clicarGanho}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold text-white shadow-sm transition-transform hover:scale-[1.01] active:scale-100 ${
              ehGanho ? "bg-tiffany-escuro" : "bg-tiffany hover:bg-tiffany-escuro"
            }`}
          >
            <Trophy className="h-5 w-5" /> Ganho
          </button>
        )}
      </div>

      {/* Captura do MOTIVO da pendencia (Fatia 3.17): superficie escura da casa
          (nao branca), motivos predefinidos + observacao (obrigatoria em Outro). */}
      {pendAbrir && !ehPendente && (
        <div className="space-y-2.5 rounded-lg border border-white/10 bg-escuro p-3">
          <p className="text-xs font-semibold text-white/90">Motivo da pendência</p>
          <select
            value={pendCode}
            onChange={(e) => setPendCode(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-tiffany"
          >
            <option value="">Selecione um motivo...</option>
            {MOTIVOS_PENDENCIA.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
          <textarea
            value={pendObs}
            onChange={(e) => setPendObs(e.target.value)}
            rows={2}
            placeholder={
              pendCode === "OUTRO" ? "Descreva o motivo" : "Observação (opcional)"
            }
            className="scroll-fino w-full resize-none rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-tiffany"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setPendAbrir(false);
                setPendCode("");
                setPendObs("");
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              onClick={() => void confirmarPendente()}
              disabled={mudandoPend || !pendCode || (pendCode === "OUTRO" && !pendObs.trim())}
              className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-50"
            >
              {mudandoPend && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Marcar pendente
            </button>
          </div>
        </div>
      )}

      {/* Motivo da perda + reativar (quando perdido) */}
      {detalhe.status === "PERDIDO" && (
        <div className="space-y-2">
          {detalhe.motivoPerdaLabel && (
            <div className="rounded-lg border border-red-100 bg-red-50/60 p-3">
              <p className="text-xs font-semibold text-red-700">
                Motivo da perda: {detalhe.motivoPerdaLabel}
              </p>
              {detalhe.motivoPerdaObs && (
                <p className="mt-0.5 text-xs text-red-900/80">
                  {detalhe.motivoPerdaObs}
                </p>
              )}
            </div>
          )}
          <button
            onClick={() => void reativar()}
            disabled={reativando}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {reativando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Reativar negocio
          </button>
        </div>
      )}

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

      <Secao titulo="Gestão">
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
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setTransferindo((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-medio transition-colors hover:text-tiffany"
          >
            <Repeat className="h-3.5 w-3.5" /> Transferir cliente
          </button>
          {podeMover && (
            <button
              onClick={() => setMoverAberto(true)}
              title={`Mover atendimento para ${finalidadeDestino === "POS_VENDA" ? "Pos-venda" : "Vendas"}`}
              className="flex items-center gap-1.5 text-xs font-medium text-medio transition-colors hover:text-tiffany"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Mover para {finalidadeDestino === "POS_VENDA" ? "Pos-venda" : "Vendas"}
            </button>
          )}
        </div>
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
      </Secao>

      {/* Temperatura (so venda) */}
        {/* Temperatura so na VENDA. Pos-venda usa ganho/pendente/perdido +
            garantia (o campo Negocio.temperatura permanece no banco). */}
        {detalhe.finalidade !== "POS_VENDA" && (
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
        )}
      {/* Pendencia operacional */}
      <BlocoPendencia detalhe={detalhe} salvar={salvar} />

      {moverAberto && (
        <ModalMoverFinalidade
          leadId={detalhe.cliente.id}
          finalidadeOrigem={detalhe.finalidade}
          onFechar={() => setMoverAberto(false)}
          onConcluido={() => {
            setMoverAberto(false);
            void recarregar();
            onAtualizado();
            onTransferido?.();
          }}
        />
      )}
    </section>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-medium text-medio/70">{children}</label>
  );
}

// Seccao colapsavel compacta (Fatia 3.07): agrupa controles do painel (ex.:
// "Gestao") com titulo padronizado. So organizacao — nada de funcionalidade muda.
function Secao({
  titulo,
  children,
  inicialAberta = true,
}: {
  titulo: string;
  children: React.ReactNode;
  inicialAberta?: boolean;
}) {
  const [aberta, setAberta] = useState(inicialAberta);
  return (
    <div className="rounded-lg border border-black/5">
      <button
        onClick={() => setAberta((a) => !a)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-medio/50">
          {titulo}
        </span>
        <ChevronRight
          className={`h-4 w-4 text-medio/40 transition-transform ${aberta ? "rotate-90" : ""}`}
        />
      </button>
      {aberta && <div className="space-y-3 px-3 pb-3">{children}</div>}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Pendencia operacional: marcar/desmarcar com motivo. Quando pendente, mostra o
// motivo atual e permite remover; senao abre um campo de motivo para marcar.
// ----------------------------------------------------------------------------
function BlocoPendencia({
  detalhe,
  salvar,
}: {
  detalhe: DetalheNegocio;
  salvar: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const toast = useToast();
  const [salvando, setSalvando] = useState(false);

  async function desmarcar() {
    setSalvando(true);
    const ok = await salvar({ pendente: false });
    setSalvando(false);
    if (ok) toast.sucesso("Pendencia removida.");
  }

  // Marcar pendente agora e feito pelo botao "Pendente" (entre Ganho/Perdido).
  // Aqui mostramos o detalhe/motivo da pendencia e permitimos desmarcar.
  if (!detalhe.pendente) return null;

  return (
    <div>
      <Rotulo>Pendencia</Rotulo>
      <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
        <div className="flex items-start gap-2">
          <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-orange-700">
              {detalhe.motivoPendenciaLabel ?? "Negócio pendente"}
            </p>
            {detalhe.motivoPendencia && (
              <p className="mt-0.5 whitespace-pre-wrap text-xs text-orange-900/80">
                {detalhe.motivoPendencia}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => void desmarcar()}
          disabled={salvando}
          className="mt-2 flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-orange-700 ring-1 ring-orange-200 transition-colors hover:bg-orange-100 disabled:opacity-60"
        >
          {salvando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayCircle className="h-3.5 w-3.5" />
          )}
          Desmarcar pendencia
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Acompanhamento (pos-venda): nota fiscal (texto livre) e empresa faturada
// (select das ativas). Ambos opcionais. Persistem via PATCH /api/leads/[id].
// ----------------------------------------------------------------------------
type EmpresaOpcao = { id: string; nome: string };

export function BlocoAcompanhamento({
  detalhe,
  recarregar,
  onAtualizado,
}: {
  detalhe: DetalheNegocio;
  recarregar: () => Promise<void>;
  onAtualizado: () => void;
}) {
  const toast = useToast();
  const agente = useAgente();
  // Garantia: editavel por pos-venda (acesso) ou admin; demais so visualizam.
  const podeEditarGarantia =
    !!agente && (agente.papel === "ADMIN" || agente.acessoPosVenda);
  const cliente = detalhe.cliente;
  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);
  const [nf, setNf] = useState(cliente.notaFiscal ?? "");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setNf(cliente.notaFiscal ?? "");
  }, [cliente.notaFiscal]);

  useEffect(() => {
    fetch("/api/empresas-faturadas")
      .then((r) => (r.ok ? r.json() : { empresas: [] }))
      .then((d) => setEmpresas(d.empresas ?? []))
      .catch(() => undefined);
  }, []);

  // A empresa atual pode estar inativa (fora da lista de ativas): garante a opcao.
  const opcoes =
    cliente.empresaFaturada &&
    !empresas.some((e) => e.id === cliente.empresaFaturada!.id)
      ? [cliente.empresaFaturada, ...empresas]
      : empresas;

  async function salvar(body: Record<string, unknown>): Promise<void> {
    setSalvando(true);
    try {
      const r = await fetch(`/api/leads/${cliente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        await recarregar();
        onAtualizado();
        toast.sucesso("Salvo.");
      } else {
        const d = await r.json().catch(() => null);
        if (!(r.status === 400 && d?.erro === "nada a atualizar")) {
          toast.erro(d?.erro ?? "Nao foi possivel salvar.");
        }
      }
    } catch {
      toast.erro("Falha de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-black/5 bg-white p-4">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
        <ClipboardList className="h-3.5 w-3.5" /> Acompanhamento
        {salvando && <Loader2 className="h-3 w-3 animate-spin text-tiffany" />}
      </h4>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Rotulo>Nota fiscal</Rotulo>
          <div className="relative">
            <FileText className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-medio/40" />
            <input
              value={nf}
              onChange={(e) => setNf(e.target.value)}
              onBlur={() => {
                if ((nf.trim() || null) !== (cliente.notaFiscal ?? null)) {
                  void salvar({ notaFiscal: nf.trim() });
                }
              }}
              placeholder="Número NF"
              className="w-full rounded-lg border border-black/10 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-tiffany"
            />
          </div>
        </div>

        <div>
          <Rotulo>Empresa faturada</Rotulo>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-medio/40" />
            <select
              value={cliente.empresaFaturadaId ?? ""}
              disabled={salvando}
              onChange={(e) =>
                void salvar({ empresaFaturadaId: e.target.value || null })
              }
              className="w-full appearance-none rounded-lg border border-black/10 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-tiffany disabled:opacity-60"
            >
              <option value="">—</option>
              {opcoes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
          {empresas.length === 0 && (
            <p className="mt-1 text-[11px] text-medio/50">
              Nenhuma empresa ativa cadastrada.
            </p>
          )}
        </div>
      </div>

      {/* Garantia: conceito de POS-VENDA. So aparece na pos-venda, como escolha
          binaria com cor (Com=verde, Sem=ambar); sem "Nao definido" na UI (se vier
          null, nenhum fica ativo e o hint pede para definir). Some na venda. */}
      {detalhe.finalidade === "POS_VENDA" && (
        <div>
          <Rotulo>Garantia</Rotulo>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                [true, "Com garantia"],
                [false, "Sem garantia"],
              ] as [boolean, string][]
            ).map(([valor, rotulo]) => {
              const ativo = (cliente.garantia ?? null) === valor;
              const corAtivo =
                valor === true
                  ? "border-green-500 bg-green-50 text-green-700"
                  : "border-amber-500 bg-amber-50 text-amber-700";
              return (
                <button
                  key={String(valor)}
                  disabled={!podeEditarGarantia || salvando}
                  onClick={() => {
                    if (ativo) return;
                    void salvar({ garantia: valor });
                  }}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    ativo
                      ? corAtivo
                      : "border-black/10 bg-white text-medio/70 hover:bg-black/5"
                  } ${!podeEditarGarantia ? "cursor-default opacity-90" : ""}`}
                >
                  {valor === true ? (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  ) : (
                    <ShieldOff className="h-3.5 w-3.5" />
                  )}
                  {rotulo}
                </button>
              );
            })}
          </div>
          {cliente.garantia == null && (
            <p className="mt-1 text-[11px] text-medio/50">
              Garantia ainda nao definida.
            </p>
          )}
          {!podeEditarGarantia && (
            <p className="mt-1 text-[11px] text-medio/50">
              Somente pos-venda edita a garantia.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Rastreio e transporte do NEGOCIO (venda e pos-venda). Transportadora principal
// + datas de envio/previsao (PATCH negocio) e MULTIPLOS codigos de rastreio
// (POST/DELETE), cada um com transportadora opcional. Reusado no Kanban e no Inbox.
// ----------------------------------------------------------------------------
export function BlocoRastreio({
  detalhe,
  recarregar,
  onAtualizado,
}: {
  detalhe: DetalheNegocio;
  recarregar: () => Promise<void>;
  onAtualizado: () => void;
}) {
  const toast = useToast();
  const [transportadora, setTransportadora] = useState(
    detalhe.transportadora ?? "",
  );
  const [dataEnvio, setDataEnvio] = useState(dataNascParaInput(detalhe.dataEnvio));
  const [previsao, setPrevisao] = useState(
    dataNascParaInput(detalhe.previsaoChegada),
  );
  const [novoCodigo, setNovoCodigo] = useState("");
  const [novaTransp, setNovaTransp] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  useEffect(() => {
    setTransportadora(detalhe.transportadora ?? "");
  }, [detalhe.transportadora]);
  useEffect(() => {
    setDataEnvio(dataNascParaInput(detalhe.dataEnvio));
  }, [detalhe.dataEnvio]);
  useEffect(() => {
    setPrevisao(dataNascParaInput(detalhe.previsaoChegada));
  }, [detalhe.previsaoChegada]);

  async function salvarTransporte(body: Record<string, unknown>): Promise<void> {
    setSalvando(true);
    try {
      const r = await fetch(`/api/negocios/${detalhe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        await recarregar();
        onAtualizado();
        toast.sucesso("Salvo.");
      } else {
        const d = await r.json().catch(() => null);
        if (!(r.status === 400 && d?.erro === "nada a atualizar")) {
          toast.erro(d?.erro ?? "Nao foi possivel salvar.");
        }
      }
    } catch {
      toast.erro("Falha de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  async function adicionarCodigo(): Promise<void> {
    const codigo = novoCodigo.trim();
    if (!codigo || salvando) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/negocios/${detalhe.id}/rastreios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo,
          transportadora: novaTransp.trim() || null,
        }),
      });
      if (r.ok) {
        setNovoCodigo("");
        setNovaTransp("");
        await recarregar();
        onAtualizado();
        toast.sucesso("Código adicionado.");
      } else {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel adicionar o codigo.");
      }
    } catch {
      toast.erro("Falha de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  async function removerCodigo(rid: string): Promise<void> {
    // Otimista: some da lista na hora; em erro, recarregar restaura a verdade.
    setRemovendo(rid);
    try {
      const r = await fetch(`/api/negocios/${detalhe.id}/rastreios/${rid}`, {
        method: "DELETE",
      });
      if (r.ok) {
        await recarregar();
        onAtualizado();
      } else {
        toast.erro("Nao foi possivel remover.");
        await recarregar();
      }
    } catch {
      toast.erro("Falha de conexão.");
      await recarregar();
    } finally {
      setRemovendo(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-black/5 bg-white p-4">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
        <Truck className="h-3.5 w-3.5" /> Rastreio e transporte
        {salvando && <Loader2 className="h-3 w-3 animate-spin text-tiffany" />}
      </h4>

      {/* Transportadora principal + datas. As duas datas ficam numa grade de 2
          colunas (mesma proporcao dos demais campos do painel), evitando o
          desalinhamento que havia com 3 colunas — labels de tamanhos diferentes
          nao quebram e os inputs alinham lado a lado. */}
      <div className="space-y-3">
        <div>
          <Rotulo>Transportadora (principal)</Rotulo>
          <input
            value={transportadora}
            onChange={(e) => setTransportadora(e.target.value)}
            onBlur={() => {
              if ((transportadora.trim() || null) !== (detalhe.transportadora ?? null)) {
                void salvarTransporte({ transportadora: transportadora.trim() });
              }
            }}
            placeholder="Ex.: Correios, Jadlog..."
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Rotulo>Data de envio</Rotulo>
            <input
              type="date"
              value={dataEnvio}
              onChange={(e) => {
                setDataEnvio(e.target.value);
                void salvarTransporte({ dataEnvio: e.target.value || null });
              }}
              className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </div>
          <div>
            <Rotulo>Previsao de chegada</Rotulo>
            <input
              type="date"
              value={previsao}
              onChange={(e) => {
                setPrevisao(e.target.value);
                void salvarTransporte({ previsaoChegada: e.target.value || null });
              }}
              className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </div>
        </div>
      </div>

      {/* Codigos de rastreio (multiplos) */}
      <div>
        <Rotulo>Codigos de rastreio</Rotulo>
        {detalhe.rastreios.length === 0 ? (
          <p className="mb-2 text-xs text-medio/50">
            Nenhum codigo de rastreio ainda.
          </p>
        ) : (
          <ul className="mb-2 space-y-1.5">
            {detalhe.rastreios.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2 rounded-lg border border-black/5 bg-fundo px-2.5 py-1.5"
              >
                <Truck className="h-3.5 w-3.5 shrink-0 text-medio/40" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-escuro">
                    {r.codigo}
                  </p>
                  {r.transportadora && (
                    <p className="truncate text-[11px] text-medio/50">
                      {r.transportadora}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => void removerCodigo(r.id)}
                  disabled={removendo === r.id}
                  title="Remover codigo"
                  className="shrink-0 rounded p-1 text-medio/50 transition-colors hover:bg-black/5 hover:text-erro disabled:opacity-50"
                >
                  {removendo === r.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Adicionar codigo */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <input
              value={novoCodigo}
              onChange={(e) => setNovoCodigo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void adicionarCodigo()}
              placeholder="Codigo de rastreio"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </div>
          <div className="min-w-32 flex-1">
            <input
              value={novaTransp}
              onChange={(e) => setNovaTransp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void adicionarCodigo()}
              placeholder="Transportadora"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </div>
          <button
            onClick={() => void adicionarCodigo()}
            disabled={salvando || !novoCodigo.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Adicionar codigo
          </button>
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// Agendar contato: cria um lembrete (data/hora + nota) e lista os proximos
// lembretes pendentes do cliente, com acao de concluir.
// ----------------------------------------------------------------------------
function BlocoAgendar({
  detalhe,
  recarregar,
}: {
  detalhe: DetalheNegocio;
  recarregar: () => Promise<void>;
}) {
  const toast = useToast();
  const [quando, setQuando] = useState("");
  const [nota, setNota] = useState("");
  const [alerta, setAlerta] = useState<number | "">("");
  const [salvando, setSalvando] = useState(false);

  async function agendar() {
    if (!quando) {
      toast.erro("Escolha data e hora.");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch("/api/lembretes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: detalhe.cliente.id,
          negocioId: detalhe.id,
          finalidade: detalhe.finalidade,
          dataHora: new Date(quando).toISOString(),
          nota: nota.trim() || null,
          lembrarAntesMin: alerta === "" ? null : alerta,
        }),
      });
      if (r.ok) {
        setQuando("");
        setNota("");
        setAlerta("");
        toast.sucesso("Contato agendado.");
        await recarregar();
      } else {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel agendar.");
      }
    } catch {
      toast.erro("Falha de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  async function concluir(id: string) {
    try {
      const r = await fetch(`/api/lembretes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "feito" }),
      });
      if (r.ok) await recarregar();
    } catch {
      toast.erro("Falha ao concluir.");
    }
  }

  const proximos = detalhe.lembretes ?? [];

  return (
    <section className="space-y-3 rounded-xl border border-black/5 bg-white p-4">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
        <AlarmClock className="h-3.5 w-3.5" /> Agendar contato
      </h4>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="datetime-local"
          value={quando}
          onChange={(e) => setQuando(e.target.value)}
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
        />
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (opcional)"
          onKeyDown={(e) => {
            if (e.key === "Enter") void agendar();
          }}
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
        />
      </div>
      <select
        value={alerta}
        onChange={(e) =>
          setAlerta(e.target.value === "" ? "" : Number(e.target.value))
        }
        title="Alerta antecipado no sino"
        className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
      >
        <option value="">Sem alerta antecipado</option>
        <option value={5}>Alertar 5 min antes</option>
        <option value={15}>Alertar 15 min antes</option>
        <option value={30}>Alertar 30 min antes</option>
        <option value={60}>Alertar 1 hora antes</option>
        <option value={1440}>Alertar 1 dia antes</option>
      </select>
      <button
        onClick={() => void agendar()}
        disabled={salvando || !quando}
        className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-50"
      >
        {salvando ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarPlus className="h-4 w-4" />
        )}
        Agendar
      </button>

      {proximos.length > 0 && (
        <ul className="space-y-1.5 border-t border-black/5 pt-3">
          {proximos.map((l: LembreteItem) => (
            <li
              key={l.id}
              className="flex items-center gap-2 rounded-lg bg-fundo px-3 py-2 text-sm"
            >
              <AlarmClock className="h-3.5 w-3.5 shrink-0 text-tiffany" />
              <div className="min-w-0 flex-1">
                <p className="text-escuro">
                  {new Date(l.dataHora).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                {l.nota && (
                  <p className="truncate text-xs text-medio/60">{l.nota}</p>
                )}
              </div>
              <button
                onClick={() => void concluir(l.id)}
                title="Marcar feito"
                className="rounded-lg p-1 text-medio/50 hover:bg-green-50 hover:text-green-600"
              >
                <Check className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Notas internas do negocio.
// ----------------------------------------------------------------------------
export function Notas({
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
