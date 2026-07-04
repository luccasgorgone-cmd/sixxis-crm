"use client";

// Admin > Catalogo: produtos (venda) e pecas (pos-venda) selecionaveis nos
// pedidos. CRUD simples com abas por tipo. Preco sugerido pre-preenche o valor
// unitario no fechamento do pedido.
import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Loader2, Boxes } from "lucide-react";
import { Cabecalho } from "./VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { formatarBRL } from "@/lib/format";
import { CATEGORIAS_PRODUTO } from "@/lib/classificar-produto";

// Categorias canonicas da Sol para o catalogo (exclui "Nao classificado" — item
// de catalogo tem categoria real; vazio = sem categoria).
const CATEGORIAS_CATALOGO = CATEGORIAS_PRODUTO.filter(
  (c) => c !== "Nao classificado",
);

type Item = {
  id: string;
  nome: string;
  categoria: string | null;
  modelo: string | null;
  precoSugerido: number | null;
  tipo: "PRODUTO" | "PECA";
  ativo: boolean;
  ordem: number;
};

export function CatalogoAdmin() {
  const toast = useToast();
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [tipo, setTipo] = useState<"PRODUTO" | "PECA">("PRODUTO");
  const [editando, setEditando] = useState<Item | "novo" | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/catalogo");
      if (r.ok) {
        setItens((await r.json()).itens ?? []);
        setErro(false);
      } else setErro(true);
    } catch {
      setErro(true);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function remover(id: string) {
    setItens((prev) => prev.filter((i) => i.id !== id));
    try {
      await fetch(`/api/admin/catalogo/${id}`, { method: "DELETE" });
    } catch {
      toast.erro("Nao foi possivel remover.");
      await carregar();
    }
  }

  const filtrados = itens.filter((i) => i.tipo === tipo);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Cabecalho
        titulo="Catalogo"
        subtitulo="Produtos e pecas selecionaveis nos pedidos (venda e pos-venda)."
        acao={
          <button
            onClick={() => setEditando("novo")}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro"
          >
            <Plus className="h-4 w-4" /> Novo item
          </button>
        }
      />

      <div className="mb-4 flex gap-1">
        {(["PRODUTO", "PECA"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              tipo === t ? "bg-tiffany text-white" : "bg-fundo text-medio hover:bg-black/5"
            }`}
          >
            {t === "PRODUTO" ? "Produtos" : "Pecas"}
          </button>
        ))}
      </div>

      {erro ? (
        <EstadoErro mensagem="Nao foi possivel carregar o catalogo." onRetry={carregar} />
      ) : carregando ? (
        <div className="flex items-center justify-center py-16 text-medio/50">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState icone={Boxes} titulo="Nenhum item" texto="Adicione produtos ou pecas ao catalogo." />
      ) : (
        <div className="space-y-1.5">
          {filtrados.map((i) => (
            <div
              key={i.id}
              className={`flex items-center justify-between gap-3 rounded-lg border border-black/5 bg-white p-3 ${
                i.ativo ? "" : "opacity-60"
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium text-escuro">{i.nome}</p>
                  {i.modelo && (
                    <span className="rounded bg-black/5 px-1.5 py-0.5 text-[11px] font-medium text-medio/70">
                      {i.modelo}
                    </span>
                  )}
                  {i.categoria && (
                    <span className="rounded bg-tiffany/10 px-1.5 py-0.5 text-[11px] font-medium text-tiffany">
                      {i.categoria}
                    </span>
                  )}
                  {!i.ativo && <span className="text-[11px] text-medio/50">inativo</span>}
                </div>
                {i.precoSugerido != null && (
                  <p className="mt-0.5 text-xs text-medio/60">Sugerido: {formatarBRL(i.precoSugerido)}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => setEditando(i)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-medio/60 hover:bg-black/5 hover:text-escuro"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => void remover(i.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-medio/60 hover:bg-black/5 hover:text-erro"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <ModalCatalogo
          item={editando === "novo" ? null : editando}
          tipoPadrao={tipo}
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

function ModalCatalogo({
  item,
  tipoPadrao,
  onFechar,
  onSalvo,
  toast,
}: {
  item: Item | null;
  tipoPadrao: "PRODUTO" | "PECA";
  onFechar: () => void;
  onSalvo: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [nome, setNome] = useState(item?.nome ?? "");
  const [categoria, setCategoria] = useState(item?.categoria ?? "");
  const [modelo, setModelo] = useState(item?.modelo ?? "");
  const [preco, setPreco] = useState(item?.precoSugerido != null ? String(item.precoSugerido) : "");
  const [tipo, setTipo] = useState<"PRODUTO" | "PECA">(item?.tipo ?? tipoPadrao);
  const [ativo, setAtivo] = useState(item?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim()) {
      toast.erro("Informe o nome.");
      return;
    }
    setSalvando(true);
    const corpo = {
      nome: nome.trim(),
      categoria: categoria.trim() || null,
      modelo: modelo.trim() || null,
      precoSugerido: preco.trim() === "" ? null : Number(preco),
      tipo,
      ativo,
    };
    try {
      const r = item
        ? await fetch(`/api/admin/catalogo/${item.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpo),
          })
        : await fetch("/api/admin/catalogo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpo),
          });
      if (!r.ok) {
        toast.erro("Nao foi possivel salvar.");
        return;
      }
      onSalvo();
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in scroll-fino max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-escuro">{item ? "Editar item" : "Novo item"}</h3>
          <button onClick={onFechar} className="rounded-lg p-1 text-medio/60 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-medio/70">Nome *</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="campo w-full" placeholder="Ex.: Climatizador SX070" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-medio/70">Categoria</span>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="campo w-full">
                <option value="">Sem categoria</option>
                {CATEGORIAS_CATALOGO.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {/* Preserva um valor legado fora do conjunto (ate ser reeditado). */}
                {categoria && !CATEGORIAS_CATALOGO.includes(categoria as (typeof CATEGORIAS_CATALOGO)[number]) && (
                  <option value={categoria}>{categoria} (antiga)</option>
                )}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-medio/70">Modelo</span>
              <input value={modelo} onChange={(e) => setModelo(e.target.value)} className="campo w-full" placeholder="Ex.: SX070" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-medio/70">Preco sugerido</span>
              <input value={preco} onChange={(e) => setPreco(e.target.value)} type="number" min="0" step="0.01" className="campo w-full" placeholder="0,00" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-medio/70">Tipo</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as "PRODUTO" | "PECA")} className="campo w-full">
                <option value="PRODUTO">Produto</option>
                <option value="PECA">Peca</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-escuro">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativo
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
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
