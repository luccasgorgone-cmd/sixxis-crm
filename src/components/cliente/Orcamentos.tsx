"use client";

// Secao "Orcamentos" do cliente (no painel). Lista todos os orcamentos (produto,
// valor BRL, voltagem, data, autor) e permite criar/editar/excluir. O produto
// pode ser escolhido do catalogo da loja (datalist, quando online) ou digitado.
import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  Check,
  X,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatarBRL } from "@/lib/format";

type Orcamento = {
  id: string;
  produto: string;
  valor: number | null;
  voltagem: string | null;
  observacao: string | null;
  negocioId: string | null;
  autor: string | null;
  criadoEm: string;
};

const VOLTAGENS = ["", "110V", "220V", "Bivolt"];

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Orcamentos({
  leadId,
  negocioId,
}: {
  leadId: string;
  negocioId: string;
}) {
  const toast = useToast();
  const [itens, setItens] = useState<Orcamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  // Sugestoes de produto (catalogo da loja, quando online).
  const [produtosLoja, setProdutosLoja] = useState<string[]>([]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/orcamentos`);
      if (r.ok) setItens((await r.json()).orcamentos ?? []);
    } catch {
      // silencioso
    } finally {
      setCarregando(false);
    }
  }, [leadId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Catalogo da loja para sugestoes (best-effort; offline = sem sugestoes).
  useEffect(() => {
    fetch("/api/loja/produtos")
      .then((r) => (r.ok ? r.json() : { produtos: [] }))
      .then((d) =>
        setProdutosLoja(
          (d.produtos ?? [])
            .map((p: { nome?: string }) => p.nome)
            .filter((n: unknown): n is string => typeof n === "string"),
        ),
      )
      .catch(() => undefined);
  }, []);

  async function remover(id: string) {
    const r = await fetch(`/api/orcamentos/${id}`, { method: "DELETE" });
    if (r.ok) {
      toast.sucesso("Orcamento removido.");
      await carregar();
    } else {
      toast.erro("Nao foi possivel remover.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
          <FileText className="h-3.5 w-3.5" /> Orcamentos
        </h4>
        {!criando && (
          <button
            onClick={() => {
              setCriando(true);
              setEditando(null);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-tiffany-escuro"
          >
            <Plus className="h-3.5 w-3.5" /> Novo orcamento
          </button>
        )}
      </div>

      {criando && (
        <FormOrcamento
          produtosLoja={produtosLoja}
          onCancelar={() => setCriando(false)}
          onSalvar={async (dados) => {
            const r = await fetch(`/api/leads/${leadId}/orcamentos`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...dados, negocioId }),
            });
            if (r.ok) {
              toast.sucesso("Orcamento criado.");
              setCriando(false);
              await carregar();
            } else {
              const d = await r.json().catch(() => null);
              toast.erro(d?.erro ?? "Nao foi possivel salvar.");
            }
          }}
        />
      )}

      {carregando ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : itens.length === 0 && !criando ? (
        <EmptyState
          icone={FileText}
          titulo="Nenhum orcamento"
          texto="Crie o primeiro orcamento deste cliente."
          className="py-8"
        />
      ) : (
        <ul className="space-y-2">
          {itens.map((o) =>
            editando === o.id ? (
              <li key={o.id}>
                <FormOrcamento
                  inicial={o}
                  produtosLoja={produtosLoja}
                  onCancelar={() => setEditando(null)}
                  onSalvar={async (dados) => {
                    const r = await fetch(`/api/orcamentos/${o.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(dados),
                    });
                    if (r.ok) {
                      toast.sucesso("Orcamento atualizado.");
                      setEditando(null);
                      await carregar();
                    } else {
                      toast.erro("Nao foi possivel salvar.");
                    }
                  }}
                />
              </li>
            ) : (
              <li
                key={o.id}
                className="rounded-xl border border-black/5 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-escuro">
                      {o.produto}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-medio/60">
                      {o.valor != null && (
                        <span className="font-semibold text-tiffany-escuro">
                          {formatarBRL(o.valor)}
                        </span>
                      )}
                      {o.voltagem && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-black/5 px-1.5 py-0.5 font-medium text-medio/70">
                          <Zap className="h-3 w-3" /> {o.voltagem}
                        </span>
                      )}
                      <span>{dataHora(o.criadoEm)}</span>
                      {o.autor && <span>· {o.autor}</span>}
                    </div>
                    {o.observacao && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-medio/70">
                        {o.observacao}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={() => {
                        setEditando(o.id);
                        setCriando(false);
                      }}
                      aria-label="Editar orcamento"
                      className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => void remover(o.id)}
                      aria-label="Excluir orcamento"
                      className="rounded-lg p-1.5 text-medio/50 hover:bg-black/5 hover:text-erro"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function FormOrcamento({
  inicial,
  produtosLoja,
  onSalvar,
  onCancelar,
}: {
  inicial?: Orcamento;
  produtosLoja: string[];
  onSalvar: (dados: {
    produto: string;
    valor: string;
    voltagem: string;
    observacao: string;
  }) => Promise<void>;
  onCancelar: () => void;
}) {
  const [produto, setProduto] = useState(inicial?.produto ?? "");
  const [valor, setValor] = useState(
    inicial?.valor != null ? String(inicial.valor) : "",
  );
  const [voltagem, setVoltagem] = useState(inicial?.voltagem ?? "");
  const [observacao, setObservacao] = useState(inicial?.observacao ?? "");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!produto.trim()) return;
    setSalvando(true);
    await onSalvar({ produto: produto.trim(), valor, voltagem, observacao });
    setSalvando(false);
  }

  return (
    <div className="space-y-2 rounded-xl border border-tiffany/30 bg-tiffany/5 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-medio/70">
          Produto
        </label>
        <input
          value={produto}
          onChange={(e) => setProduto(e.target.value)}
          list="orc-produtos-loja"
          autoFocus
          placeholder="Selecione ou digite o produto"
          className="campo w-full"
        />
        <datalist id="orc-produtos-loja">
          {produtosLoja.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-medio/70">
            Valor (R$)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
            className="campo w-full"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-medio/70">
            Voltagem (opcional)
          </label>
          <select
            value={voltagem}
            onChange={(e) => setVoltagem(e.target.value)}
            className="campo w-full"
          >
            {VOLTAGENS.map((v) => (
              <option key={v} value={v}>
                {v === "" ? "Nao aplica" : v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-medio/70">
          Observacao
        </label>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          placeholder="Detalhes do orcamento (opcional)"
          className="campo scroll-fino w-full resize-none"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancelar}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-medio hover:bg-black/5"
        >
          <X className="h-3.5 w-3.5" /> Cancelar
        </button>
        <button
          onClick={() => void salvar()}
          disabled={salvando || !produto.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-xs font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-50"
        >
          {salvando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Salvar
        </button>
      </div>
    </div>
  );
}
