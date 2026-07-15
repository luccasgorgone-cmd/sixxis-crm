"use client";

// Produtos de INTERESSE do cliente (multi-selecao dos pre-definidos ativos).
// Distinto do produto comprado/orcamento. Salva em LeadProdutoInteresse via PUT
// (substitui o conjunto) e registra auditoria no backend.
import { useEffect, useState, useCallback } from "react";
import { Boxes, Plus, X, Check, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

type Produto = { id: string; nome: string; ativo?: boolean };

export function BlocoProdutosInteresse({
  leadId,
  onAtualizado,
}: {
  leadId: string;
  onAtualizado?: () => void;
}) {
  const toast = useToast();
  const [ativos, setAtivos] = useState<Produto[]>([]);
  const [selecionados, setSelecionados] = useState<Produto[]>([]);
  const [abrir, setAbrir] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const [ra, rs] = await Promise.all([
      fetch("/api/produtos-interesse").then((r) => (r.ok ? r.json() : { produtos: [] })),
      fetch(`/api/leads/${leadId}/produtos-interesse`).then((r) =>
        r.ok ? r.json() : { produtos: [] },
      ),
    ]);
    setAtivos(ra.produtos ?? []);
    setSelecionados(rs.produtos ?? []);
  }, [leadId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar(novos: Produto[]) {
    setSalvando(true);
    const r = await fetch(`/api/leads/${leadId}/produtos-interesse`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ produtoIds: novos.map((p) => p.id) }),
    });
    setSalvando(false);
    if (!r.ok) {
      toast.erro("Nao foi possivel salvar os produtos de interesse.");
      await carregar();
      return;
    }
    onAtualizado?.();
  }

  function alternar(p: Produto) {
    const existe = selecionados.some((s) => s.id === p.id);
    const novos = existe
      ? selecionados.filter((s) => s.id !== p.id)
      : [...selecionados, p];
    setSelecionados(novos);
    void salvar(novos);
  }

  // Lista para o dropdown: ativos + os selecionados (mesmo que tenham sido
  // desativados depois, para permitir removê-los).
  const porId = new Map<string, Produto>();
  for (const p of ativos) porId.set(p.id, p);
  for (const p of selecionados) if (!porId.has(p.id)) porId.set(p.id, p);
  const opcoes = [...porId.values()];

  // Modelos ANTIGOS (nome termina em "(A)", semeados na Fatia H) vao AGRUPADOS
  // e DEPOIS dos novos, preservando a ordem interna de cada grupo (Fatia S).
  const ehAntigo = (p: Produto) => p.nome.trimEnd().endsWith("(A)");
  const opcoesNovas = opcoes.filter((p) => !ehAntigo(p));
  const opcoesAntigas = opcoes.filter(ehAntigo);

  function renderOpcao(p: Produto) {
    const marcado = selecionados.some((s) => s.id === p.id);
    return (
      <button
        key={p.id}
        onClick={() => alternar(p)}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-escuro hover:bg-black/5"
      >
        <span className="truncate">{p.nome}</span>
        {marcado && <Check className="h-3.5 w-3.5 shrink-0 text-tiffany" />}
      </button>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <Boxes className="h-3.5 w-3.5 text-medio/50" />
        <label className="text-xs font-medium text-medio/70">
          Produtos de interesse
        </label>
        {salvando && <Loader2 className="h-3 w-3 animate-spin text-medio/40" />}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {selecionados.length === 0 && (
          <span className="text-xs text-medio/50">Nenhum produto marcado.</span>
        )}
        {selecionados.map((p) => (
          <span
            key={p.id}
            className="flex items-center gap-1 rounded-full bg-tiffany/10 px-2 py-0.5 text-xs font-medium text-tiffany"
          >
            {p.nome}
            <button
              onClick={() => alternar(p)}
              aria-label={`Remover ${p.nome}`}
              className="rounded-full hover:bg-tiffany/20"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <div className="relative">
          <button
            onClick={() => setAbrir((v) => !v)}
            className="flex items-center gap-1 rounded-full border border-black/10 px-2 py-0.5 text-xs font-medium text-medio hover:bg-black/5"
          >
            <Plus className="h-3 w-3" /> Adicionar
          </button>
          {abrir && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setAbrir(false)} />
              <div className="scroll-fino absolute left-0 z-40 mt-1 max-h-64 w-56 overflow-y-auto rounded-xl border border-black/10 bg-white py-1 shadow-lg">
                {opcoes.length === 0 ? (
                  <p className="p-3 text-center text-xs text-medio/50">
                    Nenhum produto cadastrado.
                  </p>
                ) : (
                  <>
                    {opcoesNovas.map(renderOpcao)}
                    {opcoesAntigas.length > 0 && (
                      <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-medio/50">
                        Modelos antigos
                      </div>
                    )}
                    {opcoesAntigas.map(renderOpcao)}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
