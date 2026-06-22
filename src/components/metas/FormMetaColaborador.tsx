"use client";

// Formulario do colaborador para criar/editar as PROPRIAS metas (escopo
// COLABORADOR para si). Sem seletor de escopo/colaborador (sempre o proprio).
import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  METRICAS,
  ROTULO_PERIODO,
  alvoParaInput,
  inputParaAlvo,
  type Meta,
  type Metrica,
  type Finalidade,
  type Periodo,
} from "./tipos";

function datasPreset(p: Periodo): { inicio: string; fim: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const hoje = new Date();
  if (p === "DIARIA") return { inicio: iso(hoje), fim: iso(hoje) };
  if (p === "SEMANAL") {
    const fim = new Date(hoje);
    fim.setDate(fim.getDate() + 6);
    return { inicio: iso(hoje), fim: iso(fim) };
  }
  if (p === "MENSAL") {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return { inicio: iso(ini), fim: iso(fim) };
  }
  const fim = new Date(hoje);
  fim.setDate(fim.getDate() + 30);
  return { inicio: iso(hoje), fim: iso(fim) };
}

export function FormMetaColaborador({
  meta,
  onFechar,
  onSalvo,
}: {
  meta: Meta | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const edicao = Boolean(meta);
  const toast = useToast();
  const [nome, setNome] = useState(meta?.nome ?? "");
  const [finalidade, setFinalidade] = useState<Finalidade>(
    meta?.finalidade ?? "AMBAS",
  );
  const [metrica, setMetrica] = useState<Metrica>(meta?.metrica ?? "VALOR_VENDIDO");
  const [periodo, setPeriodo] = useState<Periodo>(meta?.periodo ?? "MENSAL");
  const [alvo, setAlvo] = useState(
    meta ? String(alvoParaInput(meta.metrica, meta.alvo)) : "",
  );
  const [inicio, setInicio] = useState(
    meta ? meta.inicio.slice(0, 10) : datasPreset("MENSAL").inicio,
  );
  const [fim, setFim] = useState(
    meta ? meta.fim.slice(0, 10) : datasPreset("MENSAL").fim,
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const unidade = METRICAS.find((x) => x.chave === metrica)?.unidade ?? "";

  function aplicarPeriodo(p: Periodo) {
    setPeriodo(p);
    if (p !== "CUSTOM") {
      const d = datasPreset(p);
      setInicio(d.inicio);
      setFim(d.fim);
    }
  }

  async function salvar() {
    setErro(null);
    const alvoNum = Number(alvo);
    if (!Number.isFinite(alvoNum) || alvoNum <= 0) {
      setErro("Informe um alvo maior que zero.");
      return;
    }
    if (!inicio || !fim || fim < inicio) {
      setErro("Verifique as datas de inicio e fim.");
      return;
    }
    setSalvando(true);
    try {
      const corpo = {
        nome,
        finalidade,
        metrica,
        alvo: inputParaAlvo(metrica, alvoNum),
        periodo,
        inicio: `${inicio}T00:00:00`,
        fim: `${fim}T23:59:59`,
      };
      const r = await fetch(edicao ? `/api/metas/${meta!.id}` : "/api/metas", {
        method: edicao ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        setErro(d?.erro ?? "Nao foi possivel salvar.");
        setSalvando(false);
        return;
      }
      toast.sucesso(edicao ? "Meta atualizada." : "Meta criada.");
      onSalvo();
    } catch {
      setErro("Falha ao salvar.");
      setSalvando(false);
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in scroll-fino max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-escuro">
            {edicao ? "Editar minha meta" : "Nova meta"}
          </h3>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-lg p-1 text-medio/60 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-medio/70">
              Nome (opcional)
            </label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Minha meta de vendas"
              className="campo w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-medio/70">
                Metrica
              </label>
              <select
                value={metrica}
                onChange={(e) => setMetrica(e.target.value as Metrica)}
                className="campo w-full"
              >
                {METRICAS.map((m) => (
                  <option key={m.chave} value={m.chave}>
                    {m.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-medio/70">
                Alvo ({unidade})
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={alvo}
                onChange={(e) => setAlvo(e.target.value)}
                placeholder="0"
                className="campo w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-medio/70">
                Finalidade
              </label>
              <select
                value={finalidade}
                onChange={(e) => setFinalidade(e.target.value as Finalidade)}
                className="campo w-full"
              >
                <option value="AMBAS">Geral</option>
                <option value="VENDA">Venda</option>
                <option value="POS_VENDA">Pos-venda</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-medio/70">
                Periodo
              </label>
              <select
                value={periodo}
                onChange={(e) => aplicarPeriodo(e.target.value as Periodo)}
                className="campo w-full"
              >
                {(["DIARIA", "SEMANAL", "MENSAL", "CUSTOM"] as Periodo[]).map(
                  (p) => (
                    <option key={p} value={p}>
                      {ROTULO_PERIODO[p]}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-medio/70">
                Inicio
              </label>
              <input
                type="date"
                value={inicio}
                onChange={(e) => {
                  setInicio(e.target.value);
                  setPeriodo("CUSTOM");
                }}
                className="campo w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-medio/70">
                Fim
              </label>
              <input
                type="date"
                value={fim}
                onChange={(e) => {
                  setFim(e.target.value);
                  setPeriodo("CUSTOM");
                }}
                className="campo w-full"
              />
            </div>
          </div>
        </div>

        {erro && <p className="mt-3 text-xs text-erro">{erro}</p>}

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
            className="flex items-center gap-2 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
