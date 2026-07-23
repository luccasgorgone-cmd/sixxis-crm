"use client";

// Coluna direita do Inbox: painel COMPLETO do cliente, com as mesmas informacoes
// do Kanban (sem duplicar componentes — importa e reusa).
// NIVEL CLIENTE (sempre, por leadId): BlocoCliente (+ enderecos), produtos de
// interesse e historico do cliente.
// NIVEL NEGOCIO (so quando a conversa tem negocio da sua finalidade): acoes do
// negocio (ganho/pendente/perdido, valor, etapa, peca/produtos), acompanhamento
// (nota fiscal / garantia / empresa) e notas do negocio. Assim o pos-venda tem
// na CONVERSA os mesmos controles do Kanban (reusa NegocioAcoes/ModalFechamento).
// Escopo por usuario garantido nos endpoints (/api/leads/[id], /api/negocios/[id]).
import { useCallback, useEffect, useState } from "react";
import { Loader2, UserX } from "lucide-react";
import { BlocoCliente, type ClientePainel } from "@/components/cliente/BlocoCliente";
import { BlocoProdutosInteresse } from "@/components/cliente/BlocoProdutosInteresse";
import { BlocoPedidos } from "@/components/cliente/BlocoPedidos";
import { BlocoAssistencia } from "@/components/local/BlocoAssistencia";
import {
  BlocoOrcamento,
  OrcamentosAnteriores,
  avisarOrcamentosAtualizados,
} from "@/components/pecas/BlocoOrcamento";
import { HistoricoCliente } from "@/components/cliente/HistoricoCliente";
import { LojaCliente } from "@/components/loja/LojaCliente";
import {
  BlocoAcompanhamento,
  BlocoRastreio,
  BlocoAgendar,
  NegocioAcoes,
  Notas,
} from "@/components/kanban/PainelNegocio";
import { ModalFechamento, type DadosFechamento } from "@/components/kanban/ModalFechamento";
import { fetchCacheado } from "@/lib/cacheClient";
import {
  SecaoTemperatura,
  SecaoEtapa,
  SecaoSegmento,
  SecaoDecisoes,
  SecaoEtiquetas,
} from "@/components/shared/SecoesPainel";
import { useToast } from "@/components/ui/Toast";
import type {
  DetalheNegocio,
  ObservacaoOpcao,
  Etapa,
  AgenteResumo,
  EtiquetaChip,
} from "@/components/kanban/tipos";
import type { MensagemItem } from "@/components/inbox/tipos";

export function PainelClienteInbox({
  leadId,
  negocioId,
  podeEditar = true,
  ehAdmin = false,
  agenteIdAtual = "",
  onMensagemEnviada,
  onTransferido,
}: {
  leadId: string;
  // Negocio da finalidade da conversa (null = sem negocio -> omite nivel negocio).
  negocioId?: string | null;
  podeEditar?: boolean;
  ehAdmin?: boolean;
  agenteIdAtual?: string;
  // Injeta na thread aberta do Inbox a bolha do PDF enviada pelo orcamento (3.15).
  onMensagemEnviada?: (msg: MensagemItem) => void;
  // Transferencia de dono/setor concluida: o Inbox reconsulta a lista de conversas
  // (sem depender do socket) para o card sair/entrar do setor certo (Fatia 3.20).
  onTransferido?: () => void;
}) {
  const toast = useToast();
  const [cliente, setCliente] = useState<ClientePainel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const carregarCliente = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/leads/${leadId}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setCliente(d.cliente ?? null);
      setErro(false);
    } catch {
      setErro(true);
      setCliente(null);
    } finally {
      setCarregando(false);
    }
  }, [leadId]);

  useEffect(() => {
    void carregarCliente();
  }, [carregarCliente]);

  // Nivel negocio (opcional): detalhe do negocio + presets de nota.
  const [detalhe, setDetalhe] = useState<DetalheNegocio | null>(null);
  const [presets, setPresets] = useState<ObservacaoOpcao[]>([]);
  // Listas auxiliares para as acoes de negocio (etapas do funil, etiquetas, agentes).
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [etiquetas, setEtiquetas] = useState<EtiquetaChip[]>([]);
  const [agentes, setAgentes] = useState<AgenteResumo[]>([]);
  // Modal de fechamento (ganho/perdido) — mesmo componente/fluxo do Kanban.
  const [modal, setModal] = useState<{
    tipo: "ganho" | "perdido";
    etapaId: string;
  } | null>(null);

  // Ao TROCAR de cliente (leadId muda), zera IMEDIATAMENTE cliente/detalhe/erro —
  // assim o painel nao exibe a foto/dados do cliente ANTERIOR enquanto o fetch do
  // novo esta em voo (bug do avatar residual, Fatia 3.18). Efeito separado dos de
  // fetch para NAO piscar o skeleton nos recarregamentos por salvamento (mesmo
  // leadId). Os efeitos de fetch abaixo repovoam.
  useEffect(() => {
    setCliente(null);
    setDetalhe(null);
    setErro(false);
    setCarregando(true);
  }, [leadId]);

  // Ao TROCAR de negocio SEM trocar de lead (ex.: mover setor do MESMO cliente
  // muda o negocioId), zera o detalhe antes do refetch para nao exibir o negocio
  // ANTERIOR. Prop-driven (nao dispara nos saves, que mantem o mesmo negocioId).
  // Fatia 3.20.
  useEffect(() => {
    setDetalhe(null);
  }, [negocioId]);

  const carregarNegocio = useCallback(async () => {
    if (!negocioId) {
      setDetalhe(null);
      return;
    }
    try {
      const r = await fetch(`/api/negocios/${negocioId}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setDetalhe((d.negocio as DetalheNegocio) ?? null);
    } catch {
      setDetalhe(null);
    }
  }, [negocioId]);

  useEffect(() => {
    void carregarNegocio();
  }, [carregarNegocio]);

  // Listas quase-estaticas (etapas/etiquetas/agentes/observacoes): cacheadas no
  // client (Fatia L) e carregadas UMA vez por montagem — deps [ehAdmin], nao
  // [negocioId] — para NAO reexecutar a cada troca de conversa (antes eram 4
  // fetches por troca; agora 0). Dados client-global, nao dependem do negocio.
  useEffect(() => {
    fetchCacheado<{ observacoes?: ObservacaoOpcao[] }>("/api/observacoes")
      .then((d) => setPresets(d.observacoes ?? []))
      .catch(() => undefined);
    fetchCacheado<{ etapas?: Etapa[] }>("/api/etapas")
      .then((d) => setEtapas(d.etapas ?? []))
      .catch(() => undefined);
    fetchCacheado<{ etiquetas?: EtiquetaChip[] }>("/api/etiquetas")
      .then((d) => setEtiquetas(d.etiquetas ?? []))
      .catch(() => undefined);
    if (ehAdmin) {
      fetchCacheado<{ agentes?: AgenteResumo[] }>("/api/agentes")
        .then((d) => setAgentes(d.agentes ?? []))
        .catch(() => undefined);
    }
  }, [ehAdmin]);

  // Etapas do funil da finalidade do negocio (para achar Ganho/Perdido e o select).
  const etapasFunil = detalhe
    ? etapas.filter(
        (e) =>
          !e.finalidade ||
          e.finalidade === "AMBAS" ||
          e.finalidade === detalhe.finalidade,
      )
    : [];

  // PATCH do negocio (mesmo contrato do Kanban): salva e recarrega cliente+negocio.
  const salvar = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      if (!negocioId) return false;
      try {
        const r = await fetch(`/api/negocios/${negocioId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (r.ok) {
          await carregarNegocio();
          void carregarCliente();
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
    [negocioId, carregarNegocio, carregarCliente, toast],
  );

  const podeAcoesNegocio = podeEditar && !!detalhe && !!negocioId;

  return (
    <div className="scroll-fino h-full space-y-5 overflow-y-auto bg-fundo p-4">
      {carregando && !cliente ? (
        <div className="skeleton h-64 w-full rounded-xl" />
      ) : erro || !cliente ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/10 bg-white p-6 text-center">
          <UserX className="h-6 w-6 text-medio/40" />
          <p className="text-xs text-medio/60">
            Nao foi possivel carregar os dados do cliente.
          </p>
          <button
            onClick={() => void carregarCliente()}
            className="mt-1 rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium text-medio hover:border-tiffany hover:text-tiffany"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <>
          {carregando && (
            <div className="flex items-center gap-1.5 text-[11px] text-medio/50">
              <Loader2 className="h-3 w-3 animate-spin" />
              atualizando...
            </div>
          )}

          {/* (a) Dados do cliente (sempre). key por lead forca remontagem ao trocar
              de cliente — reforca o reset do avatar residual (Fatia 3.18). */}
          <BlocoCliente
            key={cliente.id}
            cliente={cliente}
            podeEditar={podeEditar}
            onAtualizado={() => void carregarCliente()}
          />

          {/* Ordem unificada dos dois paineis (Fatia I):
              1. Cliente  2. Produtos de interesse  3. Temperatura(venda)
              4. Etiquetas  5. Etapa  6. Segmento(venda)  7. Orcamento(+decisoes)
              8. Orcamentos anteriores  9. Pedidos  10. Assistencia(pos-venda)
              11. Acompanhamento  12. Rastreio  13. Agendar  14. Gestao
              15. Notas/Historico */}

          {/* 2. Produtos de interesse */}
          <BlocoProdutosInteresse leadId={leadId} />

          {/* 3. Temperatura (so venda) */}
          {detalhe && negocioId && podeAcoesNegocio && (
            <SecaoTemperatura
              temperatura={detalhe.temperatura}
              finalidade={detalhe.finalidade}
              salvar={salvar}
            />
          )}

          {/* 4. Etiquetas (abaixo da Temperatura na venda; ocupa o lugar dela na
              pos-venda). */}
          {detalhe && negocioId && podeAcoesNegocio && (
            <SecaoEtiquetas
              etiquetas={etiquetas}
              aplicadas={detalhe.etiquetas}
              negocioId={negocioId}
              recarregar={carregarNegocio}
              onAtualizado={() => void carregarCliente()}
            />
          )}

          {/* 5. Etapa */}
          {detalhe && negocioId && podeAcoesNegocio && (
            <SecaoEtapa
              etapaId={detalhe.etapaId}
              etapas={etapasFunil}
              salvar={salvar}
              abrirModal={(tipo, etapaId) => setModal({ tipo, etapaId })}
            />
          )}

          {/* 6. Segmento (Varejo/Atacado): so na VENDA. */}
          {detalhe && negocioId && podeAcoesNegocio && detalhe.finalidade !== "POS_VENDA" && (
            <SecaoSegmento leadId={leadId} onAtualizado={() => void carregarCliente()} />
          )}

          {/* 7. Orcamento do atendimento com as DECISOES no rodape. */}
          {negocioId && detalhe?.finalidade && (
            <BlocoOrcamento
              negocioId={negocioId}
              finalidade={detalhe.finalidade === "POS_VENDA" ? "POS_VENDA" : "VENDA"}
              clienteNome={cliente.nomeEfetivo}
              clienteTelefone={cliente.telefone}
              onMensagemEnviada={onMensagemEnviada}
              rodape={
                detalhe && podeAcoesNegocio ? (
                  <SecaoDecisoes
                    detalhe={detalhe}
                    etapas={etapasFunil}
                    salvar={salvar}
                    recarregar={carregarNegocio}
                    onAtualizado={() => void carregarCliente()}
                    negocioId={negocioId}
                    abrirModal={(tipo, etapaId) => setModal({ tipo, etapaId })}
                  />
                ) : undefined
              }
            />
          )}

          {/* 8. Historico numerado de orcamentos do cliente (colapsado). */}
          <OrcamentosAnteriores leadId={leadId} />

          {/* 9. Pedidos do cliente (logo abaixo de Orcamentos anteriores).
              Sem "repetir" no inbox. */}
          <BlocoPedidos leadId={leadId} />

          {/* 10. Assistencia (Local): so na pos-venda. */}
          {detalhe?.finalidade === "POS_VENDA" && <BlocoAssistencia leadId={leadId} />}

          {/* 11. Acompanhamento e 12. Rastreio */}
          {detalhe && negocioId && (
            <>
              <BlocoAcompanhamento
                detalhe={detalhe}
                recarregar={carregarNegocio}
                onAtualizado={() => void carregarNegocio()}
              />
              <BlocoRastreio
                detalhe={detalhe}
                recarregar={carregarNegocio}
                onAtualizado={() => void carregarNegocio()}
              />
            </>
          )}

          {/* 13. Agendar contato */}
          {detalhe && negocioId && (
            <BlocoAgendar detalhe={detalhe} recarregar={carregarNegocio} />
          )}

          {/* 14. Gestao (dono / transferir / mover setor) */}
          {detalhe && negocioId && podeAcoesNegocio && (
            <NegocioAcoes
              detalhe={detalhe}
              ehAdmin={ehAdmin}
              agenteIdAtual={agenteIdAtual}
              agentes={agentes}
              negocioId={negocioId}
              salvar={salvar}
              recarregar={carregarNegocio}
              onAtualizado={() => void carregarCliente()}
              onTransferido={onTransferido}
            />
          )}

          {/* 15. Notas (+ Historico do cliente logo apos) */}
          {detalhe && negocioId && (
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-medio/50">
                Notas
              </h4>
              <Notas
                detalhe={detalhe}
                negocioId={negocioId}
                presets={presets}
                recarregar={carregarNegocio}
              />
            </div>
          )}

          {/* Historico do cliente (nivel cliente, sempre) */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-medio/50">
              Historico
            </h4>
            <HistoricoCliente leadId={leadId} />
          </div>

          {/* Loja (paridade com o Kanban): cadastro/pedidos da loja para
              consulta. MESMO componente, sem duplicacao. */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-medio/50">
              Loja
            </h4>
            <LojaCliente telefone={cliente.telefone} origem={cliente.origem} />
          </div>
        </>
      )}

      {/* Fechamento (ganho/perdido) — mesmo modal e regra do Kanban. */}
      {modal && detalhe && (
        <ModalFechamento
          tipo={modal.tipo}
          valorInicial={detalhe.valor}
          finalidade={detalhe.finalidade}
          negocioId={negocioId ?? undefined}
          onConfirmar={async (dados: DadosFechamento) => {
            // Ganho/Perdido limpam a pendencia (estados mutuamente exclusivos).
            const ok = await salvar({
              etapaId: modal.etapaId,
              ...dados,
              ...(detalhe.pendente ? { pendente: false } : {}),
            });
            if (!ok) throw new Error("falha");
            // Revalida o historico de orcamentos sem refresh (Fatia C).
            avisarOrcamentosAtualizados(leadId);
            setModal(null);
          }}
          onCancelar={() => setModal(null)}
        />
      )}
    </div>
  );
}
