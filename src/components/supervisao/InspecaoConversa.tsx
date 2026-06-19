"use client";

// Inspecao de uma conversa (admin): thread SOMENTE LEITURA + timeline de
// atividade + dados do cliente/negocio + acoes Assumir/Transferir. Atualiza a
// thread em tempo real (Socket.io). Sem compositor.
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
import { Thread } from "@/components/inbox/Thread";
import { getSocket } from "@/lib/socketClient";
import { BadgeFinalidade } from "@/components/BadgeFinalidade";
import { LojaCliente } from "@/components/loja/LojaCliente";
import { formatarBRL, formatarTelefone } from "@/lib/format";
import type {
  MensagemItem,
  ConversaItem,
  EventoMensagemNova,
} from "@/components/inbox/tipos";

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

type Atividade = {
  id: string;
  tipo: string;
  descricao: string;
  agente: string | null;
  criadoEm: string;
};

function dataHora(v: string) {
  return new Date(v).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InspecaoConversa({
  conversaId,
  leadId,
  negocioId,
  finalidade,
  leadNome,
  leadTelefone,
  onAcao,
}: {
  conversaId: string | null;
  leadId: string;
  negocioId: string | null;
  finalidade: string;
  leadNome: string | null;
  leadTelefone: string;
  onAcao: () => void;
}) {
  const [mensagens, setMensagens] = useState<MensagemItem[]>([]);
  const [carregandoMsg, setCarregandoMsg] = useState(true);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [dono, setDono] = useState<{ id: string; nome: string } | null>(null);
  const [valor, setValor] = useState<number | null>(null);
  const [vendedores, setVendedores] = useState<{ id: string; nome: string }[]>([]);
  const [acao, setAcao] = useState(false);
  const [transferindo, setTransferindo] = useState(false);
  const [destino, setDestino] = useState("");
  const [abaLado, setAbaLado] = useState<"timeline" | "loja">("timeline");

  const carregarTudo = useCallback(async () => {
    // Mensagens.
    if (conversaId) {
      setCarregandoMsg(true);
      fetch(`/api/conversas/${conversaId}/mensagens`)
        .then((r) => (r.ok ? r.json() : { mensagens: [] }))
        .then((d) => setMensagens(d.mensagens ?? []))
        .catch(() => undefined)
        .finally(() => setCarregandoMsg(false));
    } else {
      setMensagens([]);
      setCarregandoMsg(false);
    }
    // Atividades do cliente.
    fetch(`/api/leads/${leadId}/atividades`)
      .then((r) => (r.ok ? r.json() : { atividades: [] }))
      .then((d) => setAtividades(d.atividades ?? []))
      .catch(() => undefined);
    // Dono/valor via detalhe do negocio.
    if (negocioId) {
      fetch(`/api/negocios/${negocioId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.negocio) {
            setDono(d.negocio.dono ?? null);
            setValor(d.negocio.valor ?? null);
          }
        })
        .catch(() => undefined);
    } else {
      setDono(null);
      setValor(null);
    }
  }, [conversaId, leadId, negocioId]);

  useEffect(() => {
    void carregarTudo();
  }, [carregarTudo]);

  // Vendedores da finalidade (para transferir).
  useEffect(() => {
    fetch(`/api/vendedores?finalidade=${finalidade}`)
      .then((r) => (r.ok ? r.json() : { vendedores: [] }))
      .then((d) => setVendedores(d.vendedores ?? []))
      .catch(() => undefined);
  }, [finalidade]);

  // Tempo real: novas mensagens da conversa inspecionada.
  useEffect(() => {
    if (!conversaId) return;
    const socket = getSocket();
    function onNova(evt: EventoMensagemNova) {
      if (evt.conversaId !== conversaId) return;
      setMensagens((prev) =>
        prev.some((m) => m.id === evt.mensagemId)
          ? prev
          : [
              ...prev,
              {
                id: evt.mensagemId,
                direcao: evt.direcao,
                tipo: evt.tipo,
                conteudo: evt.conteudo,
                statusEnvio: evt.statusEnvio,
                hora: evt.hora,
              },
            ],
      );
    }
    socket.on("mensagem:nova", onNova);
    return () => {
      socket.off("mensagem:nova", onNova);
    };
  }, [conversaId]);

  async function assumir() {
    setAcao(true);
    try {
      await fetch(`/api/leads/${leadId}/assumir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalidade }),
      });
      await carregarTudo();
      onAcao();
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
      await carregarTudo();
      onAcao();
    } finally {
      setAcao(false);
    }
  }

  const conversa: ConversaItem = {
    id: conversaId ?? "",
    leadNome,
    leadTelefone,
    atendidoPor: "HUMANO",
    naoLidas: 0,
    ultimaMensagemPreview: null,
    ultimaMensagemEm: null,
    agenteId: null,
    finalidade: finalidade as ConversaItem["finalidade"],
  };

  return (
    <div className="flex h-full min-w-0 flex-1">
      {/* Thread somente leitura */}
      <div className="flex min-w-0 flex-1 flex-col">
        {conversaId ? (
          <Thread
            conversa={conversa}
            mensagens={mensagens}
            carregando={carregandoMsg}
            somenteLeitura
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-fundo text-sm text-medio/50">
            Sem conversa para este atendimento.
          </div>
        )}
      </div>

      {/* Painel lateral: cliente, acoes e timeline */}
      <aside className="scroll-fino flex w-80 shrink-0 flex-col overflow-y-auto border-l border-black/5 bg-white p-4">
        <div className="mb-3">
          <div className="mb-1 flex items-center gap-2">
            <p className="text-sm font-semibold text-escuro">
              {leadNome?.trim() || leadTelefone}
            </p>
            <BadgeFinalidade finalidade={finalidade} />
          </div>
          <p className="text-xs text-medio/60">
            {formatarTelefone(leadTelefone)}
          </p>
          {valor != null && (
            <p className="mt-1 text-sm font-semibold text-tiffany-escuro">
              {formatarBRL(valor)}
            </p>
          )}
          <p className="mt-1 text-xs text-medio/50">
            Dono: {dono?.nome ?? "Sem dono"}
          </p>
        </div>

        {/* Acoes do admin */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => void assumir()}
            disabled={acao}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {acao ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Assumir
          </button>
          <button
            onClick={() => setTransferindo((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium text-medio hover:bg-black/5"
          >
            <Repeat className="h-4 w-4" /> Transferir
          </button>
        </div>
        {transferindo && (
          <div className="mb-4 flex gap-2">
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
              disabled={acao || !destino}
              className="rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
            >
              Ok
            </button>
          </div>
        )}

        {/* Alternancia Atividade | Loja */}
        <div className="mb-3 flex gap-1 border-b border-black/5">
          {(
            [
              ["timeline", "Atividade"],
              ["loja", "Loja"],
            ] as ["timeline" | "loja", string][]
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              onClick={() => setAbaLado(chave)}
              className={`border-b-2 px-2.5 py-1.5 text-sm font-medium transition-colors ${
                abaLado === chave
                  ? "border-tiffany text-tiffany"
                  : "border-transparent text-medio/60 hover:text-escuro"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {abaLado === "loja" ? (
          <LojaCliente telefone={leadTelefone} />
        ) : atividades.length === 0 ? (
          <p className="text-sm text-medio/50">Sem atividades.</p>
        ) : (
          <ol className="space-y-3">
            {atividades.map((a) => {
              const Icone = ICONE_ATIV[a.tipo] ?? StickyNote;
              return (
                <li key={a.id} className="flex gap-2.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tiffany/10 text-tiffany">
                    <Icone className="h-3 w-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-escuro">{a.descricao}</p>
                    <p className="text-[10px] text-medio/50">
                      {a.agente ? `${a.agente} · ` : ""}
                      {dataHora(a.criadoEm)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </aside>
    </div>
  );
}
