"use client";

// Admin > perfil do colaborador: cabecalho com metricas + filtro de periodo,
// abas AO VIVO / PENDENTES / FINALIZADOS (lista a esquerda) e inspecao da
// conversa selecionada a direita. AO VIVO atualiza em tempo real.
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Radio, Clock4, CheckCircle2 } from "lucide-react";
import { getSocket } from "@/lib/socketClient";
import { FiltroPeriodo } from "@/components/dashboard/FiltroPeriodo";
import { queryDoFiltro, type FiltroValor } from "@/components/dashboard/tipos";
import { BadgeFinalidade, corFinalidade } from "@/components/BadgeFinalidade";
import {
  formatarBRL,
  formatarPct,
  formatarDuracao,
  horarioLista,
} from "@/lib/format";
import { InspecaoConversa } from "./InspecaoConversa";
import type {
  PerfilColaborador as Perfil,
  ItemAtendimento,
  StatusAtendimento,
} from "./tipos";

const ABAS: { chave: StatusAtendimento; rotulo: string; icone: typeof Radio }[] = [
  { chave: "aovivo", rotulo: "Ao vivo", icone: Radio },
  { chave: "pendente", rotulo: "Pendentes", icone: Clock4 },
  { chave: "finalizado", rotulo: "Finalizados", icone: CheckCircle2 },
];

export function PerfilColaborador({ id }: { id: string }) {
  const [filtro, setFiltro] = useState<FiltroValor>({ periodo: "mes" });
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [aba, setAba] = useState<StatusAtendimento>("aovivo");
  const [atendimentos, setAtendimentos] = useState<ItemAtendimento[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [sel, setSel] = useState<ItemAtendimento | null>(null);

  const carregarPerfil = useCallback(async () => {
    const r = await fetch(
      `/api/admin/colaboradores/${id}?${queryDoFiltro(filtro)}`,
    );
    if (r.ok) setPerfil(await r.json());
  }, [id, filtro]);

  const carregarLista = useCallback(async () => {
    setCarregandoLista(true);
    try {
      const r = await fetch(
        `/api/admin/colaboradores/${id}/atendimentos?status=${aba}&${queryDoFiltro(filtro)}`,
      );
      if (r.ok) setAtendimentos((await r.json()).atendimentos);
    } finally {
      setCarregandoLista(false);
    }
  }, [id, aba, filtro]);

  useEffect(() => {
    void carregarPerfil();
  }, [carregarPerfil]);
  useEffect(() => {
    void carregarLista();
  }, [carregarLista]);

  // Tempo real: novas mensagens / mudancas recarregam a lista (sobretudo ao vivo).
  const listaRef = useRef(carregarLista);
  listaRef.current = carregarLista;
  useEffect(() => {
    const socket = getSocket();
    const recarregar = () => void listaRef.current();
    socket.on("mensagem:nova", recarregar);
    socket.on("conversa:atualizada", recarregar);
    socket.on("negocio:atualizado", recarregar);
    return () => {
      socket.off("mensagem:nova", recarregar);
      socket.off("conversa:atualizada", recarregar);
      socket.off("negocio:atualizado", recarregar);
    };
  }, []);

  const m = perfil?.metricas;

  return (
    <div className="flex h-full flex-col">
      {/* Cabecalho */}
      <div className="shrink-0 border-b border-black/5 bg-white px-6 py-4">
        <Link
          href="/admin/colaboradores"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-medio hover:text-escuro"
        >
          <ArrowLeft className="h-4 w-4" /> Colaboradores
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-escuro">
              {perfil?.agente.nome ?? "Colaborador"}
            </h2>
            {perfil?.agente.acessoVenda && <BadgeFinalidade finalidade="VENDA" />}
            {perfil?.agente.acessoPosVenda && (
              <BadgeFinalidade finalidade="POS_VENDA" />
            )}
            {perfil && !perfil.agente.ativo && (
              <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs text-medio/60">
                inativo
              </span>
            )}
          </div>
          <FiltroPeriodo valor={filtro} onChange={setFiltro} />
        </div>

        {m && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <Stat rotulo="Clientes" valor={m.clientesAtendidos} />
            <Stat rotulo="Abertos" valor={m.abertos} />
            <Stat rotulo="Pendentes" valor={m.pendentes} />
            <Stat rotulo="Finalizados" valor={m.finalizados} />
            <Stat rotulo="Conversao" valor={formatarPct(m.conversao)} />
            <Stat rotulo="Valor" valor={formatarBRL(m.valorVendido)} />
            <Stat
              rotulo="1a resposta"
              valor={formatarDuracao(m.tempoPrimeiraRespostaSeg)}
            />
            <Stat
              rotulo="Resolucao"
              valor={formatarDuracao(m.tempoResolucaoSeg)}
            />
          </div>
        )}
      </div>

      {/* Corpo: lista + inspecao */}
      <div className="flex min-h-0 flex-1">
        <div className="flex w-80 shrink-0 flex-col border-r border-black/5 bg-white">
          <div className="flex gap-1 border-b border-black/5 px-2 pt-2">
            {ABAS.map((a) => {
              const Icone = a.icone;
              return (
                <button
                  key={a.chave}
                  onClick={() => {
                    setAba(a.chave);
                    setSel(null);
                  }}
                  className={`flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-sm font-medium transition-colors ${
                    aba === a.chave
                      ? "border-tiffany text-tiffany"
                      : "border-transparent text-medio/60 hover:text-escuro"
                  }`}
                >
                  <Icone className="h-3.5 w-3.5" />
                  {a.rotulo}
                </button>
              );
            })}
          </div>

          <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">
            {carregandoLista ? (
              <div className="space-y-1 p-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : atendimentos.length === 0 ? (
              <p className="p-6 text-center text-sm text-medio/50">
                Nenhum atendimento aqui.
              </p>
            ) : (
              atendimentos.map((at, i) => (
                <ItemLista
                  key={`${at.conversaId ?? at.negocioId ?? i}`}
                  item={at}
                  ativo={
                    sel?.conversaId === at.conversaId &&
                    sel?.negocioId === at.negocioId
                  }
                  aoVivo={aba === "aovivo"}
                  onClick={() => setSel(at)}
                />
              ))
            )}
          </div>
        </div>

        {sel ? (
          <InspecaoConversa
            key={`${sel.conversaId}-${sel.negocioId}`}
            conversaId={sel.conversaId}
            leadId={sel.leadId}
            negocioId={sel.negocioId}
            finalidade={sel.finalidade}
            leadNome={sel.leadNome}
            leadTelefone={sel.leadTelefone}
            onAcao={() => {
              void carregarLista();
              void carregarPerfil();
            }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-fundo text-sm text-medio/50">
            Selecione um atendimento para inspecionar.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-medio/50">{rotulo}</span>
      <span className="font-semibold text-escuro">{valor}</span>
    </span>
  );
}

function ItemLista({
  item,
  ativo,
  aoVivo,
  onClick,
}: {
  item: ItemAtendimento;
  ativo: boolean;
  aoVivo: boolean;
  onClick: () => void;
}) {
  const cor = corFinalidade(item.finalidade);
  const nome = item.leadNome?.trim() || item.leadTelefone;
  return (
    <button
      onClick={onClick}
      style={{ borderLeftColor: cor.hex }}
      className={`flex w-full items-center gap-2 border-b border-l-[3px] border-black/5 px-3 py-2.5 text-left transition-colors ${
        ativo ? "bg-tiffany/10" : "hover:bg-fundo"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {aoVivo && (
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-green-500" />
          )}
          <p className="truncate text-sm font-medium text-escuro">{nome}</p>
          <BadgeFinalidade finalidade={item.finalidade} />
        </div>
        <p className="truncate text-xs text-medio/60">
          {item.status !== "ABERTO"
            ? `${item.status === "GANHO" ? "Ganho" : "Perdido"}${
                item.valor != null ? ` · ${formatarBRL(item.valor)}` : ""
              }`
            : (item.preview ?? item.etapaNome ?? "Sem mensagens")}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-[10px] text-medio/40">
          {horarioLista(item.ultimaMensagemEm)}
        </span>
        {item.naoLidas > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-tiffany px-1 text-[10px] font-semibold text-white">
            {item.naoLidas}
          </span>
        )}
      </div>
    </button>
  );
}
