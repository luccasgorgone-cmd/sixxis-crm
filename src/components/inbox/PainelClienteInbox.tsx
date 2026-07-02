"use client";

// Coluna de dados do CLIENTE no Inbox (direita). Busca o cliente completo em
// GET /api/leads/[id] (mesmo shape do negocio.cliente do Kanban) e renderiza o
// BlocoCliente — assim email/CPF/nascimento/endereco/anuncio aparecem no Inbox
// igual ao Kanban e a supervisao. Escopo por usuario garantido no endpoint.
import { useCallback, useEffect, useState } from "react";
import { Loader2, UserX } from "lucide-react";
import { BlocoCliente, type ClientePainel } from "@/components/cliente/BlocoCliente";

export function PainelClienteInbox({
  leadId,
  podeEditar = true,
}: {
  leadId: string;
  podeEditar?: boolean;
}) {
  const [cliente, setCliente] = useState<ClientePainel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
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
    void carregar();
  }, [carregar]);

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
            onClick={() => void carregar()}
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
          <BlocoCliente
            cliente={cliente}
            podeEditar={podeEditar}
            onAtualizado={() => void carregar()}
          />
        </>
      )}
    </div>
  );
}
