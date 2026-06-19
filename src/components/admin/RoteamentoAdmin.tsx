"use client";

// Admin > Roteamento: liga/desliga, respeitar dono, mostra o ciclo dos
// vendedores ativos e quem e o proximo, e permite resetar o ciclo.
import { useState, useEffect, useCallback } from "react";
import { RotateCcw, ArrowRight } from "lucide-react";
import { Cabecalho, SkeletonTabela } from "./VendedoresAdmin";

type Vendedor = { id: string; nome: string; papel: string };
type Config = {
  estrategia: string;
  ativo: boolean;
  respeitarDono: boolean;
  ponteiroAgenteId: string | null;
};

export function RoteamentoAdmin() {
  const [config, setConfig] = useState<Config | null>(null);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [proximoId, setProximoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/admin/roteamento");
    if (r.ok) {
      const d = await r.json();
      setConfig(d.config);
      setVendedores(d.vendedores);
      setProximoId(d.proximoId);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function patch(body: Record<string, unknown>) {
    await fetch("/api/admin/roteamento", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await carregar();
  }

  async function resetar() {
    await fetch("/api/admin/roteamento", { method: "POST" });
    await carregar();
  }

  if (carregando || !config) {
    return (
      <div className="p-6">
        <SkeletonTabela />
      </div>
    );
  }

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Roteamento de leads"
        subtitulo="Distribuicao automatica dos novos clientes entre os vendedores"
      />

      <div className="max-w-2xl space-y-3">
        <Toggle
          titulo="Roteamento ativo"
          descricao="Distribui automaticamente os leads novos."
          valor={config.ativo}
          onChange={(v) => void patch({ ativo: v })}
        />
        <Toggle
          titulo="Respeitar dono (sticky)"
          descricao="Contato recorrente cai sempre no vendedor dono do cliente."
          valor={config.respeitarDono}
          onChange={(v) => void patch({ respeitarDono: v })}
        />

        <div className="rounded-xl border border-black/5 bg-white p-4">
          <p className="text-sm font-medium text-escuro">Estrategia</p>
          <p className="mt-1 inline-block rounded-lg bg-tiffany/10 px-2.5 py-1 text-sm font-medium text-tiffany">
            Round-robin por ordem de chegada
          </p>
        </div>

        <div className="rounded-xl border border-black/5 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-escuro">
              Ciclo dos vendedores ativos
            </p>
            <button
              onClick={() => void resetar()}
              className="flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-medium text-medio hover:bg-black/5"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Resetar ciclo
            </button>
          </div>

          {vendedores.length === 0 ? (
            <p className="text-sm text-medio/50">
              Nenhum vendedor ativo. Cadastre vendedores para distribuir.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {vendedores.map((v, i) => (
                <li
                  key={v.id}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    v.id === proximoId
                      ? "bg-tiffany/10 font-medium text-escuro"
                      : "text-medio"
                  }`}
                >
                  <span className="w-5 text-medio/40">{i + 1}</span>
                  {v.nome}
                  {v.id === proximoId && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-tiffany">
                      <ArrowRight className="h-3.5 w-3.5" /> proximo
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  titulo,
  descricao,
  valor,
  onChange,
}: {
  titulo: string;
  descricao: string;
  valor: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-black/5 bg-white p-4">
      <div>
        <p className="text-sm font-medium text-escuro">{titulo}</p>
        <p className="text-xs text-medio/60">{descricao}</p>
      </div>
      <button
        onClick={() => onChange(!valor)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          valor ? "bg-tiffany" : "bg-black/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            valor ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
