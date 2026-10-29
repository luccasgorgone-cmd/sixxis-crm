"use client";

// Painel da CARTEIRA DE LEADS (vendedor). Lista os contatos atribuidos a ele
// (admin ve todos), com filtros (UF, categoria, status, busca), selo "ja tem
// conversa" e as acoes: abrir conversa (escolhendo o numero de saida), marcar
// respondeu/convertido, descartar. Nao envia mensagem — abrir conversa leva ao
// Inbox, onde o vendedor digita a 1a mensagem.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

type Numero = { id: string; nome: string; numero: string | null; provider: string };
type Contato = {
  id: string;
  telefone: string;
  nome: string;
  uf: string | null;
  cidade: string | null;
  bairro: string | null;
  endereco: string | null;
  categoria: string;
  segmento: string | null;
  notaGoogle: number | null;
  numAvaliacoes: number | null;
  score: number | null;
  classe: string | null;
  curvaCidade: string | null;
  emailPublico: string | null;
  perfilObs: string | null;
  status: string;
  dono: { id: string; nome: string } | null;
  jaTemLead: boolean;
  leadExistenteId: string | null;
};
type Resposta = {
  total: number;
  pagina: number;
  porPagina: number;
  resumo: Record<string, number>;
  contatos: Contato[];
};

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR",
  "PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];
const CATEGORIAS = [
  { v: "REVENDA", r: "Revenda" },
  { v: "VAREJO", r: "Varejo" },
  { v: "LOCACAO", r: "Locação" },
  { v: "OUTRO", r: "Outro" },
];
const STATUS = [
  { v: "NOVO", r: "Novo" },
  { v: "EM_ABORDAGEM", r: "Em abordagem" },
  { v: "RESPONDEU", r: "Respondeu" },
  { v: "CONVERTIDO", r: "Convertido" },
  { v: "DESCARTADO", r: "Descartado" },
];
const ROTULO_STATUS: Record<string, string> = Object.fromEntries(STATUS.map((s) => [s.v, s.r]));
const ROTULO_CAT: Record<string, string> = Object.fromEntries(CATEGORIAS.map((c) => [c.v, c.r]));

export function PainelCarteiraLeads({ ehAdmin }: { ehAdmin: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [numeros, setNumeros] = useState<Numero[]>([]);
  const [filtros, setFiltros] = useState({ uf: "", categoria: "", status: "", busca: "", pagina: 1 });
  const [buscaInput, setBuscaInput] = useState("");
  const [ativando, setAtivando] = useState<Contato | null>(null);
  const [numeroEscolhido, setNumeroEscolhido] = useState("");
  const [processando, setProcessando] = useState(false);
  const [vendedores, setVendedores] = useState<{ id: string; nome: string }[]>([]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const sp = new URLSearchParams();
      if (filtros.uf) sp.set("uf", filtros.uf);
      if (filtros.categoria) sp.set("categoria", filtros.categoria);
      if (filtros.status) sp.set("status", filtros.status);
      if (filtros.busca) sp.set("busca", filtros.busca);
      sp.set("pagina", String(filtros.pagina));
      const r = await fetch(`/api/carteira-leads?${sp.toString()}`);
      if (r.ok) setDados(await r.json());
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/carteira-leads/numeros");
      if (r.ok) {
        const d = await r.json();
        setNumeros(d.numeros ?? []);
      }
    })();
  }, []);

  useEffect(() => {
    if (!ehAdmin) return;
    void (async () => {
      const r = await fetch("/api/carteira-leads/metricas");
      if (r.ok) {
        const d = await r.json();
        setVendedores(d.vendedores ?? []);
      }
    })();
  }, [ehAdmin]);

  async function reatribuir(c: Contato, donoId: string) {
    const r = await fetch(`/api/carteira-leads/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ donoId: donoId || null }),
    });
    if (r.ok) {
      toast.sucesso("Vendedor atualizado");
      void carregar();
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Falha ao reatribuir");
    }
  }

  function abrirConversa(c: Contato) {
    if (c.jaTemLead && c.leadExistenteId) {
      router.push(`/inbox?lead=${encodeURIComponent(c.leadExistenteId)}`);
      return;
    }
    setNumeroEscolhido(numeros[0]?.id ?? "");
    setAtivando(c);
  }

  async function confirmarAtivacao() {
    if (!ativando) return;
    setProcessando(true);
    try {
      const r = await fetch("/api/carteira-leads/ativar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contatoId: ativando.id, instanciaId: numeroEscolhido || null }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.leadId) {
        toast.sucesso("Conversa aberta — leve para o Inbox");
        router.push(`/inbox?lead=${encodeURIComponent(d.leadId)}`);
      } else {
        toast.erro(d?.erro ?? "Falha ao abrir conversa");
      }
    } finally {
      setProcessando(false);
      setAtivando(null);
    }
  }

  async function mudarStatus(c: Contato, status: string) {
    let descartadoMotivo: string | undefined;
    if (status === "DESCARTADO") {
      const m = window.prompt("Motivo do descarte (opcional):") ?? "";
      descartadoMotivo = m;
    }
    const r = await fetch(`/api/carteira-leads/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, descartadoMotivo }),
    });
    if (r.ok) {
      toast.sucesso("Atualizado");
      void carregar();
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Falha ao atualizar");
    }
  }

  const resumo = dados?.resumo ?? {};
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1;

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Carteira de Leads</h1>
        {ehAdmin && (
          <a href="/admin/carteira-leads" className="text-sm text-blue-600 hover:underline">
            Painel admin / supervisor →
          </a>
        )}
      </div>

      {/* Resumo por status */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {STATUS.map((s) => (
          <span key={s.v} className="rounded-full bg-neutral-100 px-3 py-1 dark:bg-neutral-800">
            {s.r}: <b>{resumo[s.v] ?? 0}</b>
          </span>
        ))}
        <span className="rounded-full bg-neutral-100 px-3 py-1 dark:bg-neutral-800">
          Total: <b>{dados?.total ?? 0}</b>
        </span>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          className="rounded border px-2 py-1 text-sm dark:bg-neutral-900"
          value={filtros.uf}
          onChange={(e) => setFiltros((f) => ({ ...f, uf: e.target.value, pagina: 1 }))}
        >
          <option value="">UF (todas)</option>
          {UFS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <select
          className="rounded border px-2 py-1 text-sm dark:bg-neutral-900"
          value={filtros.categoria}
          onChange={(e) => setFiltros((f) => ({ ...f, categoria: e.target.value, pagina: 1 }))}
        >
          <option value="">Categoria (todas)</option>
          {CATEGORIAS.map((c) => (
            <option key={c.v} value={c.v}>{c.r}</option>
          ))}
        </select>
        <select
          className="rounded border px-2 py-1 text-sm dark:bg-neutral-900"
          value={filtros.status}
          onChange={(e) => setFiltros((f) => ({ ...f, status: e.target.value, pagina: 1 }))}
        >
          <option value="">Status (todos)</option>
          {STATUS.map((s) => (
            <option key={s.v} value={s.v}>{s.r}</option>
          ))}
        </select>
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            setFiltros((f) => ({ ...f, busca: buscaInput.trim(), pagina: 1 }));
          }}
        >
          <input
            className="rounded border px-2 py-1 text-sm dark:bg-neutral-900"
            placeholder="Buscar nome/cidade/telefone"
            value={buscaInput}
            onChange={(e) => setBuscaInput(e.target.value)}
          />
          <button type="submit" className="rounded bg-neutral-800 px-3 py-1 text-sm text-white">
            Buscar
          </button>
        </form>
      </div>

      {carregando && <p className="text-sm text-neutral-500">Carregando…</p>}
      {!carregando && dados && dados.contatos.length === 0 && (
        <p className="text-sm text-neutral-500">Nenhum contato com esses filtros.</p>
      )}

      <div className="space-y-2">
        {dados?.contatos.map((c) => (
          <div
            key={c.id}
            className="rounded-lg border p-3 text-sm dark:border-neutral-700"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.nome}</span>
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
                    {ROTULO_CAT[c.categoria] ?? c.categoria}
                  </span>
                  {c.classe && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      Classe {c.classe}
                    </span>
                  )}
                  {c.jaTemLead && (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
                      já em conversa
                    </span>
                  )}
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                    {ROTULO_STATUS[c.status] ?? c.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {[c.cidade, c.uf].filter(Boolean).join(" / ")}
                  {c.endereco ? ` · ${c.endereco}` : ""}
                  {" · "}
                  {c.telefone}
                  {c.notaGoogle != null ? ` · ★ ${c.notaGoogle}${c.numAvaliacoes != null ? ` (${c.numAvaliacoes})` : ""}` : ""}
                  {c.score != null ? ` · score ${c.score}` : ""}
                  {ehAdmin && c.dono ? ` · vendedor: ${c.dono.nome}` : ""}
                </div>
                {c.perfilObs && <div className="mt-1 text-xs text-neutral-400">{c.perfilObs}</div>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                <button
                  onClick={() => abrirConversa(c)}
                  className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                >
                  {c.jaTemLead ? "Ir para conversa" : "Abrir conversa"}
                </button>
                {c.status !== "RESPONDEU" && (
                  <button onClick={() => mudarStatus(c, "RESPONDEU")} className="rounded border px-2 py-1 text-xs">
                    Respondeu
                  </button>
                )}
                {c.status !== "CONVERTIDO" && (
                  <button onClick={() => mudarStatus(c, "CONVERTIDO")} className="rounded border px-2 py-1 text-xs">
                    Convertido
                  </button>
                )}
                {c.status !== "DESCARTADO" && (
                  <button onClick={() => mudarStatus(c, "DESCARTADO")} className="rounded border px-2 py-1 text-xs text-red-600">
                    Descartar
                  </button>
                )}
                {ehAdmin && (
                  <select
                    className="rounded border px-1 py-1 text-xs dark:bg-neutral-900"
                    value={c.dono?.id ?? ""}
                    onChange={(e) => void reatribuir(c, e.target.value)}
                    title="Reatribuir vendedor"
                  >
                    <option value="">(sem dono)</option>
                    {vendedores.map((v) => (
                      <option key={v.id} value={v.id}>{v.nome}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Paginacao */}
      {dados && dados.total > dados.porPagina && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            disabled={filtros.pagina <= 1}
            onClick={() => setFiltros((f) => ({ ...f, pagina: f.pagina - 1 }))}
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span>
            Página {dados.pagina} de {totalPaginas}
          </span>
          <button
            disabled={filtros.pagina >= totalPaginas}
            onClick={() => setFiltros((f) => ({ ...f, pagina: f.pagina + 1 }))}
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            Próxima →
          </button>
        </div>
      )}

      {/* Modal: escolher numero para abrir a conversa */}
      {ativando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 dark:bg-neutral-900">
            <h2 className="mb-2 font-semibold">Abrir conversa com {ativando.nome}</h2>
            <p className="mb-3 text-xs text-neutral-500">
              Escolha de qual número iniciar. Isso cria o cliente e o card no seu Kanban/Inbox;
              a 1ª mensagem você envia no Inbox.
            </p>
            <label className="mb-1 block text-xs font-medium">Número de saída</label>
            <select
              className="mb-4 w-full rounded border px-2 py-1 text-sm dark:bg-neutral-800"
              value={numeroEscolhido}
              onChange={(e) => setNumeroEscolhido(e.target.value)}
            >
              {numeros.length === 0 && <option value="">(nenhum número ativo)</option>}
              {numeros.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome}
                  {n.numero ? ` · ${n.numero}` : ""}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAtivando(null)}
                className="rounded border px-3 py-1 text-sm"
                disabled={processando}
              >
                Cancelar
              </button>
              <button
                onClick={() => void confirmarAtivacao()}
                className="rounded bg-green-600 px-4 py-1 text-sm font-medium text-white disabled:opacity-50"
                disabled={processando}
              >
                {processando ? "Abrindo…" : "Abrir conversa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
