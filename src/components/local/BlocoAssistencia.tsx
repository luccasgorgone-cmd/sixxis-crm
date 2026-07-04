"use client";

// Bloco de ASSISTENCIA (Local) na ficha do cliente / painel de negocio. Mostra
// os itens que o cliente tem na assistencia (aba Local), com status e link para
// o item, e permite ADICIONAR o cliente a assistencia sem tira-lo do funil — o
// ItemLocal fica vinculado ao lead (leadId) e os dados vem do proprio lead.
// So aparece para quem tem acesso pos-venda. Sincroniza os dois lados: aqui
// aponta para /local?item=; na aba Local o item aponta para /inbox?lead=.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PackageOpen, Plus, Loader2, ExternalLink, X, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useAgente } from "@/components/shell/AgenteContext";
import { STATUS_META, assistenciaAberta } from "@/lib/assistencia";

type ItemAssistencia = {
  id: string;
  descricaoProduto: string;
  status: string;
  dataEntrada: string;
};

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function BlocoAssistencia({ leadId }: { leadId: string }) {
  const toast = useToast();
  const agente = useAgente();
  const podePosVenda =
    !!agente &&
    (agente.papel === "ADMIN" ||
      agente.papel === "POS_VENDA" ||
      agente.acessoPosVenda);

  const [itens, setItens] = useState<ItemAssistencia[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [adicionando, setAdicionando] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [defeito, setDefeito] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/local?leadId=${leadId}`);
      if (r.ok) {
        const d = await r.json();
        setItens(d.itens ?? []);
      } else {
        setItens([]);
      }
    } catch {
      setItens([]);
    } finally {
      setCarregando(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (podePosVenda) void carregar();
  }, [podePosVenda, carregar]);

  if (!podePosVenda) return null;

  const abertos = (itens ?? []).filter((i) => assistenciaAberta(i.status));

  async function criar() {
    const desc = descricao.trim();
    if (!desc) {
      toast.erro("Informe o produto que ficou na assistencia.");
      return;
    }
    setSalvando(true);
    try {
      // So envia leadId + produto/defeito: o servidor completa contato e
      // endereco a partir do lead vinculado.
      const r = await fetch("/api/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          descricaoProduto: desc,
          defeitoRelatado: defeito.trim() || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel adicionar a assistencia.");
        return;
      }
      toast.sucesso("Cliente adicionado a assistencia (Local).");
      setDescricao("");
      setDefeito("");
      setAdicionando(false);
      await carregar();
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-black/5 bg-white p-4">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
        <PackageOpen className="h-3.5 w-3.5" /> Assistencia (Local)
        {carregando && <Loader2 className="h-3 w-3 animate-spin text-tiffany" />}
      </h4>

      {/* Itens do cliente na assistencia (com link para o item na aba Local) */}
      {itens && itens.length > 0 && (
        <ul className="space-y-1.5">
          {itens.map((it) => {
            const meta = STATUS_META[it.status] ?? STATUS_META.RECEBIDO;
            return (
              <li
                key={it.id}
                className="flex items-center gap-2 rounded-lg border border-black/5 bg-fundo px-2.5 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-escuro">{it.descricaoProduto}</p>
                  <p className="text-[11px] text-medio/50">
                    Entrada {dataCurta(it.dataEntrada)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.classe}`}
                >
                  {meta.rotulo}
                </span>
                <Link
                  href={`/local?item=${it.id}`}
                  title="Ver na aba Local"
                  className="shrink-0 rounded p-1 text-medio/50 transition-colors hover:bg-black/5 hover:text-tiffany"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {itens && itens.length === 0 && !adicionando && (
        <p className="text-xs text-medio/50">
          Este cliente nao tem itens em assistencia.
        </p>
      )}

      {/* Adicionar a assistencia (cliente continua no funil) */}
      {adicionando ? (
        <div className="space-y-2 rounded-lg border border-tiffany/30 bg-tiffany/[0.03] p-3">
          {abertos.length > 0 && (
            <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:bg-amber-500/10">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Este cliente ja tem {abertos.length} item(ns) em andamento na
                assistencia. Voce pode abrir o existente ou criar outro.
              </span>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-medio/70">
              Produto na assistencia *
            </label>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              autoFocus
              placeholder="Ex.: Climatizador SX070"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-medio/70">
              Defeito relatado
            </label>
            <textarea
              value={defeito}
              onChange={(e) => setDefeito(e.target.value)}
              rows={2}
              placeholder="Opcional"
              className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
          </div>
          <p className="text-[11px] text-medio/50">
            Contato e endereco serao preenchidos a partir do cadastro do cliente.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setAdicionando(false);
                setDescricao("");
                setDefeito("");
              }}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-medio hover:bg-black/5"
            >
              <X className="h-3.5 w-3.5" /> Cancelar
            </button>
            <button
              onClick={() => void criar()}
              disabled={salvando || !descricao.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-60"
            >
              {salvando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Adicionar a assistencia
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdicionando(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-tiffany/40 bg-tiffany/5 px-3 py-2 text-sm font-medium text-tiffany transition-colors hover:bg-tiffany/10"
        >
          <Plus className="h-4 w-4" /> Adicionar a assistencia
        </button>
      )}
    </section>
  );
}
