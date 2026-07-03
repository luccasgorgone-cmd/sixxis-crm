"use client";

// Admin > Assistente de Escrita: liga/desliga a varinha, escolhe o modelo e
// gerencia os TONS (CRUD) usados na reescrita do compositor.
import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Pencil, Trash2, X, Wand2 } from "lucide-react";
import { Cabecalho, SkeletonTabela } from "./VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";

type Config = { modelo: string; ativo: boolean };
type Tom = {
  id: string;
  nome: string;
  instrucao: string;
  ordem: number;
  ativo: boolean;
};

const MODELOS: { id: string; rotulo: string }[] = [
  { id: "claude-haiku-4-5", rotulo: "Haiku (rapido/barato) — recomendado" },
  { id: "claude-sonnet-4-6", rotulo: "Sonnet (equilibrado)" },
  { id: "claude-opus-4-8", rotulo: "Opus (mais capaz)" },
];

type FormTom = { nome: string; instrucao: string; ordem: string; ativo: boolean };

export function AssistenteEscritaAdmin() {
  const toast = useToast();
  const [config, setConfig] = useState<Config | null>(null);
  const [tons, setTons] = useState<Tom[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [editando, setEditando] = useState<Tom | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [rc, rt] = await Promise.all([
        fetch("/api/admin/assistente"),
        fetch("/api/admin/assistente/tons"),
      ]);
      if (!rc.ok || !rt.ok) throw new Error();
      setConfig((await rc.json()).config);
      setTons((await rt.json()).tons ?? []);
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvarConfig(patch: Partial<Config>) {
    if (!config) return;
    const novo = { ...config, ...patch };
    setConfig(novo);
    setSalvandoConfig(true);
    try {
      const r = await fetch("/api/admin/assistente", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (r.ok) {
        setConfig((await r.json()).config);
      } else {
        toast.erro("Nao foi possivel salvar a configuracao.");
        void carregar();
      }
    } catch {
      toast.erro("Falha de conexao.");
      void carregar();
    } finally {
      setSalvandoConfig(false);
    }
  }

  async function excluirTom(id: string) {
    try {
      const r = await fetch(`/api/admin/assistente/tons/${id}`, {
        method: "DELETE",
      });
      if (r.ok) {
        setTons((prev) => prev.filter((t) => t.id !== id));
        toast.sucesso("Tom excluido.");
      } else {
        toast.erro("Nao foi possivel excluir.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    }
  }

  if (carregando) {
    return (
      <div className="p-6">
        <SkeletonTabela />
      </div>
    );
  }
  if (erro || !config) {
    return (
      <div className="p-6">
        <EstadoErro
          mensagem="Nao foi possivel carregar."
          onRetry={() => void carregar()}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Assistente de Escrita"
        subtitulo="A varinha magica que reescreve o texto do atendente no chat"
        acao={
          <button
            onClick={() => setCriando(true)}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro"
          >
            <Plus className="h-4 w-4" /> Novo tom
          </button>
        }
      />

      <div className="max-w-2xl space-y-6">
        {/* Config */}
        <section className="space-y-3 rounded-xl border border-black/5 bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-tiffany" />
              <div>
                <p className="text-sm font-medium text-escuro">
                  Varinha ativa
                </p>
                <p className="text-xs text-medio/60">
                  Mostra a varinha no compositor para todos os atendentes.
                </p>
              </div>
            </div>
            <button
              onClick={() => void salvarConfig({ ativo: !config.ativo })}
              disabled={salvandoConfig}
              role="switch"
              aria-checked={config.ativo}
              aria-label="Varinha ativa"
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                config.ativo ? "bg-tiffany" : "bg-black/15"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  config.ativo ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-escuro">
              Modelo
            </label>
            <select
              value={config.modelo}
              onChange={(e) => void salvarConfig({ modelo: e.target.value })}
              disabled={salvandoConfig}
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany disabled:opacity-60"
            >
              {MODELOS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-medio/50">
              O Haiku e rapido e barato — ideal para reescrita curta.
            </p>
          </div>
        </section>

        {/* Tons */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-escuro">
            Tons de reescrita
          </h3>
          {tons.length === 0 ? (
            <p className="rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-medio/50">
              Nenhum tom cadastrado. Crie o primeiro em &quot;Novo tom&quot;.
            </p>
          ) : (
            <div className="space-y-2">
              {tons.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start gap-3 rounded-xl border border-black/5 bg-white p-3"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-tiffany/10 text-xs font-semibold text-tiffany">
                    {t.ordem}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-escuro">{t.nome}</p>
                      {!t.ativo && (
                        <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-medio/60">
                          Inativo
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-medio/60">
                      {t.instrucao}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setEditando(t)}
                      title="Editar"
                      className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => void excluirTom(t.id)}
                      title="Excluir"
                      className="rounded-lg p-1.5 text-medio/60 hover:bg-erro/10 hover:text-erro"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {(criando || editando) && (
        <ModalTom
          tom={editando}
          proximaOrdem={
            tons.reduce((max, t) => Math.max(max, t.ordem), 0) + 1
          }
          onFechar={() => {
            setCriando(false);
            setEditando(null);
          }}
          onSalvo={(tom) => {
            setTons((prev) => {
              const semEle = prev.filter((t) => t.id !== tom.id);
              return [...semEle, tom].sort((a, b) => a.ordem - b.ordem);
            });
            setCriando(false);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function ModalTom({
  tom,
  proximaOrdem,
  onFechar,
  onSalvo,
}: {
  tom: Tom | null;
  proximaOrdem: number;
  onFechar: () => void;
  onSalvo: (t: Tom) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<FormTom>({
    nome: tom?.nome ?? "",
    instrucao: tom?.instrucao ?? "",
    ordem: String(tom?.ordem ?? proximaOrdem),
    ativo: tom?.ativo ?? true,
  });
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const nome = form.nome.trim();
    const instrucao = form.instrucao.trim();
    if (!nome || !instrucao) {
      toast.erro("Preencha nome e instrucao.");
      return;
    }
    setSalvando(true);
    try {
      const url = tom
        ? `/api/admin/assistente/tons/${tom.id}`
        : "/api/admin/assistente/tons";
      const r = await fetch(url, {
        method: tom ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          instrucao,
          ordem: Number(form.ordem) || 0,
          ativo: form.ativo,
        }),
      });
      if (r.ok) {
        onSalvo((await r.json()).tom as Tom);
        toast.sucesso(tom ? "Tom atualizado." : "Tom criado.");
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
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-escuro">
            {tom ? "Editar tom" : "Novo tom"}
          </h3>
          <button
            onClick={onFechar}
            className="rounded-lg p-1 text-medio/60 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-escuro">
              Nome
            </label>
            <input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex.: Profissional"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-escuro">
              Instrucao
            </label>
            <textarea
              value={form.instrucao}
              onChange={(e) => setForm({ ...form, instrucao: e.target.value })}
              rows={4}
              placeholder="Como a IA deve reescrever o texto neste tom."
              className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="w-24">
              <label className="mb-1 block text-sm font-medium text-escuro">
                Ordem
              </label>
              <input
                type="number"
                min={0}
                value={form.ordem}
                onChange={(e) => setForm({ ...form, ordem: e.target.value })}
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 pt-5 text-sm text-escuro">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="h-4 w-4 accent-tiffany"
              />
              Ativo
            </label>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onFechar}
            className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={() => void salvar()}
            disabled={salvando}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {tom ? "Salvar" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
