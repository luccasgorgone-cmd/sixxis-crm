"use client";

// Admin > Comunicacoes: todas as campanhas de todos os colaboradores, com
// filtros (colaborador, canal, status, periodo) e drill-down por destinatario.
// Tambem mostra o status dos canais (WhatsApp/SMS/Email) e as envs necessarias.
import { useState, useEffect, useCallback } from "react";
import {
  Megaphone,
  MessageCircle,
  Smartphone,
  Mail,
  CheckCircle2,
  Ban,
  ChevronRight,
  ShoppingBag,
} from "lucide-react";
import { Cabecalho, SkeletonTabela } from "./VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import { BadgeFinalidade } from "@/components/BadgeFinalidade";
import { DetalheCampanha } from "@/components/campanhas/EnvioMassa";
import { getSocket } from "@/lib/socketClient";

type Canal = "WHATSAPP" | "SMS" | "EMAIL";
type CanalStatus = { canal: Canal; rotulo: string; configurado: boolean; envs?: string[] };
type Campanha = {
  id: string;
  finalidade: "VENDA" | "POS_VENDA";
  canal: Canal;
  mensagem: string;
  total: number;
  enviados: number;
  falhas: number;
  pulados: number;
  status: string;
  criadoEm: string;
  agente: { id: string; nome: string | null } | null;
};
type Vendedor = { id: string; nome: string };

const ICONE_CANAL: Record<Canal, typeof MessageCircle> = {
  WHATSAPP: MessageCircle,
  SMS: Smartphone,
  EMAIL: Mail,
};
const COR_STATUS: Record<string, string> = {
  RASCUNHO: "bg-black/5 text-medio/60",
  ENVIANDO: "bg-sky-100 text-sky-700",
  CONCLUIDA: "bg-green-100 text-green-700",
  CANCELADA: "bg-red-100 text-red-700",
};

export function ComunicacoesAdmin() {
  const [canais, setCanais] = useState<CanalStatus[]>([]);
  const [lojaOnline, setLojaOnline] = useState(false);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  // Filtros
  const [agenteId, setAgenteId] = useState("");
  const [canal, setCanal] = useState("");
  const [status, setStatus] = useState("");
  const [dias, setDias] = useState("");

  useEffect(() => {
    fetch("/api/canais")
      .then((r) => (r.ok ? r.json() : { canais: [] }))
      .then((d) => {
        setCanais(d.canais ?? []);
        setLojaOnline(Boolean(d.loja?.configurada));
      })
      .catch(() => undefined);
    fetch("/api/vendedores")
      .then((r) => (r.ok ? r.json() : { vendedores: [] }))
      .then((d) => setVendedores(d.vendedores ?? []))
      .catch(() => undefined);
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const p = new URLSearchParams();
      if (agenteId) p.set("agenteId", agenteId);
      if (canal) p.set("canal", canal);
      if (status) p.set("status", status);
      if (dias) p.set("dias", dias);
      const r = await fetch(`/api/campanhas?${p.toString()}`);
      if (r.ok) {
        setCampanhas((await r.json()).campanhas ?? []);
        setErro(false);
      } else {
        setErro(true);
      }
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [agenteId, canal, status, dias]);

  useEffect(() => {
    void carregar();
    const socket = getSocket();
    const atualizar = () => void carregar();
    socket.on("campanha:progresso", atualizar);
    socket.on("campanha:concluida", atualizar);
    socket.on("campanha:nova", atualizar);
    return () => {
      socket.off("campanha:progresso", atualizar);
      socket.off("campanha:concluida", atualizar);
      socket.off("campanha:nova", atualizar);
    };
  }, [carregar]);

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Comunicacoes"
        subtitulo="Todas as campanhas de todos os colaboradores, com status por destinatario"
      />

      {/* Status dos canais */}
      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {canais.map((c) => {
          const Icone = ICONE_CANAL[c.canal];
          return (
            <div
              key={c.canal}
              className="rounded-xl border border-black/5 bg-white p-3"
            >
              <div className="flex items-center gap-2">
                <Icone className="h-4 w-4 text-medio/60" />
                <span className="text-sm font-medium text-escuro">{c.rotulo}</span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    c.configurado
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {c.configurado ? "Configurado" : "Nao configurado"}
                </span>
              </div>
              {!c.configurado && c.envs && (
                <p className="mt-1.5 text-[11px] text-medio/50">
                  Envs: {c.envs.join(", ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="mb-5 flex items-center gap-2 text-xs text-medio/60">
        <ShoppingBag className="h-3.5 w-3.5" />
        Integracao da loja:{" "}
        <span
          className={`rounded-full px-2 py-0.5 font-semibold ${
            lojaOnline ? "bg-green-100 text-green-700" : "bg-black/5 text-medio/60"
          }`}
        >
          {lojaOnline ? "Online" : "Offline"}
        </span>
        <span className="text-medio/40">
          (envs: STORE_API_URL, STORE_INTERNAL_KEY)
        </span>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={agenteId}
          onChange={(e) => setAgenteId(e.target.value)}
          className="campo"
        >
          <option value="">Todos os colaboradores</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nome}
            </option>
          ))}
        </select>
        <select value={canal} onChange={(e) => setCanal(e.target.value)} className="campo">
          <option value="">Todos os canais</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="SMS">SMS</option>
          <option value="EMAIL">Email</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="campo">
          <option value="">Todos os status</option>
          <option value="ENVIANDO">Enviando</option>
          <option value="CONCLUIDA">Concluida</option>
          <option value="CANCELADA">Cancelada</option>
        </select>
        <select value={dias} onChange={(e) => setDias(e.target.value)} className="campo">
          <option value="">Qualquer periodo</option>
          <option value="1">Ultimas 24h</option>
          <option value="7">Ultimos 7 dias</option>
          <option value="30">Ultimos 30 dias</option>
        </select>
      </div>

      {carregando ? (
        <SkeletonTabela />
      ) : erro ? (
        <EstadoErro mensagem="Nao foi possivel carregar." onRetry={() => void carregar()} />
      ) : campanhas.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/10 bg-white py-16 text-center">
          <Megaphone className="h-8 w-8 text-medio/30" />
          <p className="text-sm font-medium text-escuro">Nenhuma campanha</p>
          <p className="text-xs text-medio/60">
            Quando os colaboradores enviarem campanhas, elas aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {campanhas.map((c) => {
            const Icone = ICONE_CANAL[c.canal];
            const pct =
              c.total > 0
                ? Math.round(((c.enviados + c.falhas) / c.total) * 100)
                : 0;
            return (
              <button
                key={c.id}
                onClick={() => setDetalheId(c.id)}
                className="w-full rounded-xl border border-black/5 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Icone className="h-4 w-4 text-medio/60" />
                  <BadgeFinalidade finalidade={c.finalidade} />
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${COR_STATUS[c.status] ?? ""}`}>
                    {c.status}
                  </span>
                  {c.agente && (
                    <span className="text-xs font-medium text-medio/70">
                      {c.agente.nome}
                    </span>
                  )}
                  <span className="text-[11px] text-medio/50">
                    {new Date(c.criadoEm).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <ChevronRight className="ml-auto h-4 w-4 text-medio/40" />
                </div>
                <p className="mt-1.5 truncate text-sm text-escuro">{c.mensagem}</p>
                <div className="mt-2 flex items-center gap-3 text-xs text-medio/70">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> {c.enviados}
                  </span>
                  <span className="flex items-center gap-1">
                    <Ban className="h-3.5 w-3.5 text-red-500" /> {c.falhas}
                  </span>
                  <span>de {c.total}</span>
                  {c.pulados > 0 && <span>· {c.pulados} pulados</span>}
                  <span className="ml-auto">{pct}%</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {detalheId && (
        <DetalheCampanha id={detalheId} onFechar={() => setDetalheId(null)} />
      )}
    </div>
  );
}
