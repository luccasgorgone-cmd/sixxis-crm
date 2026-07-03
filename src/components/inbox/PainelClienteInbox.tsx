"use client";

// Coluna direita do Inbox: painel COMPLETO do cliente, com as mesmas informacoes
// do Kanban (sem duplicar componentes — importa e reusa).
// NIVEL CLIENTE (sempre, por leadId): BlocoCliente (+ enderecos), produtos de
// interesse e historico do cliente.
// NIVEL NEGOCIO (so quando a conversa tem negocio da sua finalidade):
// acompanhamento (nota fiscal / garantia / empresa) e notas do negocio.
// Escopo por usuario garantido nos endpoints (/api/leads/[id], /api/negocios/[id]).
import { useCallback, useEffect, useState } from "react";
import { Loader2, UserX } from "lucide-react";
import { BlocoCliente, type ClientePainel } from "@/components/cliente/BlocoCliente";
import { BlocoProdutosInteresse } from "@/components/cliente/BlocoProdutosInteresse";
import { HistoricoCliente } from "@/components/cliente/HistoricoCliente";
import {
  BlocoAcompanhamento,
  Notas,
} from "@/components/kanban/PainelNegocio";
import type { DetalheNegocio, ObservacaoOpcao } from "@/components/kanban/tipos";

export function PainelClienteInbox({
  leadId,
  negocioId,
  podeEditar = true,
}: {
  leadId: string;
  // Negocio da finalidade da conversa (null = sem negocio -> omite nivel negocio).
  negocioId?: string | null;
  podeEditar?: boolean;
}) {
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

  useEffect(() => {
    if (!negocioId) return;
    fetch("/api/observacoes")
      .then((r) => (r.ok ? r.json() : { observacoes: [] }))
      .then((d) => setPresets(d.observacoes ?? []))
      .catch(() => undefined);
  }, [negocioId]);

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

          {/* Nivel cliente (sempre) */}
          <BlocoCliente
            cliente={cliente}
            podeEditar={podeEditar}
            onAtualizado={() => void carregarCliente()}
          />

          <BlocoProdutosInteresse leadId={leadId} />

          {/* Nivel negocio (so quando ha negocio da finalidade da conversa) */}
          {detalhe && negocioId && (
            <>
              <BlocoAcompanhamento
                detalhe={detalhe}
                recarregar={carregarNegocio}
                onAtualizado={() => void carregarNegocio()}
              />
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
            </>
          )}

          {/* Historico do cliente (nivel cliente, sempre) */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-medio/50">
              Historico
            </h4>
            <HistoricoCliente leadId={leadId} />
          </div>
        </>
      )}
    </div>
  );
}
