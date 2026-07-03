"use client";

// Aba Parceiros: mapa do Brasil pintado pela quantidade de parceiros por estado
// (reusa MapaBrasil + escala do mapa de clientes), filtros combinaveis, lista em
// cards, CRUD (cadastro/edicao/desativacao) e campo de frete. Parceiros sao uma
// entidade PROPRIA (isolada de leads/negocios/metricas). DDD infere UF/regiao.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wrench,
  Plus,
  Search,
  MapPin,
  Phone,
  Truck,
  Pencil,
  Power,
  X,
  Loader2,
  Info,
} from "lucide-react";
import { MapaBrasil } from "@/components/inteligencia/MapaBrasil";
import { LegendaGradiente } from "@/components/ui/LegendaGradiente";
import {
  ESCALA_DENSIDADE,
  COR_SEM_DADO,
  corEscala,
  gradienteCss,
} from "@/components/inteligencia/tipos";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";
import { ufPorTelefone, infoPorUF } from "@/lib/ddd";
import { formatarBRL, formatarTelefone } from "@/lib/format";

type Parceiro = {
  id: string;
  nome: string;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  regiao: string | null;
  email: string | null;
  especialidade: string | null;
  observacoes: string | null;
  fretePadrao: number | null;
  freteObs: string | null;
  ativo: boolean;
};

type Filtros = {
  q: string;
  uf: string;
  regiao: string;
  especialidade: string;
  ativo: string; // "" todos | "1" ativos | "0" inativos
};

const REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];
const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];
const VAZIO: Filtros = { q: "", uf: "", regiao: "", especialidade: "", ativo: "1" };

function qs(f: Filtros): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.uf) p.set("uf", f.uf);
  if (f.regiao) p.set("regiao", f.regiao);
  if (f.especialidade.trim()) p.set("especialidade", f.especialidade.trim());
  if (f.ativo) p.set("ativo", f.ativo);
  return p.toString();
}

export function Parceiros({ papel }: { papel: string }) {
  const toast = useToast();
  const [filtros, setFiltros] = useState<Filtros>(VAZIO);
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [estados, setEstados] = useState<{ uf: string; total: number }[]>([]);
  const [maxEstado, setMaxEstado] = useState(0);
  const [podeGerenciar, setPodeGerenciar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [ufAtivo, setUfAtivo] = useState<string | null>(null);
  const [editando, setEditando] = useState<Parceiro | "novo" | null>(null);

  const carregar = useCallback(async (f: Filtros) => {
    setCarregando(true);
    setErro(false);
    try {
      const [rl, re] = await Promise.all([
        fetch(`/api/parceiros?${qs(f)}`),
        fetch(`/api/parceiros/estados?${qs(f)}`),
      ]);
      if (!rl.ok) throw new Error();
      const dl = await rl.json();
      setParceiros(dl.parceiros ?? []);
      setPodeGerenciar(Boolean(dl.podeGerenciar));
      if (re.ok) {
        const de = await re.json();
        setEstados(de.estados ?? []);
        setMaxEstado(de.max ?? 0);
      }
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar(filtros);
  }, [carregar, filtros]);

  const recarregar = () => void carregar(filtros);

  const totalPorUF = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of estados) m.set(e.uf, e.total);
    return m;
  }, [estados]);

  const corPorUF = useCallback(
    (uf: string) => {
      const total = totalPorUF.get(uf) ?? 0;
      if (total <= 0 || maxEstado === 0) return COR_SEM_DADO;
      return corEscala(total / maxEstado, ESCALA_DENSIDADE);
    },
    [totalPorUF, maxEstado],
  );

  const tooltip = useCallback(
    (uf: string) => {
      const total = totalPorUF.get(uf) ?? 0;
      const info = infoPorUF(uf);
      return (
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-escuro">
            {info?.estado ?? uf} <span className="text-medio/60">({uf})</span>
          </p>
          <p className="text-medio/70">
            {total} {total === 1 ? "parceiro" : "parceiros"}
          </p>
          {total > 0 && (
            <p className="text-[11px] text-medio/50">Clique para ver a lista.</p>
          )}
        </div>
      );
    },
    [totalPorUF],
  );

  const parceirosDoUf = useMemo(
    () => (ufAtivo ? parceiros.filter((p) => p.uf === ufAtivo) : []),
    [ufAtivo, parceiros],
  );

  return (
    <div className="space-y-4 p-6">
      {/* Cabecalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tiffany/10 text-tiffany">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-escuro">Parceiros</h2>
            <p className="text-sm text-medio/60">
              Tecnicos parceiros pelo Brasil — pos-venda, envio e recebimento
            </p>
          </div>
        </div>
        {podeGerenciar && (
          <button
            onClick={() => setEditando("novo")}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro"
          >
            <Plus className="h-4 w-4" /> Adicionar parceiro
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-medio/40" />
          <input
            value={filtros.q}
            onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
            placeholder="Buscar nome ou cidade"
            className="campo w-52 pl-8"
          />
        </div>
        <select
          value={filtros.uf}
          onChange={(e) => setFiltros((f) => ({ ...f, uf: e.target.value }))}
          className="campo"
        >
          <option value="">Estado: todos</option>
          {UFS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <select
          value={filtros.regiao}
          onChange={(e) => setFiltros((f) => ({ ...f, regiao: e.target.value }))}
          className="campo"
        >
          <option value="">Regiao: todas</option>
          {REGIOES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          value={filtros.especialidade}
          onChange={(e) => setFiltros((f) => ({ ...f, especialidade: e.target.value }))}
          placeholder="Especialidade"
          className="campo w-40"
        />
        <select
          value={filtros.ativo}
          onChange={(e) => setFiltros((f) => ({ ...f, ativo: e.target.value }))}
          className="campo"
        >
          <option value="1">Ativos</option>
          <option value="0">Inativos</option>
          <option value="">Todos</option>
        </select>
        {(filtros.q || filtros.uf || filtros.regiao || filtros.especialidade || filtros.ativo !== "1") && (
          <button
            onClick={() => setFiltros(VAZIO)}
            className="rounded-md px-2 py-1 text-xs font-medium text-medio/70 transition-colors hover:bg-black/5 hover:text-escuro"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {erro ? (
        <EstadoErro mensagem="Nao foi possivel carregar os parceiros." onRetry={recarregar} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Mapa */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-black/5 bg-white p-4">
              <p className="mb-3 text-sm font-semibold text-escuro">
                Parceiros por estado
              </p>
              {carregando && parceiros.length === 0 ? (
                <div className="skeleton h-[360px] w-full rounded-xl" />
              ) : (
                <MapaBrasil
                  cor={corPorUF}
                  tooltip={tooltip}
                  ufAtivo={ufAtivo}
                  onHoverUF={setUfAtivo}
                  onClickUF={(uf) => setUfAtivo(uf)}
                />
              )}
              <LegendaGradiente
                rotulo="Parceiros por estado"
                gradiente={gradienteCss(ESCALA_DENSIDADE)}
                min="0"
                max={String(maxEstado || 0)}
                icone={<Wrench className="h-3.5 w-3.5" />}
              />
              <p className="mt-2 text-center text-[11px] text-medio/50">
                Clique num estado para ver os parceiros daquela regiao.
              </p>
            </div>
          </div>

          {/* Lista */}
          <div className="rounded-xl border border-black/5 bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-escuro">
                Lista de parceiros
              </p>
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold text-medio/70">
                {parceiros.length}
              </span>
            </div>
            <div className="scroll-fino max-h-[440px] space-y-2 overflow-y-auto pr-0.5">
              {carregando && parceiros.length === 0 ? (
                <ListaSkeleton />
              ) : parceiros.length === 0 ? (
                <Vazio podeGerenciar={podeGerenciar} onNovo={() => setEditando("novo")} />
              ) : (
                parceiros.map((p) => (
                  <CardParceiro
                    key={p.id}
                    p={p}
                    podeGerenciar={podeGerenciar}
                    onEditar={() => setEditando(p)}
                    onRecarregar={recarregar}
                    toast={toast}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Drawer do estado */}
      {ufAtivo && (
        <DrawerEstado
          uf={ufAtivo}
          parceiros={parceirosDoUf}
          podeGerenciar={podeGerenciar}
          onEditar={(p) => setEditando(p)}
          onRecarregar={recarregar}
          onFechar={() => setUfAtivo(null)}
          toast={toast}
        />
      )}

      {/* Formulario (novo/editar) */}
      {editando && (
        <FormParceiro
          parceiro={editando === "novo" ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            recarregar();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ---- Card de parceiro ----
function CardParceiro({
  p,
  podeGerenciar,
  onEditar,
  onRecarregar,
  toast,
}: {
  p: Parceiro;
  podeGerenciar: boolean;
  onEditar: () => void;
  onRecarregar: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [ocupado, setOcupado] = useState(false);

  async function alternarAtivo() {
    setOcupado(true);
    try {
      if (p.ativo) {
        const r = await fetch(`/api/parceiros/${p.id}`, { method: "DELETE" });
        if (r.ok) {
          toast.sucesso("Parceiro desativado.");
          onRecarregar();
        } else toast.erro("Nao foi possivel desativar.");
      } else {
        const r = await fetch(`/api/parceiros/${p.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ativo: true }),
        });
        if (r.ok) {
          toast.sucesso("Parceiro reativado.");
          onRecarregar();
        } else toast.erro("Nao foi possivel reativar.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div
      className={`rounded-lg border p-3 ${
        p.ativo ? "border-black/5 bg-white" : "border-dashed border-black/15 bg-black/[0.02]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-escuro">
            {p.nome}
            {!p.ativo && (
              <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-medium text-medio/60">
                inativo
              </span>
            )}
          </p>
          {(p.cidade || p.uf) && (
            <p className="flex items-center gap-1 truncate text-xs text-medio/70">
              <MapPin className="h-3 w-3 shrink-0 text-medio/40" />
              {[p.cidade, p.uf].filter(Boolean).join("/")}
              {p.regiao ? ` · ${p.regiao}` : ""}
            </p>
          )}
        </div>
        {podeGerenciar && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={onEditar}
              title="Editar"
              className="rounded-md p-1.5 text-medio/60 transition-colors hover:bg-black/5 hover:text-escuro"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => void alternarAtivo()}
              disabled={ocupado}
              title={p.ativo ? "Desativar" : "Reativar"}
              className={`rounded-md p-1.5 transition-colors hover:bg-black/5 ${
                p.ativo ? "text-medio/60 hover:text-erro" : "text-tiffany"
              }`}
            >
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-medio/70">
        {p.telefone && (
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3 text-medio/40" />
            {formatarTelefone(p.telefone)}
          </span>
        )}
        {p.especialidade && (
          <span className="rounded-full bg-tiffany/10 px-2 py-0.5 text-[11px] font-medium text-tiffany">
            {p.especialidade}
          </span>
        )}
      </div>
      {(p.fretePadrao != null || p.freteObs) && (
        <p className="mt-1.5 flex items-start gap-1 text-xs text-medio/70">
          <Truck className="mt-0.5 h-3 w-3 shrink-0 text-medio/40" />
          <span>
            {p.fretePadrao != null && (
              <strong className="text-escuro">{formatarBRL(p.fretePadrao)}</strong>
            )}
            {p.fretePadrao != null && p.freteObs ? " · " : ""}
            {p.freteObs}
          </span>
        </p>
      )}
      {p.observacoes && (
        <p className="mt-1 line-clamp-2 text-xs text-medio/50">{p.observacoes}</p>
      )}
    </div>
  );
}

// ---- Drawer com os parceiros de um estado ----
function DrawerEstado({
  uf,
  parceiros,
  podeGerenciar,
  onEditar,
  onRecarregar,
  onFechar,
  toast,
}: {
  uf: string;
  parceiros: Parceiro[];
  podeGerenciar: boolean;
  onEditar: (p: Parceiro) => void;
  onRecarregar: () => void;
  onFechar: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const info = infoPorUF(uf);
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="fade-in absolute inset-0 bg-black/30" onClick={onFechar} />
      <aside className="drawer-in relative flex h-full w-full max-w-md flex-col bg-fundo shadow-xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-black/5 bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-escuro">
              {info?.estado ?? uf} ({uf})
            </p>
            <p className="text-xs text-medio/60">
              {parceiros.length} {parceiros.length === 1 ? "parceiro" : "parceiros"}
            </p>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-medio/60 transition-colors hover:bg-black/5 hover:text-escuro"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="scroll-fino flex-1 space-y-2 overflow-y-auto p-3">
          {parceiros.length === 0 ? (
            <p className="py-10 text-center text-sm text-medio/50">
              Nenhum parceiro neste estado (com os filtros atuais).
            </p>
          ) : (
            parceiros.map((p) => (
              <CardParceiro
                key={p.id}
                p={p}
                podeGerenciar={podeGerenciar}
                onEditar={() => onEditar(p)}
                onRecarregar={onRecarregar}
                toast={toast}
              />
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

// ---- Formulario de cadastro/edicao ----
function FormParceiro({
  parceiro,
  onFechar,
  onSalvo,
  toast,
}: {
  parceiro: Parceiro | null;
  onFechar: () => void;
  onSalvo: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [nome, setNome] = useState(parceiro?.nome ?? "");
  const [telefone, setTelefone] = useState(parceiro?.telefone ?? "");
  const [cidade, setCidade] = useState(parceiro?.cidade ?? "");
  const [uf, setUf] = useState(parceiro?.uf ?? "");
  const [especialidade, setEspecialidade] = useState(parceiro?.especialidade ?? "");
  const [email, setEmail] = useState(parceiro?.email ?? "");
  const [fretePadrao, setFretePadrao] = useState(
    parceiro?.fretePadrao != null ? String(parceiro.fretePadrao) : "",
  );
  const [freteObs, setFreteObs] = useState(parceiro?.freteObs ?? "");
  const [observacoes, setObservacoes] = useState(parceiro?.observacoes ?? "");
  const [salvando, setSalvando] = useState(false);

  // Sugestao pelo DDD: UF/regiao inferidas do telefone (nao sobrescreve UF manual).
  const sugestao = useMemo(() => {
    const u = ufPorTelefone(telefone);
    return u ? { uf: u, regiao: infoPorUF(u)?.regiao ?? null } : null;
  }, [telefone]);
  // UF efetiva: manual tem prioridade; senao a sugestao do DDD.
  const ufEfetiva = (uf || sugestao?.uf || "").toUpperCase();
  const regiaoEfetiva = ufEfetiva ? infoPorUF(ufEfetiva)?.regiao ?? null : null;

  async function salvar() {
    if (!nome.trim()) {
      toast.erro("Informe o nome.");
      return;
    }
    setSalvando(true);
    try {
      const corpo = {
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        cidade: cidade.trim() || null,
        // Envia a UF efetiva (manual ou a do DDD) — o backend recalcula a regiao.
        uf: ufEfetiva || null,
        especialidade: especialidade.trim() || null,
        email: email.trim() || null,
        fretePadrao: fretePadrao.trim() === "" ? null : Number(fretePadrao),
        freteObs: freteObs.trim() || null,
        observacoes: observacoes.trim() || null,
      };
      const url = parceiro ? `/api/parceiros/${parceiro.id}` : "/api/parceiros";
      const r = await fetch(url, {
        method: parceiro ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (r.ok) {
        toast.sucesso(parceiro ? "Parceiro atualizado." : "Parceiro cadastrado.");
        onSalvo();
      } else {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel salvar.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-black/5 px-5 py-3">
          <h3 className="text-sm font-semibold text-escuro">
            {parceiro ? "Editar parceiro" : "Adicionar parceiro"}
          </h3>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="scroll-fino flex-1 space-y-3 overflow-y-auto p-5">
          <Campo rotulo="Nome *">
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="campo w-full" placeholder="Nome do parceiro" />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Telefone (DDD)">
              <input value={telefone} onChange={(e) => setTelefone(e.target.value)} className="campo w-full" placeholder="(11) 99999-9999" />
            </Campo>
            <Campo rotulo="Especialidade">
              <input value={especialidade} onChange={(e) => setEspecialidade(e.target.value)} className="campo w-full" placeholder="Ex.: refrigeracao" />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Cidade">
              <input value={cidade} onChange={(e) => setCidade(e.target.value)} className="campo w-full" placeholder="Cidade" />
            </Campo>
            <Campo rotulo="Estado (UF)">
              <select value={uf} onChange={(e) => setUf(e.target.value)} className="campo w-full">
                <option value="">{sugestao ? `Auto (${sugestao.uf})` : "Selecione"}</option>
                {UFS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          {ufEfetiva && (
            <p className="flex items-center gap-1.5 text-xs text-medio/60">
              <Info className="h-3 w-3 shrink-0 text-tiffany" />
              Regiao: <strong className="text-escuro">{regiaoEfetiva ?? "—"}</strong>
              {!uf && sugestao ? " (sugerida pelo DDD; ajuste a UF se precisar)" : ""}
            </p>
          )}
          <Campo rotulo="E-mail">
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="campo w-full" placeholder="email@exemplo.com" />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Frete padrao (R$)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={fretePadrao}
                onChange={(e) => setFretePadrao(e.target.value)}
                className="campo w-full"
                placeholder="0,00"
              />
            </Campo>
            <Campo rotulo="Condicoes de frete">
              <input value={freteObs} onChange={(e) => setFreteObs(e.target.value)} className="campo w-full" placeholder="Prazo, transportadora..." />
            </Campo>
          </div>
          <Campo rotulo="Observacoes">
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
              placeholder="Notas sobre o parceiro"
            />
          </Campo>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-black/5 px-5 py-3">
          <button onClick={onFechar} className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5">
            Cancelar
          </button>
          <button
            onClick={() => void salvar()}
            disabled={salvando}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {parceiro ? "Salvar" : "Adicionar"}
          </button>
        </footer>
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

function Vazio({ podeGerenciar, onNovo }: { podeGerenciar: boolean; onNovo: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Wrench className="h-8 w-8 text-medio/30" />
      <p className="text-sm font-medium text-escuro">Nenhum parceiro ainda</p>
      <p className="max-w-xs text-xs text-medio/60">
        Nenhum parceiro cadastrado (ou nenhum bate com os filtros). Adicione o primeiro.
      </p>
      {podeGerenciar && (
        <button
          onClick={onNovo}
          className="mt-1 flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro"
        >
          <Plus className="h-4 w-4" /> Adicionar parceiro
        </button>
      )}
    </div>
  );
}

function ListaSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-black/5 bg-white p-3">
          <div className="skeleton mb-2 h-4 w-32" />
          <div className="skeleton h-3 w-40" />
        </div>
      ))}
    </div>
  );
}
