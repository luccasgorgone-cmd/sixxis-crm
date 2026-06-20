"use client";

// Inspecao de uma conversa (admin): thread SOMENTE LEITURA + dados do cliente
// (editaveis) + historico COMPLETO + acoes Assumir/Transferir. Thread em tempo
// real (Socket.io). Sem compositor.
import { useState, useEffect, useCallback } from "react";
import { UserPlus, Repeat, Loader2 } from "lucide-react";
import { Thread } from "@/components/inbox/Thread";
import { getSocket } from "@/lib/socketClient";
import { BadgeFinalidade } from "@/components/BadgeFinalidade";
import { AvatarCliente } from "@/components/AvatarCliente";
import { BlocoCliente, type ClientePainel } from "@/components/cliente/BlocoCliente";
import { HistoricoCliente } from "@/components/cliente/HistoricoCliente";
import { LojaCliente } from "@/components/loja/LojaCliente";
import { formatarBRL } from "@/lib/format";
import type {
  MensagemItem,
  ConversaItem,
  EventoMensagemNova,
} from "@/components/inbox/tipos";

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
  const [cliente, setCliente] = useState<ClientePainel | null>(null);
  const [dono, setDono] = useState<{ id: string; nome: string } | null>(null);
  const [valor, setValor] = useState<number | null>(null);
  const [vendedores, setVendedores] = useState<{ id: string; nome: string }[]>([]);
  const [acao, setAcao] = useState(false);
  const [transferindo, setTransferindo] = useState(false);
  const [destino, setDestino] = useState("");
  const [abaLado, setAbaLado] = useState<"historico" | "loja">("historico");

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
    // Cliente/dono/valor via detalhe do negocio.
    if (negocioId) {
      fetch(`/api/negocios/${negocioId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.negocio) {
            setCliente(d.negocio.cliente ?? null);
            setDono(d.negocio.dono ?? null);
            setValor(d.negocio.valor ?? null);
          }
        })
        .catch(() => undefined);
    } else {
      setCliente(null);
      setDono(null);
      setValor(null);
    }
  }, [conversaId, negocioId]);

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

  const nomeMostrar = cliente?.nomeEfetivo ?? (leadNome?.trim() || leadTelefone);
  const conversa: ConversaItem = {
    id: conversaId ?? "",
    leadNome: nomeMostrar,
    leadFoto: cliente?.fotoUrl ?? null,
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

      {/* Painel lateral: cliente, acoes e historico */}
      <aside className="scroll-fino flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-black/5 bg-white p-4">
        {/* Cabecalho com avatar */}
        <div className="flex items-center gap-3">
          <AvatarCliente
            nome={nomeMostrar}
            telefone={leadTelefone}
            fotoUrl={cliente?.fotoUrl ?? null}
            tamanho={44}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-escuro">
                {nomeMostrar}
              </p>
              <BadgeFinalidade finalidade={finalidade} />
            </div>
            {valor != null && (
              <p className="text-sm font-semibold text-tiffany-escuro">
                {formatarBRL(valor)}
              </p>
            )}
            <p className="text-xs text-medio/50">
              Dono: {dono?.nome ?? "Sem dono"}
            </p>
          </div>
        </div>

        {/* Acoes do admin */}
        <div className="flex flex-wrap gap-2">
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
          <div className="flex gap-2">
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

        {/* Dados do cliente (editaveis pelo admin) */}
        {cliente && (
          <BlocoCliente cliente={cliente} onAtualizado={() => void carregarTudo()} />
        )}

        {/* Alternancia Historico | Loja */}
        <div className="flex gap-1 border-b border-black/5">
          {(
            [
              ["historico", "Historico"],
              ["loja", "Loja"],
            ] as ["historico" | "loja", string][]
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
          <LojaCliente telefone={leadTelefone} origem={cliente?.origem} />
        ) : (
          <HistoricoCliente leadId={leadId} />
        )}
      </aside>
    </div>
  );
}
