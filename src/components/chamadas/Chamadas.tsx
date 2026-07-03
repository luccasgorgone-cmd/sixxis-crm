"use client";

// Historico de chamadas recebidas (recebidas x perdidas), agrupado por dia, com
// escopo aplicado pelo backend. O CRM registra e organiza — a chamada e atendida
// no WhatsApp/celular (a Evolution nao transmite audio). Marca vistas ao abrir.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  Phone,
  Video,
  Info,
  Loader2,
  Smartphone,
  UserRound,
  Search,
  MessageSquare,
} from "lucide-react";
import { getSocket } from "@/lib/socketClient";
import { horaCurta, rotuloDia, chaveDia, formatarTelefone } from "@/lib/format";

type Chamada = {
  id: string;
  telefone: string;
  tipo: string; // "voz" | "video"
  status: string; // "recebida" | "perdida" | "rejeitada"
  finalidade: string; // "VENDA" | "POS_VENDA"
  horaEm: string;
  leadId: string | null;
  leadNome: string | null;
  instanciaNome: string | null;
  instanciaNumero: string | null;
  agenteNome: string | null;
};

const STATUS: Record<
  string,
  { rotulo: string; Icone: typeof Phone; classe: string }
> = {
  recebida: { rotulo: "Atendida", Icone: PhoneIncoming, classe: "text-green-600 dark:text-green-400" },
  perdida: { rotulo: "Perdida", Icone: PhoneMissed, classe: "text-red-600 dark:text-red-400" },
  rejeitada: { rotulo: "Rejeitada", Icone: PhoneOff, classe: "text-amber-600 dark:text-amber-400" },
};

const FILTROS_STATUS = [
  { v: "", r: "Todas" },
  { v: "perdida", r: "Perdidas" },
  { v: "recebida", r: "Atendidas" },
  { v: "rejeitada", r: "Rejeitadas" },
];
const FILTROS_PERIODO = [
  { v: "", r: "Todo o periodo" },
  { v: "hoje", r: "Hoje" },
  { v: "semana", r: "7 dias" },
  { v: "15d", r: "15 dias" },
  { v: "mes", r: "30 dias" },
];

function rotuloFinalidade(f: string): string {
  return f === "POS_VENDA" ? "Pos-venda" : "Venda";
}

type Instancia = { id: string; nome: string; numero: string | null };

export function Chamadas() {
  const [chamadas, setChamadas] = useState<Chamada[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [status, setStatus] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [instancia, setInstancia] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [instancias, setInstancias] = useState<Instancia[]>([]);

  // Debounce da busca (~250ms).
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 250);
    return () => clearTimeout(t);
  }, [busca]);

  // Numeros (instancias) para o filtro "numero que recebeu".
  useEffect(() => {
    fetch("/api/instancias")
      .then((r) => (r.ok ? r.json() : { instancias: [] }))
      .then((d) => setInstancias(d.instancias ?? []))
      .catch(() => undefined);
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    try {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (periodo) p.set("periodo", periodo);
      if (instancia) p.set("instancia", instancia);
      if (buscaAplicada.trim()) p.set("busca", buscaAplicada.trim());
      const r = await fetch(`/api/chamadas?${p.toString()}`);
      if (!r.ok) throw new Error();
      setChamadas((await r.json()).chamadas ?? []);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [status, periodo, instancia, buscaAplicada]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const contadores = useMemo(() => {
    let perdida = 0;
    let recebida = 0;
    let rejeitada = 0;
    for (const c of chamadas) {
      if (c.status === "perdida") perdida += 1;
      else if (c.status === "recebida") recebida += 1;
      else if (c.status === "rejeitada") rejeitada += 1;
    }
    return { perdida, recebida, rejeitada };
  }, [chamadas]);

  // Ao abrir, marca as chamadas do escopo como vistas e avisa o badge do topo.
  useEffect(() => {
    void (async () => {
      try {
        await fetch("/api/chamadas/marcar-vistas", { method: "POST" });
        window.dispatchEvent(new Event("chamadas:vistas"));
      } catch {
        // silencioso
      }
    })();
  }, []);

  // Novas chamadas ao vivo.
  useEffect(() => {
    const socket = getSocket();
    const atualizar = () => void carregar();
    socket.on("chamada:nova", atualizar);
    return () => {
      socket.off("chamada:nova", atualizar);
    };
  }, [carregar]);

  const blocos = useMemo(() => {
    const grupos: { dia: string; itens: Chamada[] }[] = [];
    let chave = "";
    for (const c of chamadas) {
      const k = chaveDia(c.horaEm);
      if (k !== chave) {
        chave = k;
        grupos.push({ dia: rotuloDia(c.horaEm), itens: [c] });
      } else {
        grupos[grupos.length - 1].itens.push(c);
      }
    }
    return grupos;
  }, [chamadas]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      {/* Cabecalho */}
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tiffany/10 text-tiffany">
          <PhoneIncoming className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-escuro">Chamadas</h2>
          <p className="text-sm text-medio/60">
            Historico de chamadas recebidas por WhatsApp
          </p>
        </div>
      </div>

      {/* Nota honesta */}
      <div className="flex items-start gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-xs text-medio/70">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tiffany" />
        <span>
          As chamadas sao atendidas no WhatsApp/celular. Aqui o CRM apenas registra
          e organiza o historico — nao e possivel atender por voz no sistema.
        </span>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-medio/40" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar telefone ou nome"
            className="campo w-56 pl-8"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="campo">
          {FILTROS_STATUS.map((f) => (
            <option key={f.v} value={f.v}>
              {f.r}
            </option>
          ))}
        </select>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="campo">
          {FILTROS_PERIODO.map((f) => (
            <option key={f.v} value={f.v}>
              {f.r}
            </option>
          ))}
        </select>
        {instancias.length > 1 && (
          <select value={instancia} onChange={(e) => setInstancia(e.target.value)} className="campo">
            <option value="">Numero: todos</option>
            {instancias.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Contadores por status (do resultado atual) */}
      {chamadas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Contador
            rotulo="Perdidas"
            valor={contadores.perdida}
            classe="bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
          />
          <Contador
            rotulo="Atendidas"
            valor={contadores.recebida}
            classe="bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300"
          />
          {contadores.rejeitada > 0 && (
            <Contador
              rotulo="Rejeitadas"
              valor={contadores.rejeitada}
              classe="bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
            />
          )}
        </div>
      )}

      {/* Lista */}
      {carregando && chamadas.length === 0 ? (
        <ListaSkeleton />
      ) : erro ? (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          Nao foi possivel carregar as chamadas.
        </div>
      ) : chamadas.length === 0 ? (
        <Vazio />
      ) : (
        <div className="space-y-4">
          {blocos.map((bloco, i) => (
            <div key={i} className="space-y-1.5">
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-medio/50">
                {bloco.dia}
              </p>
              {bloco.itens.map((c) => (
                <ItemChamada key={c.id} c={c} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemChamada({ c }: { c: Chamada }) {
  const info = STATUS[c.status] ?? STATUS.perdida;
  const Icone = info.Icone;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-black/5 bg-white p-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.03] ${info.classe}`}>
        <Icone className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-escuro">
            {c.leadNome?.trim() || formatarTelefone(c.telefone)}
          </p>
          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-medium text-medio/60">
            {c.tipo === "video" ? <Video className="h-2.5 w-2.5" /> : <Phone className="h-2.5 w-2.5" />}
            {c.tipo === "video" ? "Video" : "Voz"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-medio/60">
          <span className={`font-medium ${info.classe}`}>{info.rotulo}</span>
          {c.leadNome && <span>{formatarTelefone(c.telefone)}</span>}
          {(c.instanciaNome || c.instanciaNumero) && (
            <span className="flex items-center gap-1">
              <Smartphone className="h-3 w-3 text-medio/40" />
              {c.instanciaNome ?? c.instanciaNumero}
            </span>
          )}
          <span className="rounded-full bg-tiffany/10 px-1.5 py-0.5 text-[10px] font-medium text-tiffany">
            {rotuloFinalidade(c.finalidade)}
          </span>
          {c.agenteNome && (
            <span className="flex items-center gap-1">
              <UserRound className="h-3 w-3 text-medio/40" />
              {c.agenteNome}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xs text-medio/50">{horaCurta(c.horaEm)}</span>
        {c.leadId && (
          <Link
            href={`/inbox?lead=${c.leadId}`}
            title="Abrir a conversa no Inbox"
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-tiffany transition-colors hover:bg-tiffany/10"
          >
            <MessageSquare className="h-3 w-3" /> Inbox
          </Link>
        )}
      </div>
    </div>
  );
}

function Contador({
  rotulo,
  valor,
  classe,
}: {
  rotulo: string;
  valor: number;
  classe: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${classe}`}>
      <strong>{valor}</strong> {rotulo}
    </span>
  );
}

function Vazio() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-black/10 bg-white py-16 text-center">
      <PhoneIncoming className="h-8 w-8 text-medio/30" />
      <p className="text-sm font-medium text-escuro">Nenhuma chamada por aqui</p>
      <p className="max-w-xs text-xs text-medio/60">
        As chamadas recebidas nos numeros a que voce tem acesso aparecerao aqui.
      </p>
    </div>
  );
}

function ListaSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-black/5 bg-white p-3">
          <div className="skeleton h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3.5 w-40" />
            <div className="skeleton h-3 w-56" />
          </div>
        </div>
      ))}
    </div>
  );
}
