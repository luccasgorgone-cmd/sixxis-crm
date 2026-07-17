"use client";

// Aba "Clientes": clientes do usuario (colaborador: os seus; admin: todos, com
// seletor de colaborador / sem dono). Lista rica + filtros + busca + marcacoes
// inline + abertura do painel do cliente. Usa o kit visual (KpiCard, EmptyState,
// TabelaOrdenavel).
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Tag,
  Plus,
  X,
  MessageSquare,
  MessageCircle,
  Loader2,
  FileText,
  Contact,
  Building2,
  ShieldCheck,
  ShieldOff,
  MapPin,
  UserPlus,
  Send,
  Repeat,
  CheckSquare,
  Trash2,
  Ban,
} from "lucide-react";
import { InputBusca } from "@/components/ui/InputBusca";
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
import { BadgeSegmento } from "@/components/cliente/BlocoCliente";
import { PainelNegocio } from "@/components/kanban/PainelNegocio";
import { ModalCadastrarCliente } from "./ModalCadastrarCliente";
import { ModalEnvioSelecao } from "./ModalEnvioSelecao";
import { ModalTransferencia } from "./ModalTransferencia";
import { ModalEtiquetasMassa } from "./ModalEtiquetasMassa";
import { ModalExcluirClientes } from "./ModalExcluirClientes";
import { ModalBloquear } from "./ModalBloquear";
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
  empresaFaturada: string | null;
  garantia: boolean | null;
  segmento: "VAREJO" | "ATACADO" | null;
  uf: string | null;
  cidade: string | null;
  produtosInteresse: { id: string; nome: string }[];
  origem: string | null;
  anuncioTitulo: string | null;
  anuncioUrl: string | null;
  bloqueado: boolean;
};

// Espelha o take da rota /api/clientes: a lista carrega no maximo 500 do recorte.
const TETO_CLIENTES = 500;

type EmpresaOpcao = { id: string; nome: string };
type ProdutoOpcao = { id: string; nome: string };

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
  acessoVenda = false,
  acessoPosVenda = false,
}: {
  papel: string;
  agenteIdAtual: string;
  acessoVenda?: boolean;
  acessoPosVenda?: boolean;
}) {
  const ehAdmin = papel === "ADMIN";
  // Garantia e conceito de POS-VENDA: filtro so aparece para quem tem esse acesso
  // (admin, papel POS_VENDA ou flag acessoPosVenda). Quem tem venda + pos-venda
  // ve os filtros dos dois.
  const podePosVenda = ehAdmin || papel === "POS_VENDA" || acessoPosVenda;
  // Temperatura e conceito de VENDA: filtro visivel a quem tem acesso a venda.
  const podeVenda = ehAdmin || acessoVenda;

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<ValorPeriodo>({ preset: "mes" });

  // Filtros
  const [etiquetaF, setEtiquetaF] = useState("");
  const [temperaturaF, setTemperaturaF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [empresaF, setEmpresaF] = useState("");
  const [produtoInteresseF, setProdutoInteresseF] = useState("");
  const [origemF, setOrigemF] = useState("");
  const [garantiaF, setGarantiaF] = useState("");
  const [segmentoF, setSegmentoF] = useState("");
  const [rastreioF, setRastreioF] = useState("");
  const [ufF, setUfF] = useState("");
  const [cidadeF, setCidadeF] = useState("");
  const [agenteSel, setAgenteSel] = useState(""); // admin
  const [semDono, setSemDono] = useState(false); // admin

  // Auxiliares
  const [todasEtiquetas, setTodasEtiquetas] = useState<EtiquetaChip[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);
  const [produtosInteresse, setProdutosInteresse] = useState<ProdutoOpcao[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);

  // Cadastro manual de cliente
  const [cadastrar, setCadastrar] = useState(false);

  // Envio em massa por selecao
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [envioAberto, setEnvioAberto] = useState(false);
  const [transferAberto, setTransferAberto] = useState(false);
  const [etiquetarAberto, setEtiquetarAberto] = useState(false);
  // Exclusao (admin): lista de leadIds a excluir (null = fechado).
  const [excluirIds, setExcluirIds] = useState<string[] | null>(null);
  // Bloqueio (admin): alvo do modal + toggle de mostrar bloqueados.
  const [bloquearAlvo, setBloquearAlvo] = useState<{
    leadId: string;
    nome: string;
    bloqueado: boolean;
  } | null>(null);
  const [mostrarBloqueados, setMostrarBloqueados] = useState(false);

  // Painel
  const [painelId, setPainelId] = useState<string | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [agentes, setAgentes] = useState<AgenteResumo[]>([]);

  // Abrir/iniciar conversa a partir da lista: garante a conversa e vai ao Inbox
  // (o Inbox pre-abre pelo ?lead=). Nao dispara nada.
  const router = useRouter();
  const [abrindoConversa, setAbrindoConversa] = useState<string | null>(null);
  const abrirConversa = useCallback(
    async (leadId: string) => {
      if (abrindoConversa) return;
      setAbrindoConversa(leadId);
      try {
        await fetch("/api/conversas/iniciar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId }),
        });
      } catch {
        // segue para o Inbox mesmo assim (idempotente)
      }
      router.push(`/inbox?lead=${leadId}`);
    },
    [abrindoConversa, router],
  );

  useEffect(() => {
    fetch("/api/etiquetas")
      .then((r) => (r.ok ? r.json() : { etiquetas: [] }))
      .then((d) => setTodasEtiquetas(d.etiquetas ?? []))
      .catch(() => undefined);
    fetch("/api/etapas")
      .then((r) => (r.ok ? r.json() : { etapas: [] }))
      .then((d) => setEtapas(d.etapas ?? []))
      .catch(() => undefined);
    fetch("/api/empresas-faturadas")
      .then((r) => (r.ok ? r.json() : { empresas: [] }))
      .then((d) => setEmpresas(d.empresas ?? []))
      .catch(() => undefined);
    fetch("/api/produtos-interesse")
      .then((r) => (r.ok ? r.json() : { produtos: [] }))
      .then((d) => setProdutosInteresse(d.produtos ?? []))
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
      if (empresaF) p.set("empresa", empresaF);
      if (produtoInteresseF) p.set("produtoInteresse", produtoInteresseF);
      if (origemF) p.set("origem", origemF);
      if (garantiaF) p.set("garantia", garantiaF);
      if (segmentoF) p.set("segmento", segmentoF);
      if (rastreioF) p.set("rastreio", rastreioF);
      if (ehAdmin && semDono) p.set("semDono", "1");
      else if (ehAdmin && agenteSel) p.set("agenteId", agenteSel);
      if (ehAdmin && mostrarBloqueados) p.set("mostrarBloqueados", "1");
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
  }, [etiquetaF, temperaturaF, statusF, empresaF, produtoInteresseF, origemF, garantiaF, segmentoF, rastreioF, semDono, agenteSel, ehAdmin, periodo, mostrarBloqueados]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // UFs presentes nos clientes carregados (para o seletor de Estado).
  const ufsDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const c of clientes) if (c.uf) set.add(c.uf.toUpperCase());
    return [...set].sort();
  }, [clientes]);

  // Busca textual (nome/telefone) + filtros de localizacao (estado/cidade),
  // aplicados no cliente para manter as opcoes de UF estaveis.
  const filtrados = useMemo(() => {
    const q = normalizar(busca.trim());
    const qd = busca.replace(/\D/g, "");
    const cidadeQ = normalizar(cidadeF.trim());
    return clientes.filter((c) => {
      if (ufF && (c.uf ?? "").toUpperCase() !== ufF) return false;
      if (cidadeQ && !normalizar(c.cidade ?? "").includes(cidadeQ)) return false;
      if (!q && !qd) return true;
      const nome = normalizar(c.nome);
      const tel = c.telefone.replace(/\D/g, "");
      return (q && nome.includes(q)) || (qd.length > 0 && tel.includes(qd));
    });
  }, [clientes, busca, ufF, cidadeF]);

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

  function alternarSel(leadId: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(leadId)) novo.delete(leadId);
      else novo.add(leadId);
      return novo;
    });
  }
  const todosDoRecorteSel =
    filtrados.length > 0 && filtrados.every((c) => selecionados.has(c.leadId));
  function alternarTodos() {
    setSelecionados((prev) => {
      if (todosDoRecorteSel) {
        const novo = new Set(prev);
        for (const c of filtrados) novo.delete(c.leadId);
        return novo;
      }
      const novo = new Set(prev);
      for (const c of filtrados) novo.add(c.leadId);
      return novo;
    });
  }

  // Estado do checkbox mestre: alguns (nao todos) do recorte selecionados.
  const algunsDoRecorteSel =
    !todosDoRecorteSel && filtrados.some((c) => selecionados.has(c.leadId));

  const colunaSelecao: Coluna<Cliente> = {
    chave: "sel",
    rotulo: "",
    cabecalho: () => (
      <input
        type="checkbox"
        checked={todosDoRecorteSel}
        ref={(el) => {
          if (el) el.indeterminate = algunsDoRecorteSel;
        }}
        onClick={(e) => e.stopPropagation()}
        onChange={() => alternarTodos()}
        className="h-4 w-4 accent-tiffany"
        aria-label="Selecionar todos os clientes filtrados"
        title="Selecionar todos os filtrados"
      />
    ),
    render: (c) => (
      <input
        type="checkbox"
        checked={selecionados.has(c.leadId)}
        onClick={(e) => e.stopPropagation()}
        onChange={() => alternarSel(c.leadId)}
        className="h-4 w-4 accent-tiffany"
        aria-label="Selecionar cliente"
      />
    ),
  };

  const colunas: Coluna<Cliente>[] = [
    ...(modoSelecao ? [colunaSelecao] : []),
    {
      chave: "nome",
      rotulo: "Cliente",
      sortValue: (c) => c.nome.toLowerCase(),
      render: (c) => (
        <div className="flex items-center gap-2.5">
          <AvatarCliente nome={c.nome} telefone={c.telefone} fotoUrl={c.fotoUrl} tamanho={32} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium text-escuro">
              <span className="truncate">{c.nome}</span>
              {c.bloqueado && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-erro/10 px-1.5 py-0.5 text-[10px] font-semibold text-erro">
                  <Ban className="h-2.5 w-2.5" /> Bloqueado
                </span>
              )}
            </p>
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
      chave: "local",
      rotulo: "Local",
      sortValue: (c) => `${c.uf ?? ""}${c.cidade ?? ""}`.toLowerCase(),
      render: (c) =>
        c.cidade || c.uf ? (
          <span className="inline-flex items-center gap-1 text-medio/80">
            <MapPin className="h-3.5 w-3.5 text-medio/40" />
            {c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ""}` : c.uf}
          </span>
        ) : (
          <span className="text-xs text-medio/40">—</span>
        ),
    },
    {
      chave: "empresaFaturada",
      rotulo: "Empresa",
      sortValue: (c) => (c.empresaFaturada ?? "").toLowerCase(),
      render: (c) =>
        c.empresaFaturada ? (
          <span className="inline-flex items-center gap-1 text-medio/80">
            <Building2 className="h-3.5 w-3.5 text-medio/40" />
            {c.empresaFaturada}
          </span>
        ) : (
          <span className="text-xs text-medio/40">—</span>
        ),
    },
    {
      chave: "interesse",
      rotulo: "Interesse",
      sortValue: (c) => c.produtosInteresse.length,
      render: (c) =>
        c.produtosInteresse.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {c.produtosInteresse.slice(0, 2).map((p) => (
              <span
                key={p.id}
                className="rounded-full bg-tiffany/10 px-1.5 py-0.5 text-[10px] font-medium text-tiffany"
              >
                {p.nome}
              </span>
            ))}
            {c.produtosInteresse.length > 2 && (
              <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-medium text-medio/60">
                +{c.produtosInteresse.length - 2}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-medio/40">—</span>
        ),
    },
    {
      chave: "origem",
      rotulo: "Origem",
      sortValue: (c) => (c.origem ?? "").toLowerCase(),
      render: (c) =>
        c.origem || c.anuncioTitulo ? (
          <div className="flex flex-col">
            <span className="text-xs font-medium text-medio/80">
              {c.origem === "anuncio"
                ? "Anuncio"
                : c.origem === "whatsapp"
                  ? "WhatsApp"
                  : c.origem === "manual"
                    ? "Manual"
                    : (c.origem ?? "—")}
            </span>
            {c.anuncioTitulo &&
              (c.anuncioUrl ? (
                <a
                  href={c.anuncioUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="max-w-40 truncate text-[11px] text-tiffany hover:underline"
                  title={c.anuncioTitulo}
                >
                  {c.anuncioTitulo}
                </a>
              ) : (
                <span className="max-w-40 truncate text-[11px] text-medio/50" title={c.anuncioTitulo}>
                  {c.anuncioTitulo}
                </span>
              ))}
          </div>
        ) : (
          <span className="text-xs text-medio/40">—</span>
        ),
    },
    {
      chave: "garantia",
      rotulo: "Garantia",
      sortValue: (c) => (c.garantia === true ? 2 : c.garantia === false ? 1 : 0),
      render: (c) => <SeloGarantia garantia={c.garantia} />,
    },
    {
      chave: "segmento",
      rotulo: "Segmento",
      sortValue: (c) => c.segmento ?? "",
      render: (c) =>
        c.segmento ? (
          <BadgeSegmento segmento={c.segmento} />
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
    {
      chave: "acoes",
      rotulo: "",
      align: "right",
      render: (c) => (
        <div className="flex items-center justify-end gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              void abrirConversa(c.leadId);
            }}
            disabled={abrindoConversa === c.leadId}
            title="Abrir conversa no Inbox"
            aria-label="Abrir conversa"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-medio/70 transition-colors hover:bg-tiffany/10 hover:text-tiffany disabled:opacity-50"
          >
            {abrindoConversa === c.leadId ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="h-4 w-4" />
            )}
          </button>
          {ehAdmin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setBloquearAlvo({ leadId: c.leadId, nome: c.nome, bloqueado: c.bloqueado });
              }}
              title={c.bloqueado ? "Desbloquear contato" : "Bloquear contato"}
              aria-label={c.bloqueado ? "Desbloquear contato" : "Bloquear contato"}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/5 ${
                c.bloqueado ? "text-erro" : "text-medio/70 hover:text-erro"
              }`}
            >
              <Ban className="h-4 w-4" />
            </button>
          )}
          {ehAdmin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExcluirIds([c.leadId]);
              }}
              title="Excluir cliente"
              aria-label="Excluir cliente"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-medio/70 transition-colors hover:bg-erro/10 hover:text-erro"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
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
        <div className="flex flex-wrap items-center gap-2">
          {ehAdmin && (
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
          )}
          {ehAdmin && (
            <button
              onClick={() => setMostrarBloqueados((v) => !v)}
              title="Mostrar/ocultar contatos bloqueados"
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                mostrarBloqueados
                  ? "border-erro/40 bg-erro/10 text-erro"
                  : "border-black/10 text-medio hover:bg-black/5"
              }`}
            >
              <Ban className="h-4 w-4" /> Bloqueados
            </button>
          )}
          <button
            onClick={() => {
              setModoSelecao((v) => !v);
              if (modoSelecao) setSelecionados(new Set());
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
              modoSelecao
                ? "border-tiffany bg-tiffany/10 text-tiffany"
                : "border-black/10 text-medio hover:bg-black/5"
            }`}
          >
            <CheckSquare className="h-4 w-4" /> Envio em massa
          </button>
          <button
            onClick={() => setCadastrar(true)}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro"
          >
            <UserPlus className="h-4 w-4" /> Cadastrar cliente
          </button>
        </div>
      </div>

      {modoSelecao && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-tiffany/30 bg-tiffany/5 px-4 py-2.5">
          <button
            onClick={alternarTodos}
            className="flex items-center gap-1.5 text-sm font-medium text-tiffany hover:underline"
          >
            <CheckSquare className="h-4 w-4" />
            {todosDoRecorteSel
              ? "Desmarcar todos do recorte"
              : "Selecionar todos do recorte"}
          </button>
          <span className="text-sm text-medio/70">
            <strong className="text-escuro">{selecionados.size}</strong>{" "}
            selecionados
          </span>
          {clientes.length >= TETO_CLIENTES && (
            <span className="text-xs text-medio/50">
              Selecionando os {TETO_CLIENTES} carregados. Refine os filtros para
              alcancar os demais.
            </span>
          )}
          {selecionados.size > 0 && (
            <button
              onClick={() => setSelecionados(new Set())}
              className="text-sm text-medio/60 hover:text-escuro"
            >
              Limpar
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {(podeVenda || podePosVenda) && (
              <button
                onClick={() => setTransferAberto(true)}
                disabled={selecionados.size === 0}
                className="flex items-center gap-1.5 rounded-lg border border-tiffany/40 px-3 py-1.5 text-sm font-semibold text-tiffany hover:bg-tiffany/10 disabled:opacity-50"
              >
                <Repeat className="h-4 w-4" /> Transferir ({selecionados.size})
              </button>
            )}
            <button
              onClick={() => setEtiquetarAberto(true)}
              disabled={selecionados.size === 0}
              className="flex items-center gap-1.5 rounded-lg border border-tiffany/40 px-3 py-1.5 text-sm font-semibold text-tiffany hover:bg-tiffany/10 disabled:opacity-50"
            >
              <Tag className="h-4 w-4" /> Etiquetar ({selecionados.size})
            </button>
            <button
              onClick={() => setEnvioAberto(true)}
              disabled={selecionados.size === 0}
              className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> Escrever mensagem ({selecionados.size})
            </button>
            {ehAdmin && (
              <button
                onClick={() => setExcluirIds([...selecionados])}
                disabled={selecionados.size === 0}
                className="flex items-center gap-1.5 rounded-lg border border-erro/40 px-3 py-1.5 text-sm font-semibold text-erro transition-colors hover:bg-erro/10 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Excluir ({selecionados.size})
              </button>
            )}
          </div>
        </div>
      )}

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
        <InputBusca
          valor={busca}
          onChange={setBusca}
          placeholder="Buscar nome ou telefone"
          className="w-56"
        />
        <select value={etiquetaF} onChange={(e) => setEtiquetaF(e.target.value)} className="campo">
          <option value="">Etiqueta: todas</option>
          {todasEtiquetas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        {podeVenda && (
          <select value={temperaturaF} onChange={(e) => setTemperaturaF(e.target.value)} className="campo">
            <option value="">Temperatura: todas</option>
            <option value="QUENTE">Quente</option>
            <option value="MORNO">Morno</option>
            <option value="FRIO">Frio</option>
          </select>
        )}
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="campo">
          <option value="">Status: todos</option>
          <option value="ABERTO">Em aberto</option>
          <option value="GANHO">Ganho</option>
          <option value="PERDIDO">Perdido</option>
          <option value="PENDENTE">Pendente</option>
        </select>
        <select value={empresaF} onChange={(e) => setEmpresaF(e.target.value)} className="campo">
          <option value="">Empresa: todas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        <select
          value={produtoInteresseF}
          onChange={(e) => setProdutoInteresseF(e.target.value)}
          className="campo"
        >
          <option value="">Interesse: todos</option>
          {produtosInteresse.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <select value={origemF} onChange={(e) => setOrigemF(e.target.value)} className="campo">
          <option value="">Origem: todas</option>
          <option value="anuncio">Anuncio</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="manual">Cadastro manual</option>
          <option value="site">Site</option>
        </select>
        {podePosVenda && (
          <select value={garantiaF} onChange={(e) => setGarantiaF(e.target.value)} className="campo">
            <option value="">Garantia: todas</option>
            <option value="sim">Com garantia</option>
            <option value="nao">Sem garantia</option>
          </select>
        )}
        <select value={segmentoF} onChange={(e) => setSegmentoF(e.target.value)} className="campo">
          <option value="">Segmento: todos</option>
          <option value="VAREJO">Varejo</option>
          <option value="ATACADO">Atacado</option>
        </select>
        <select value={rastreioF} onChange={(e) => setRastreioF(e.target.value)} className="campo">
          <option value="">Rastreio: todos</option>
          <option value="com">Com rastreio</option>
          <option value="sem">Sem rastreio</option>
        </select>
        <select value={ufF} onChange={(e) => setUfF(e.target.value)} className="campo">
          <option value="">Estado: todos</option>
          {ufsDisponiveis.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>
        <input
          value={cidadeF}
          onChange={(e) => setCidadeF(e.target.value)}
          placeholder="Cidade"
          className="campo w-36"
        />
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
          onLinha={
            modoSelecao
              ? (c) => alternarSel(c.leadId)
              : (c) => c.negocioId && setPainelId(c.negocioId)
          }
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

      {cadastrar && (
        <ModalCadastrarCliente
          ehAdmin={ehAdmin}
          vendedores={vendedores}
          onFechar={() => setCadastrar(false)}
          onCriado={() => {
            setCadastrar(false);
            void carregar();
          }}
        />
      )}

      {envioAberto && (
        <ModalEnvioSelecao
          leadIds={[...selecionados]}
          ehAdmin={ehAdmin}
          onFechar={() => setEnvioAberto(false)}
        />
      )}

      {transferAberto && (
        <ModalTransferencia
          leadIds={[...selecionados]}
          ehAdmin={ehAdmin}
          podeVenda={podeVenda}
          podePosVenda={podePosVenda}
          onFechar={() => setTransferAberto(false)}
          onConcluido={() => {
            setTransferAberto(false);
            setSelecionados(new Set());
            setModoSelecao(false);
            void carregar();
          }}
        />
      )}

      {etiquetarAberto && (
        <ModalEtiquetasMassa
          leadIds={[...selecionados]}
          etiquetas={todasEtiquetas}
          onFechar={() => setEtiquetarAberto(false)}
          onConcluido={() => {
            setEtiquetarAberto(false);
            setSelecionados(new Set());
            setModoSelecao(false);
            void carregar();
          }}
        />
      )}

      {excluirIds && (
        <ModalExcluirClientes
          leadIds={excluirIds}
          onFechar={() => setExcluirIds(null)}
          onConcluido={() => {
            setExcluirIds(null);
            setSelecionados(new Set());
            setModoSelecao(false);
            void carregar();
          }}
        />
      )}

      {bloquearAlvo && (
        <ModalBloquear
          leadId={bloquearAlvo.leadId}
          nome={bloquearAlvo.nome}
          bloqueado={bloquearAlvo.bloqueado}
          onFechar={() => setBloquearAlvo(null)}
          onConcluido={() => {
            setBloquearAlvo(null);
            void carregar();
          }}
        />
      )}
    </div>
  );
}

// Selo de garantia: Com garantia (verde) / Sem garantia (ambar) / — (neutro).
function SeloGarantia({ garantia }: { garantia: boolean | null }) {
  if (garantia === true) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
        <ShieldCheck className="h-3 w-3 shrink-0" /> Garantia
      </span>
    );
  }
  if (garantia === false) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        <ShieldOff className="h-3 w-3 shrink-0" /> Sem garantia
      </span>
    );
  }
  return <span className="text-xs text-medio/40">—</span>;
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
