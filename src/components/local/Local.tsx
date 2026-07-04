"use client";

// Aba Local: produtos em assistencia fisica na empresa (pos-venda). Lista com
// filtros, resumo por status, CRUD em modal e link para a ficha do cliente.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  PackageOpen,
  Search,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  X,
  User,
  MapPin,
  Wrench,
  CalendarDays,
  Phone,
  Mail,
  IdCard,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { EstadoErro } from "@/components/ui/Estado";
import { mascararCep, mascararCpf, formatarTelefone } from "@/lib/format";
import { buscarViaCep } from "@/lib/viacep";
import { STATUS_ORDEM, STATUS_META } from "@/lib/assistencia";

type Item = {
  id: string;
  descricaoProduto: string;
  modelo: string | null;
  categoria: string | null;
  numeroSerie: string | null;
  defeitoRelatado: string | null;
  status: string;
  localizacao: string | null;
  tecnicoResponsavel: string | null;
  observacoes: string | null;
  clienteNome: string | null;
  clienteTelefone: string | null;
  clienteEmail: string | null;
  clienteCpf: string | null;
  enderecoCep: string | null;
  enderecoLogradouro: string | null;
  enderecoNumero: string | null;
  enderecoComplemento: string | null;
  enderecoBairro: string | null;
  enderecoCidade: string | null;
  enderecoUf: string | null;
  dataEntrada: string;
  dataSaida: string | null;
  leadId: string | null;
  leadNome: string | null;
  leadFoto: string | null;
};

// Resumo do endereco do item numa linha (logradouro, numero · bairro · cidade/UF).
function resumoEndereco(it: {
  enderecoLogradouro: string | null;
  enderecoNumero: string | null;
  enderecoComplemento: string | null;
  enderecoBairro: string | null;
  enderecoCidade: string | null;
  enderecoUf: string | null;
}): string {
  const linha1 = [it.enderecoLogradouro, it.enderecoNumero].filter(Boolean).join(", ");
  const cidadeUf =
    it.enderecoCidade && it.enderecoUf
      ? `${it.enderecoCidade}/${it.enderecoUf}`
      : it.enderecoCidade;
  const linha2 = [it.enderecoBairro, cidadeUf].filter(Boolean).join(" — ");
  return [linha1, it.enderecoComplemento, linha2].filter(Boolean).join(" · ");
}

const FILTROS_PERIODO = [
  { v: "", r: "Todo o periodo" },
  { v: "hoje", r: "Hoje" },
  { v: "semana", r: "7 dias" },
  { v: "mes", r: "30 dias" },
];

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function Local() {
  const toast = useToast();
  const [itens, setItens] = useState<Item[]>([]);
  const [resumo, setResumo] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [editando, setEditando] = useState<Item | "novo" | null>(null);
  // Deep-link vindo da ficha do cliente (?item=<id>): rola ate o item e o destaca.
  const [destaque, setDestaque] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("item");
    if (id) setDestaque(id);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (periodo) p.set("periodo", periodo);
      if (buscaAplicada.trim()) p.set("busca", buscaAplicada.trim());
      const r = await fetch(`/api/local?${p.toString()}`);
      if (r.status === 403) {
        setErro("Voce nao tem acesso a esta area.");
        return;
      }
      if (!r.ok) throw new Error();
      const d = await r.json();
      setItens(d.itens ?? []);
      setResumo(d.resumo ?? {});
      setErro(null);
    } catch {
      setErro("Nao foi possivel carregar os itens.");
    } finally {
      setCarregando(false);
    }
  }, [status, periodo, buscaAplicada]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Ao chegar via ?item=, rola ate o card e o destaca por alguns segundos.
  useEffect(() => {
    if (!destaque || itens.length === 0) return;
    document
      .getElementById(`local-item-${destaque}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setDestaque(null), 2600);
    return () => clearTimeout(t);
  }, [destaque, itens]);

  async function mudarStatus(item: Item, novo: string) {
    setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: novo } : i)));
    try {
      await fetch(`/api/local/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novo }),
      });
      await carregar();
    } catch {
      toast.erro("Nao foi possivel atualizar o status.");
      await carregar();
    }
  }

  async function remover(item: Item) {
    setItens((prev) => prev.filter((i) => i.id !== item.id));
    try {
      const r = await fetch(`/api/local/${item.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast.sucesso("Item removido.");
      await carregar();
    } catch {
      toast.erro("Nao foi possivel remover.");
      await carregar();
    }
  }

  const totalAtivo = useMemo(
    () => STATUS_ORDEM.filter((s) => s !== "ENTREGUE").reduce((acc, s) => acc + (resumo[s] ?? 0), 0),
    [resumo],
  );

  return (
    <div className="scroll-fino h-full space-y-4 overflow-y-auto p-6">
      {/* Cabecalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tiffany/10 text-tiffany">
            <PackageOpen className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-escuro">Local</h2>
            <p className="text-sm text-medio/60">
              Produtos em assistencia na empresa ({totalAtivo} em andamento)
            </p>
          </div>
        </div>
        <button
          onClick={() => setEditando("novo")}
          className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro"
        >
          <Plus className="h-4 w-4" /> Receber produto
        </button>
      </div>

      {/* Resumo por status */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_ORDEM.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(status === s ? "" : s)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              status === s ? "border-tiffany" : "border-transparent"
            } ${STATUS_META[s].classe}`}
          >
            <strong>{resumo[s] ?? 0}</strong> {STATUS_META[s].rotulo}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-medio/40" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente, modelo ou serie"
            className="campo w-60 pl-8"
          />
        </div>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="campo">
          {FILTROS_PERIODO.map((f) => (
            <option key={f.v} value={f.v}>
              {f.r}
            </option>
          ))}
        </select>
        {status && (
          <button
            onClick={() => setStatus("")}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-medio hover:bg-black/5"
          >
            Limpar status
          </button>
        )}
      </div>

      {/* Lista */}
      {erro ? (
        <EstadoErro mensagem={erro} onRetry={carregar} />
      ) : carregando && itens.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-medio/50">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : itens.length === 0 ? (
        <EmptyState
          icone={PackageOpen}
          titulo="Nenhum produto em assistencia"
          texto="Clique em 'Receber produto' para cadastrar um item que chegou para conserto."
        />
      ) : (
        <div className="space-y-2">
          {itens.map((it) => (
            <ItemCard
              key={it.id}
              it={it}
              destacado={it.id === destaque}
              onEditar={() => setEditando(it)}
              onStatus={(s) => void mudarStatus(it, s)}
              onRemover={() => void remover(it)}
            />
          ))}
        </div>
      )}

      {editando && (
        <ModalItem
          item={editando === "novo" ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            void carregar();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

function ItemCard({
  it,
  destacado = false,
  onEditar,
  onStatus,
  onRemover,
}: {
  it: Item;
  destacado?: boolean;
  onEditar: () => void;
  onStatus: (s: string) => void;
  onRemover: () => void;
}) {
  const meta = STATUS_META[it.status] ?? STATUS_META.RECEBIDO;
  const nomeCliente = it.leadNome ?? it.clienteNome;
  const endereco = resumoEndereco(it);
  return (
    <div
      id={`local-item-${it.id}`}
      className={`rounded-xl border bg-white p-3.5 transition-shadow ${
        destacado ? "border-tiffany ring-2 ring-tiffany/40" : "border-black/5"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="break-words text-sm font-semibold text-escuro">{it.descricaoProduto}</p>
            {it.modelo && (
              <span className="rounded bg-black/5 px-1.5 py-0.5 text-[11px] font-medium text-medio/70">
                {it.modelo}
              </span>
            )}
            {it.categoria && (
              <span className="rounded bg-tiffany/10 px-1.5 py-0.5 text-[11px] font-medium text-tiffany">
                {it.categoria}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-medio/60">
            {it.leadId ? (
              <Link
                href={`/inbox?lead=${it.leadId}`}
                title="Abrir conversa do cliente"
                className="flex max-w-[12rem] items-center gap-1 text-tiffany hover:underline"
              >
                <User className="h-3 w-3 shrink-0" />
                <span className="truncate">{nomeCliente ?? "Cliente"}</span>
              </Link>
            ) : nomeCliente ? (
              <span className="flex max-w-[12rem] items-center gap-1">
                <User className="h-3 w-3 shrink-0 text-medio/40" />
                <span className="truncate">{nomeCliente}</span>
              </span>
            ) : null}
            {it.clienteTelefone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3 text-medio/40" /> {formatarTelefone(it.clienteTelefone)}
              </span>
            )}
            {it.numeroSerie && <span>Serie: {it.numeroSerie}</span>}
            {it.localizacao && (
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-medio/40" /> {it.localizacao}</span>
            )}
            {it.tecnicoResponsavel && (
              <span className="flex items-center gap-1"><Wrench className="h-3 w-3 text-medio/40" /> {it.tecnicoResponsavel}</span>
            )}
            <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3 text-medio/40" /> {dataCurta(it.dataEntrada)}</span>
          </div>
          {/* Contato extra + endereco do cliente (quando informados) */}
          {(it.clienteEmail || it.clienteCpf || endereco) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-medio/50">
              {it.clienteEmail && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3 text-medio/40" /> {it.clienteEmail}
                </span>
              )}
              {it.clienteCpf && (
                <span className="flex items-center gap-1">
                  <IdCard className="h-3 w-3 text-medio/40" /> {mascararCpf(it.clienteCpf)}
                </span>
              )}
              {endereco && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-medio/40" /> {endereco}
                  {it.enderecoCep ? ` (CEP ${mascararCep(it.enderecoCep)})` : ""}
                </span>
              )}
            </div>
          )}
          {it.defeitoRelatado && (
            <p className="mt-1 line-clamp-2 text-xs text-medio/70">Defeito: {it.defeitoRelatado}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <select
            value={it.status}
            onChange={(e) => onStatus(e.target.value)}
            className={`rounded-full border-0 px-2 py-1 text-[11px] font-semibold outline-none ${meta.classe}`}
          >
            {STATUS_ORDEM.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].rotulo}
              </option>
            ))}
          </select>
          <button
            onClick={onEditar}
            title="Editar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-medio/60 hover:bg-black/5 hover:text-escuro"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onRemover}
            title="Remover"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-medio/60 hover:bg-black/5 hover:text-erro"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

type LeadOpcao = { leadId: string; nome: string; telefone: string };
type EnderecoLead = {
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  principal: boolean;
};

function ModalItem({
  item,
  onFechar,
  onSalvo,
  toast,
}: {
  item: Item | null;
  onFechar: () => void;
  onSalvo: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [descricaoProduto, setDescricao] = useState(item?.descricaoProduto ?? "");
  const [modelo, setModelo] = useState(item?.modelo ?? "");
  const [categoria, setCategoria] = useState(item?.categoria ?? "");
  const [numeroSerie, setNumeroSerie] = useState(item?.numeroSerie ?? "");
  const [defeitoRelatado, setDefeito] = useState(item?.defeitoRelatado ?? "");
  const [localizacao, setLocalizacao] = useState(item?.localizacao ?? "");
  const [tecnicoResponsavel, setTecnico] = useState(item?.tecnicoResponsavel ?? "");
  const [observacoes, setObservacoes] = useState(item?.observacoes ?? "");
  const [status, setStatus] = useState(item?.status ?? "RECEBIDO");
  const [leadId, setLeadId] = useState<string | null>(item?.leadId ?? null);
  const [leadNome, setLeadNome] = useState<string | null>(item?.leadNome ?? null);
  const [salvando, setSalvando] = useState(false);

  // Dados do cliente (snapshot editavel). Ao vincular um cliente, sao
  // pre-preenchidos a partir do lead (contato + endereco principal).
  const [clienteNome, setClienteNome] = useState(item?.clienteNome ?? "");
  const [clienteTelefone, setClienteTelefone] = useState(item?.clienteTelefone ?? "");
  const [clienteEmail, setClienteEmail] = useState(item?.clienteEmail ?? "");
  const [clienteCpf, setClienteCpf] = useState(
    item?.clienteCpf ? mascararCpf(item.clienteCpf) : "",
  );
  const [endCep, setEndCep] = useState(item?.enderecoCep ? mascararCep(item.enderecoCep) : "");
  const [endLogradouro, setEndLogradouro] = useState(item?.enderecoLogradouro ?? "");
  const [endNumero, setEndNumero] = useState(item?.enderecoNumero ?? "");
  const [endComplemento, setEndComplemento] = useState(item?.enderecoComplemento ?? "");
  const [endBairro, setEndBairro] = useState(item?.enderecoBairro ?? "");
  const [endCidade, setEndCidade] = useState(item?.enderecoCidade ?? "");
  const [endUf, setEndUf] = useState(item?.enderecoUf ?? "");
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Busca no ViaCEP (helper compartilhado) e completa logradouro/bairro/cidade/uf.
  async function buscarCep(cepBruto: string) {
    if (cepBruto.replace(/\D/g, "").length !== 8) return;
    setBuscandoCep(true);
    try {
      const via = await buscarViaCep(cepBruto);
      if (via) {
        setEndLogradouro((v) => v || via.logradouro);
        setEndBairro((v) => v || via.bairro);
        setEndCidade((v) => v || via.cidade);
        setEndUf((v) => v || via.uf);
      }
    } finally {
      setBuscandoCep(false);
    }
  }

  // Pre-preenche os dados do cliente a partir do lead vinculado (contato via
  // /api/leads/[id]; endereco principal via .../enderecos). So preenche vazios,
  // sem sobrescrever ajustes ja feitos. Silencioso se nao houver escopo/dados —
  // o servidor tambem completa o que faltar ao salvar.
  async function preencherDoLead(id: string, nome: string, telefone: string) {
    setClienteNome((v) => v || nome);
    setClienteTelefone((v) => v || telefone);
    try {
      const [rLead, rEnd] = await Promise.all([
        fetch(`/api/leads/${id}`),
        fetch(`/api/leads/${id}/enderecos`),
      ]);
      if (rLead.ok) {
        const c = (await rLead.json())?.cliente;
        if (c) {
          setClienteEmail((v) => v || c.email || "");
          setClienteCpf((v) => v || (c.cpf ? mascararCpf(c.cpf) : ""));
        }
      }
      if (rEnd.ok) {
        const lista = ((await rEnd.json())?.enderecos ?? []) as EnderecoLead[];
        const e = lista.find((x) => x.principal) ?? lista[0];
        if (e) {
          setEndCep((v) => v || (e.cep ? mascararCep(e.cep) : ""));
          setEndLogradouro((v) => v || e.logradouro || "");
          setEndNumero((v) => v || e.numero || "");
          setEndComplemento((v) => v || e.complemento || "");
          setEndBairro((v) => v || e.bairro || "");
          setEndCidade((v) => v || e.cidade || "");
          setEndUf((v) => v || e.uf || "");
        }
      }
    } catch {
      // silencioso: o servidor completa a partir do lead ao salvar
    }
  }

  // Busca de cliente (opcional).
  const [buscaCliente, setBuscaCliente] = useState("");
  const [resultados, setResultados] = useState<LeadOpcao[]>([]);
  useEffect(() => {
    const q = buscaCliente.trim();
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    let cancel = false;
    const t = setTimeout(() => {
      fetch(`/api/clientes?busca=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { clientes: [] }))
        .then((d) => {
          if (!cancel) {
            const lista = (d.clientes ?? d.itens ?? []) as LeadOpcao[];
            setResultados(lista.slice(0, 6));
          }
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [buscaCliente]);

  async function salvar() {
    if (!descricaoProduto.trim()) {
      toast.erro("Informe a descricao do produto.");
      return;
    }
    setSalvando(true);
    // Dados do cliente/endereco. Na EDICAO envia todos (permite limpar campos);
    // na CRIACAO omite os vazios para o servidor completar a partir do lead.
    const cliente: Record<string, string> = {
      clienteNome: clienteNome.trim(),
      clienteTelefone: clienteTelefone.trim(),
      clienteEmail: clienteEmail.trim(),
      clienteCpf: clienteCpf.replace(/\D/g, ""),
      enderecoCep: endCep.replace(/\D/g, ""),
      enderecoLogradouro: endLogradouro.trim(),
      enderecoNumero: endNumero.trim(),
      enderecoComplemento: endComplemento.trim(),
      enderecoBairro: endBairro.trim(),
      enderecoCidade: endCidade.trim(),
      enderecoUf: endUf.trim(),
    };
    const clientePayload = item
      ? cliente
      : Object.fromEntries(Object.entries(cliente).filter(([, v]) => v));
    const corpo = {
      descricaoProduto: descricaoProduto.trim(),
      modelo: modelo.trim() || null,
      categoria: categoria.trim() || null,
      numeroSerie: numeroSerie.trim() || null,
      defeitoRelatado: defeitoRelatado.trim() || null,
      localizacao: localizacao.trim() || null,
      tecnicoResponsavel: tecnicoResponsavel.trim() || null,
      observacoes: observacoes.trim() || null,
      status,
      leadId,
      ...clientePayload,
    };
    try {
      const r = item
        ? await fetch(`/api/local/${item.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpo),
          })
        : await fetch("/api/local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpo),
          });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel salvar.");
        return;
      }
      toast.sucesso(item ? "Item atualizado." : "Produto recebido.");
      onSalvo();
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-3">
          <h3 className="text-sm font-semibold text-escuro">
            {item ? "Editar item" : "Receber produto"}
          </h3>
          <button onClick={onFechar} className="rounded-lg p-1 text-medio/60 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scroll-fino flex-1 space-y-3 overflow-y-auto p-5">
          <Campo rotulo="Produto *">
            <input value={descricaoProduto} onChange={(e) => setDescricao(e.target.value)} className="campo w-full" placeholder="Ex.: Climatizador" />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Modelo">
              <input value={modelo} onChange={(e) => setModelo(e.target.value)} className="campo w-full" placeholder="Ex.: SX070" />
            </Campo>
            <Campo rotulo="Categoria">
              <input value={categoria} onChange={(e) => setCategoria(e.target.value)} className="campo w-full" placeholder="Ex.: Climatizadores" />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Numero de serie">
              <input value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} className="campo w-full" />
            </Campo>
            <Campo rotulo="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="campo w-full">
                {STATUS_ORDEM.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].rotulo}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo rotulo="Defeito relatado">
            <textarea value={defeitoRelatado} onChange={(e) => setDefeito(e.target.value)} rows={2} className="campo w-full resize-none" />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Localizacao (onde esta)">
              <input value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} className="campo w-full" placeholder="Ex.: Bancada 2" />
            </Campo>
            <Campo rotulo="Tecnico responsavel">
              <input value={tecnicoResponsavel} onChange={(e) => setTecnico(e.target.value)} className="campo w-full" />
            </Campo>
          </div>

          {/* Cliente (opcional) */}
          <Campo rotulo="Cliente (opcional)">
            {leadId ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-black/10 bg-fundo px-3 py-2 text-sm">
                <span className="flex items-center gap-1.5 text-escuro">
                  <User className="h-3.5 w-3.5 text-tiffany" /> {leadNome ?? "Cliente vinculado"}
                </span>
                <button
                  onClick={() => {
                    setLeadId(null);
                    setLeadNome(null);
                  }}
                  className="text-xs font-medium text-medio/60 hover:text-erro"
                >
                  Remover
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={buscaCliente}
                  onChange={(e) => setBuscaCliente(e.target.value)}
                  className="campo w-full"
                  placeholder="Buscar cliente por nome ou telefone"
                />
                {resultados.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg">
                    {resultados.map((c) => (
                      <button
                        key={c.leadId}
                        onClick={() => {
                          setLeadId(c.leadId);
                          setLeadNome(c.nome);
                          setBuscaCliente("");
                          setResultados([]);
                          void preencherDoLead(c.leadId, c.nome, c.telefone);
                        }}
                        className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-fundo"
                      >
                        <span className="text-sm text-escuro">{c.nome}</span>
                        <span className="text-xs text-medio/50">{c.telefone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Campo>

          {/* Dados do cliente (contato + endereco). Pre-preenchidos a partir do
              lead vinculado; editaveis para quando nao ha lead. */}
          <div className="space-y-3 rounded-lg border border-black/5 bg-fundo/60 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-medio/50">
              <User className="h-3.5 w-3.5" /> Dados do cliente
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Nome do cliente">
                <input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} className="campo w-full" placeholder="Nome completo" />
              </Campo>
              <Campo rotulo="Telefone">
                <input value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} className="campo w-full" placeholder="(00) 00000-0000" />
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Email">
                <input value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)} className="campo w-full" placeholder="email@exemplo.com" />
              </Campo>
              <Campo rotulo="CPF">
                <input value={clienteCpf} onChange={(e) => setClienteCpf(mascararCpf(e.target.value))} className="campo w-full" placeholder="000.000.000-00" />
              </Campo>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Campo rotulo="CEP">
                <div className="relative">
                  <input
                    value={endCep}
                    onChange={(e) => setEndCep(mascararCep(e.target.value))}
                    onBlur={() => void buscarCep(endCep)}
                    className="campo w-full"
                    placeholder="00000-000"
                  />
                  {buscandoCep && (
                    <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-tiffany" />
                  )}
                </div>
              </Campo>
              <div className="col-span-2">
                <Campo rotulo="Logradouro">
                  <input value={endLogradouro} onChange={(e) => setEndLogradouro(e.target.value)} className="campo w-full" />
                </Campo>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Campo rotulo="Numero">
                <input value={endNumero} onChange={(e) => setEndNumero(e.target.value)} className="campo w-full" />
              </Campo>
              <div className="col-span-2">
                <Campo rotulo="Complemento">
                  <input value={endComplemento} onChange={(e) => setEndComplemento(e.target.value)} className="campo w-full" placeholder="Apto, bloco..." />
                </Campo>
              </div>
            </div>
            <Campo rotulo="Bairro">
              <input value={endBairro} onChange={(e) => setEndBairro(e.target.value)} className="campo w-full" />
            </Campo>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Campo rotulo="Cidade">
                  <input value={endCidade} onChange={(e) => setEndCidade(e.target.value)} className="campo w-full" />
                </Campo>
              </div>
              <Campo rotulo="UF">
                <input value={endUf} onChange={(e) => setEndUf(e.target.value.toUpperCase().slice(0, 2))} className="campo w-full" />
              </Campo>
            </div>
          </div>

          <Campo rotulo="Observacoes">
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} className="campo w-full resize-none" />
          </Campo>
        </div>
        <div className="flex justify-end gap-2 border-t border-black/5 px-5 py-3">
          <button onClick={onFechar} className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5">
            Cancelar
          </button>
          <button
            onClick={() => void salvar()}
            disabled={salvando}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-medio/70">{rotulo}</span>
      {children}
    </label>
  );
}
