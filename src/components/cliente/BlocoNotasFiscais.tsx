"use client";

// Notas fiscais do CLIENTE (Fatia D). Nivel lead -> visivel em VENDA e POS-VENDA.
// Lista as NFs (numero + data + PED vinculado), permite adicionar (numero + data
// + orcamento opcional do lead) e excluir. O campo legado Lead.notaFiscal, quando
// existir, aparece como item somente-leitura "NF (registro antigo)". Padrao da
// casa: dark, tiffany, Lucide monocromatico, sem emoji, classe .campo.
import { useCallback, useEffect, useState } from "react";
import { FileText, Plus, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

type NotaFiscalItem = {
  id: string;
  numero: string;
  dataNF: string;
  orcamentoId: string | null;
  orcamentoNumero: string | null;
  criadoEm: string;
};

type OrcamentoOpcao = { id: string; numeroFormatado: string };

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function BlocoNotasFiscais({
  leadId,
  negocioId,
  notaFiscalLegado,
}: {
  leadId: string;
  negocioId?: string | null;
  notaFiscalLegado?: string | null;
}) {
  const toast = useToast();
  const [notas, setNotas] = useState<NotaFiscalItem[] | null>(null);
  const [orcs, setOrcs] = useState<OrcamentoOpcao[]>([]);
  const [numero, setNumero] = useState("");
  const [data, setData] = useState("");
  const [orcamentoId, setOrcamentoId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/leads/${leadId}/notas-fiscais`);
      const d = r.ok ? await r.json() : { notas: [] };
      setNotas(d.notas ?? []);
    } catch {
      setNotas([]);
    }
  }, [leadId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Orcamentos do lead (para o select opcional). Somente id + numero.
  useEffect(() => {
    let vivo = true;
    fetch(`/api/leads/${leadId}/orcamentos`)
      .then((r) => (r.ok ? r.json() : { orcamentos: [] }))
      .then((d) => {
        if (vivo) {
          setOrcs(
            (d.orcamentos ?? []).map(
              (o: { id: string; numeroFormatado: string }) => ({
                id: o.id,
                numeroFormatado: o.numeroFormatado,
              }),
            ),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [leadId]);

  async function adicionar() {
    if (!numero.trim()) {
      toast.erro("Informe o numero da NF.");
      return;
    }
    if (!data) {
      toast.erro("Informe a data da NF.");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/notas-fiscais`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: numero.trim(),
          dataNF: data,
          orcamentoId: orcamentoId || null,
          negocioId: negocioId ?? null,
        }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        toast.erro(d?.erro ?? "Nao foi possivel salvar a nota fiscal.");
        return;
      }
      setNumero("");
      setData("");
      setOrcamentoId("");
      await carregar();
      toast.sucesso("Nota fiscal registrada.");
    } catch {
      toast.erro("Falha de conexao ao salvar a NF.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(nfId: string) {
    setExcluindo(nfId);
    try {
      const r = await fetch(`/api/leads/${leadId}/notas-fiscais/${nfId}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        toast.erro("Nao foi possivel excluir a NF.");
        return;
      }
      await carregar();
    } catch {
      toast.erro("Falha de conexao ao excluir.");
    } finally {
      setExcluindo(null);
    }
  }

  const temLegado = !!notaFiscalLegado?.trim();

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-medio/50">
        <FileText className="h-3.5 w-3.5" /> Notas fiscais
      </p>

      {/* Legado (Lead.notaFiscal): somente leitura. */}
      {temLegado && (
        <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-black/5 bg-fundo px-2.5 py-1.5 text-[11px]">
          <span className="shrink-0 rounded bg-black/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-medio/50">
            NF (registro antigo)
          </span>
          <span className="min-w-0 flex-1 truncate text-medio/80">{notaFiscalLegado}</span>
        </div>
      )}

      {/* Lista de NFs estruturadas. */}
      {notas === null ? (
        <div className="flex justify-center py-3 text-medio/40">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : notas.length === 0 && !temLegado ? (
        <p className="py-1 text-[11px] text-medio/50">Nenhuma nota fiscal registrada.</p>
      ) : (
        <ul className="space-y-1.5">
          {notas.map((n) => (
            <li
              key={n.id}
              className="flex items-center gap-2 rounded-lg border border-black/5 bg-fundo px-2.5 py-1.5 text-[11px]"
            >
              <span className="shrink-0 font-mono font-semibold text-escuro">{n.numero}</span>
              <span className="shrink-0 text-medio/60">{dataBR(n.dataNF)}</span>
              {n.orcamentoNumero && (
                <span className="shrink-0 rounded bg-tiffany/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-tiffany">
                  {n.orcamentoNumero}
                </span>
              )}
              <button
                onClick={() => void excluir(n.id)}
                disabled={excluindo === n.id}
                title="Excluir NF"
                className="ml-auto shrink-0 rounded p-1 text-medio/50 transition-colors hover:bg-black/5 hover:text-erro disabled:opacity-50"
              >
                {excluindo === n.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Form de adicionar: numero + data + orcamento (opcional). */}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-28 flex-1">
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="Numero da NF"
            className="campo w-full text-sm"
          />
        </div>
        <div className="min-w-32">
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="campo w-full text-sm"
          />
        </div>
        <div className="min-w-32 flex-1">
          <select
            value={orcamentoId}
            onChange={(e) => setOrcamentoId(e.target.value)}
            className="campo w-full text-sm"
          >
            <option value="">Sem orcamento</option>
            {orcs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.numeroFormatado}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => void adicionar()}
          disabled={salvando || !numero.trim() || !data}
          className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-50"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Adicionar NF
        </button>
      </div>
    </div>
  );
}
