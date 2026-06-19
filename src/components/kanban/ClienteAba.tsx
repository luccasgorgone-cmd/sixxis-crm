"use client";

// Aba "Cliente" do painel: dono atual, acoes Assumir/Transferir e a linha do
// tempo do CLIENTE (Atividade).
import { useState, useEffect, useCallback } from "react";
import {
  UserPlus,
  Repeat,
  Loader2,
  Sparkles,
  ArrowRight,
  UserCheck,
  StickyNote,
  Tag,
  Trophy,
  XCircle,
  DollarSign,
  Phone,
} from "lucide-react";
import type { ItemAtividade, VendedorOpcao } from "./tipos";

const ICONE_ATIV: Record<string, typeof Tag> = {
  CRIACAO: Sparkles,
  CONTATO: Phone,
  ATRIBUICAO: UserCheck,
  TRANSFERENCIA: Repeat,
  ASSUMIDO: UserPlus,
  NOTA: StickyNote,
  ETIQUETA: Tag,
  ETAPA: ArrowRight,
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

export function ClienteAba({
  leadId,
  dono,
  vendedores,
  onMudou,
}: {
  leadId: string;
  dono: { id: string; nome: string } | null;
  vendedores: VendedorOpcao[];
  onMudou: () => void;
}) {
  const [atividades, setAtividades] = useState<ItemAtividade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [acao, setAcao] = useState(false);
  const [transferindo, setTransferindo] = useState(false);
  const [destino, setDestino] = useState("");

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/leads/${leadId}/atividades`);
    if (r.ok) setAtividades((await r.json()).atividades);
    setCarregando(false);
  }, [leadId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function assumir() {
    setAcao(true);
    try {
      await fetch(`/api/leads/${leadId}/assumir`, { method: "POST" });
      await carregar();
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
        body: JSON.stringify({ agenteId: destino }),
      });
      setTransferindo(false);
      setDestino("");
      await carregar();
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
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
          Historico do cliente
        </h4>
        {carregando ? (
          <div className="space-y-2">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
          </div>
        ) : atividades.length === 0 ? (
          <p className="py-4 text-center text-sm text-medio/50">
            Sem atividades ainda.
          </p>
        ) : (
          <ol className="space-y-3">
            {atividades.map((a) => {
              const Icone = ICONE_ATIV[a.tipo] ?? StickyNote;
              return (
                <li key={a.id} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tiffany/10 text-tiffany">
                    <Icone className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-escuro">{a.descricao}</p>
                    <p className="text-[11px] text-medio/50">
                      {a.agente ? `${a.agente} · ` : ""}
                      {dataHora(a.criadoEm)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
