"use client";

// Aba "Clientes": clientes do usuario (colaborador: os seus; admin: todos, com
// seletor de colaborador / sem dono). Lista rica + filtros + busca + marcacoes
// inline + abertura do painel do cliente. Usa o kit visual (KpiCard, EmptyState,
// TabelaOrdenavel).
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users,
  Search,
  Tag,
  Plus,
  X,
  MessageSquare,
  FileText,
  Contact,
} from "lucide-react";
import { AvatarCliente } from "@/components/AvatarCliente";
import { KpiCard } from "@/components/ui/KpiCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { FiltroPeriodo, type ValorPeriodo } from "@/components/ui/FiltroPeriodo";
import {
  TabelaOrdenavel,
  type Coluna,
} from "@/components/ui/TabelaOrdenavel";
import {
  BadgeStatusNegocio,
  BadgePendente,
  BadgeFinalidade,
} from "@/components/badges";
import { BadgeTemperatura } from "@/components/BadgeTemperatura";
import { PainelNegocio } from "@/components/kanban/PainelNegocio";
import type { Etapa, EtiquetaChip, AgenteResumo } from "@/components/kanban/tipos";
import { formatarBRL, formatarTelefone } from "@/lib/format";

type Cliente = {
  leadId: string;
  negocioId: string | null;
  nome: string;
  telefone: string;
  fotoUrl: string | null;
  finalidades: ("VENDA" | "POS_VENDA")[];
  etiquetas: EtiquetaChip[];
  temperatura: "QUENTE" | "MORNO" | "FRIO" | null;
  status: "ABERTO" | "GANHO" | "PERDIDO" | "PENDENTE" | null;
  ultimoContato: string | null;
  valorAberto: number;
  qtdOrcamentos: number;
  qtdMensagens: number;
};

type Vendedor = { id: string; nome: string };

// Normaliza texto (remove acentos) para busca, como no inbox/kanban.
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function ListaClientes({
  papel,
  agenteIdAtual,
}: {
  papel: string;
  agenteIdAtual: string;
}) {
  const ehAdmin = papel === "ADMIN";

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<ValorPeriodo>({ preset: "mes" });

  // Filtros
  const [etiquetaF, setEtiquetaF] = useState("");
  const [temperaturaF, setTemperaturaF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [agenteSel, setAgenteSel] = useState(""); // admin
  const [semDono, setSemDono] = useState(false); // admin

  // Auxiliares
  const [todasEtiquetas, setTodasEtiquetas] = useState<EtiquetaChip[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);

  // Painel
  const [painelId, setPainelId] = useState<string | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [agentes, setAgentes] = useState<AgenteResumo[]>([]);

  useEffect(() => {
    fetch("/api/etiquetas")
      .then((r) => (r.ok ? r.json() : { etiquetas: [] }))
      .then((d) => setTodasEtiquetas(d.etiquetas ?? []))
      .catch(() => undefined);
    fetch("/api/etapas")
      .then((r) => (r.ok ? r.json() : { etapas: [] }))
      .then((d) => setEtapas(d.etapas ?? []))
      .catch(() => undefined);
    if (ehAdmin) {
      fetch("/api/vendedores")
        .then((r) => (r.ok ? r.json() : { vendedores: [] }))
        .then((d) => setVendedores(d.vendedores ?? []))
        .catch(() => undefined);
      fetch("/api/agentes")
        .then((r) => (r.ok ? r.json() : { agentes: [] }))
        .then((d) => setAgentes(d.agentes ?? []))
        .catch(() => undefined);
    }
  }, [ehAdmin]);

  const carregar = useCallback(async () => {
    if (periodo.preset === "custom" && (!periodo.inicio || !periodo.fim)) return;
    setCarregando(true);
    try {
      const p = new URLSearchParams();
      if (etiquetaF) p.set("etiqueta", etiquetaF);
      if (temperaturaF) p.set("temperatura", temperaturaF);
      if (statusF) p.set("status", statusF);
      if (ehAdmin && semDono) p.set("semDono", "1");
      else if (ehAdmin && agenteSel) p.set("agenteId", agenteSel);
      if (periodo.preset === "custom") {
        p.set("inicio", `${periodo.inicio}T00:00:00`);
        p.set("fim", `${periodo.fim}T23:59:59`);
      } else {
        p.set("periodo", periodo.preset);
      }
      const r = await fetch(`/api/clientes?${p.toString()}`);
      if (r.ok) setClientes((await r.json()).clientes ?? []);
      else setClientes([]);
    } catch {
      setClientes([]);
    } finally {
      setCarregando(false);
    }
  }, [etiquetaF, temperaturaF, statusF, semDono, agenteSel, ehAdmin, periodo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Busca textual no cliente (acentos/digitos).
  const filtrados = useMemo(() => {
    const q = normalizar(busca.trim());
    const qd = busca.replace(/\D/g, "");
    if (!q && !qd) return clientes;
    return clientes.filter((c) => {
      const nome = normalizar(c.nome);
      const tel = c.telefone.replace(/\D/g, "");
      return (
        (q && nome.includes(q)) || (qd.length > 0 && tel.includes(qd))
      );
    });
  }, [clientes, busca]);

  // Etiqueta inline (aplica/remove via negocio).
  const aplicarEtiqueta = useCallback(
    async (negocioId: string, etiquetaId: string) => {
      await fetch(`/api/negocios/${negocioId}/etiquetas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etiquetaId }),
      });
      await carregar();
    },
    [carregar],
  );
  const removerEtiqueta = useCallback(
    async (negocioId: string, etiquetaId: string) => {
      await fetch(`/api/negocios/${negocioId}/etiquetas/${etiquetaId}`, {
        method: "DELETE",
      });
      await carregar();
    },
    [carregar],
  );

  const valorTotalAberto = useMemo(
    () => filtrados.reduce((s, c) => s + c.valorAberto, 0),
    [filtrados],
  );
  const comOrcamento = useMemo(
    () => filtrados.filter((c) => c.qtdOrcamentos > 0).length,
    [filtrados],
  );

  const colunas: Coluna<Cliente>[] = [
    {
      chave: "nome",
      rotulo: "Cliente",
      sortValue: (c) => c.nome.toLowerCase(),
      render: (c) => (
        <div className="flex items-center gap-2.5">
          <AvatarCliente nome={c.nome} telefone={c.telefone} fotoUrl={c.fotoUrl} tamanho={32} />
          <div className="min-w-0">
            <p className="truncate font-medium text-escuro">{c.nome}</p>
            <p className="truncate text-xs text-medio/60">
              {formatarTelefone(c.telefone)}
            </p>
          </div>
        </div>
      ),
    },
    {
      chave: "finalidade",
      rotulo: "Finalidade",
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.finalidades.length === 0 && <span className="text-xs text-medio/40">—</span>}
          {c.finalidades.map((f) => (
            <BadgeFinalidade key={f} finalidade={f} />
          ))}
        </div>
      ),
    },
    {
      chave: "etiquetas",
      rotulo: "Etiquetas",
      render: (c) => (
        <CelulaEtiquetas
          cliente={c}
          todas={todasEtiquetas}
          onAplicar={aplicarEtiqueta}
          onRemover={removerEtiqueta}
        />
      ),
    },
    {
      chave: "temperatura",
      rotulo: "Temp.",
      render: (c) =>
        c.temperatura ? (
          <BadgeTemperatura temperatura={c.temperatura} variante="ponto" />
        ) : (
          <span className="text-xs text-medio/40">—</span>
        ),
    },
    {
      chave: "status",
      rotulo: "Status",
      render: (c) =>
        c.status === "PENDENTE" ? (
          <BadgePendente />
        ) : c.status ? (
          <BadgeStatusNegocio status={c.status} />
        ) : (
          <span className="text-xs text-medio/40">—</span>
        ),
    },
    {
      chave: "ultimoContato",
      rotulo: "Ultimo contato",
      align: "right",
      sortValue: (c) => (c.ultimoContato ? new Date(c.ultimoContato).getTime() : 0),
      render: (c) => <span className="text-medio/70">{dataCurta(c.ultimoContato)}</span>,
    },
    {
      chave: "valorAberto",
      rotulo: "Em aberto",
      align: "right",
      sortValue: (c) => c.valorAberto,
      render: (c) =>
        c.valorAberto > 0 ? (
          <span className="font-medium text-tiffany-escuro">
            {formatarBRL(c.valorAberto)}
          </span>
        ) : (
          <span className="text-xs text-medio/40">—</span>
        ),
    },
    {
      chave: "qtdOrcamentos",
      rotulo: "Orc.",
      align: "right",
      sortValue: (c) => c.qtdOrcamentos,
      render: (c) => (
        <span className="inline-flex items-center gap-1 text-medio/70">
          <FileText className="h-3.5 w-3.5 text-medio/40" />
          {c.qtdOrcamentos}
        </span>
      ),
    },
    {
      chave: "qtdMensagens",
      rotulo: "Msgs",
      align: "right",
      sortValue: (c) => c.qtdMensagens,
      render: (c) => (
        <span className="inline-flex items-center gap-1 text-medio/70">
          <MessageSquare className="h-3.5 w-3.5 text-medio/40" />
          {c.qtdMensagens}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tiffany/10 text-tiffany">
            <Contact className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-escuro">Clientes</h2>
            <p className="text-sm text-medio/60">
              {ehAdmin ? "Todos os clientes" : "Seus clientes"} com filtros, busca e marcacoes
            </p>
          </div>
        </div>
        {ehAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={semDono ? "__sem__" : agenteSel}
              onChange={(e) => {
                if (e.target.value === "__sem__") {
                  setSemDono(true);
                  setAgenteSel("");
                } else {
                  setSemDono(false);
                  setAgenteSel(e.target.value);
                }
              }}
              className="campo"
            >
              <option value="">Todos os colaboradores</option>
              <option value="__sem__">Sem dono</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard rotulo="Clientes" valor={`${filtrados.length}`} icone={Users} />
        <KpiCard
          rotulo="Valor em aberto"
          valor={formatarBRL(valorTotalAberto)}
          icone={FileText}
          cor="text-green-700"
          fundo="bg-green-100"
        />
        <KpiCard
          rotulo="Com orcamento"
          valor={`${comOrcamento}`}
          icone={FileText}
          cor="text-violet-700"
          fundo="bg-violet-100"
        />
        <KpiCard
          rotulo="Etiquetas"
          valor={`${todasEtiquetas.length}`}
          icone={Tag}
          cor="text-medio"
          fundo="bg-black/5"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-medio/40" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome ou telefone"
            className="campo w-56 pl-8"
          />
        </div>
        <select value={etiquetaF} onChange={(e) => setEtiquetaF(e.target.value)} className="campo">
          <option value="">Etiqueta: todas</option>
          {todasEtiquetas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        <select value={temperaturaF} onChange={(e) => setTemperaturaF(e.target.value)} className="campo">
          <option value="">Temperatura: todas</option>
          <option value="QUENTE">Quente</option>
          <option value="MORNO">Morno</option>
          <option value="FRIO">Frio</option>
        </select>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="campo">
          <option value="">Status: todos</option>
          <option value="ABERTO">Em aberto</option>
          <option value="GANHO">Ganho</option>
          <option value="PERDIDO">Perdido</option>
          <option value="PENDENTE">Pendente</option>
        </select>
        <FiltroPeriodo valor={periodo} onChange={setPeriodo} />
      </div>

      {/* Tabela */}
      {carregando ? (
        <div className="skeleton h-72 rounded-2xl" />
      ) : filtrados.length === 0 ? (
        <EmptyState
          icone={Users}
          titulo="Nenhum cliente"
          texto="Ajuste os filtros, o periodo ou a busca para ver clientes."
        />
      ) : (
        <TabelaOrdenavel<Cliente>
          colunas={colunas}
          dados={filtrados}
          chaveLinha={(c) => c.leadId}
          ordemInicial={{ chave: "ultimoContato", dir: -1 }}
          onLinha={(c) => c.negocioId && setPainelId(c.negocioId)}
        />
      )}

      {painelId && (
        <PainelNegocio
          negocioId={painelId}
          papel={papel}
          agenteIdAtual={agenteIdAtual}
          agentes={agentes}
          etiquetas={todasEtiquetas}
          etapas={etapas}
          onFechar={() => setPainelId(null)}
          onAtualizado={() => void carregar()}
        />
      )}
    </div>
  );
}

// Celula de etiquetas com aplicar/remover inline (popover).
function CelulaEtiquetas({
  cliente,
  todas,
  onAplicar,
  onRemover,
}: {
  cliente: Cliente;
  todas: EtiquetaChip[];
  onAplicar: (negocioId: string, etiquetaId: string) => void;
  onRemover: (negocioId: string, etiquetaId: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const naoAplicadas = todas.filter(
    (e) => !cliente.etiquetas.some((x) => x.id === e.id),
  );
  const podeEditar = Boolean(cliente.negocioId);

  return (
    <div
      className="relative flex flex-wrap items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      {cliente.etiquetas.slice(0, 3).map((e) => (
        <span
          key={e.id}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
          style={{ backgroundColor: e.cor }}
        >
          {e.nome}
          {podeEditar && (
            <button
              onClick={() => onRemover(cliente.negocioId!, e.id)}
              aria-label={`Remover ${e.nome}`}
              className="rounded-full hover:bg-black/20"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}
      {podeEditar && naoAplicadas.length > 0 && (
        <button
          onClick={() => setAberto((v) => !v)}
          aria-label="Adicionar etiqueta"
          className="flex items-center gap-0.5 rounded-full border border-dashed border-medio/30 px-1.5 py-0.5 text-[10px] text-medio/70 hover:border-tiffany hover:text-tiffany"
        >
          <Plus className="h-2.5 w-2.5" />
        </button>
      )}
      {aberto && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-44 overflow-y-auto rounded-lg border border-black/10 bg-white p-1.5 shadow-lg">
          {naoAplicadas.map((e) => (
            <button
              key={e.id}
              onClick={() => {
                onAplicar(cliente.negocioId!, e.id);
                setAberto(false);
              }}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-escuro hover:bg-fundo"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.cor }} />
              {e.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
