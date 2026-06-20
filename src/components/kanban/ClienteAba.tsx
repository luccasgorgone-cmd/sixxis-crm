"use client";

// Aba "Cliente" do painel: dono atual, acoes Assumir/Transferir e o historico
// COMPLETO do cliente (contatos, compras, pedidos da loja e atividades).
import { useState, useEffect } from "react";
import { UserPlus, Repeat, Loader2 } from "lucide-react";
import { HistoricoCliente } from "@/components/cliente/HistoricoCliente";
import type { VendedorOpcao, Finalidade } from "./tipos";

export function ClienteAba({
  leadId,
  dono,
  finalidade,
  onMudou,
}: {
  leadId: string;
  dono: { id: string; nome: string } | null;
  finalidade: Finalidade;
  onMudou: () => void;
}) {
  const [vendedores, setVendedores] = useState<VendedorOpcao[]>([]);
  const [acao, setAcao] = useState(false);
  const [transferindo, setTransferindo] = useState(false);
  const [destino, setDestino] = useState("");

  // Vendedores da equipe da finalidade (para transferir).
  useEffect(() => {
    fetch(`/api/vendedores?finalidade=${finalidade}`)
      .then((r) => (r.ok ? r.json() : { vendedores: [] }))
      .then((d) => setVendedores(d.vendedores ?? []))
      .catch(() => undefined);
  }, [finalidade]);

  async function assumir() {
    setAcao(true);
    try {
      await fetch(`/api/leads/${leadId}/assumir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalidade }),
      });
      onMudou();
    } finally {
      setAcao(false);
    }
  }

  async function transferir() {
    if (!destino) return;
    setAcao(true);
    try {
      await fetch(`/api/leads/${leadId}/transferir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agenteId: destino, finalidade }),
      });
      setTransferindo(false);
      setDestino("");
      onMudou();
    } finally {
      setAcao(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-black/5 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-medio/50">
          Dono do cliente
        </p>
        <p className="mt-1 text-sm font-medium text-escuro">
          {dono?.nome ?? "Sem dono"}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {!dono && (
            <button
              onClick={() => void assumir()}
              disabled={acao}
              className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
            >
              {acao ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Assumir cliente
            </button>
          )}
          <button
            onClick={() => setTransferindo((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            <Repeat className="h-4 w-4" /> Transferir
          </button>
        </div>

        {transferindo && (
          <div className="mt-3 flex gap-2">
            <select
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className="flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            >
              <option value="">Escolher vendedor...</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
            <button
              onClick={() => void transferir()}
              disabled={acao || !destino}
              className="rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
            >
              Confirmar
            </button>
          </div>
        )}
      </section>

      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-medio/50">
          Historico do cliente
        </h4>
        <HistoricoCliente leadId={leadId} />
      </section>
    </div>
  );
}
