"use client";

// Admin > Evolution: visao de saude (base URL mascarada + status das instancias).
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { RefreshCw, ArrowRight, ShieldCheck, ShieldAlert } from "lucide-react";
import { Cabecalho, SkeletonTabela } from "./VendedoresAdmin";
import { BadgeFinalidade } from "@/components/BadgeFinalidade";
import { EstadoErro } from "@/components/ui/Estado";

type Instancia = {
  id: string;
  nome: string;
  instanciaEvolution: string;
  numero: string | null;
  finalidade: string;
  ativo: boolean;
  statusConexao: string | null;
};

const COR_STATUS: Record<string, string> = {
  open: "bg-green-100 text-green-700",
  connecting: "bg-amber-100 text-amber-700",
  close: "bg-red-100 text-red-700",
};

export function EvolutionAdmin() {
  const [baseUrl, setBaseUrl] = useState("");
  const [temApiKey, setTemApiKey] = useState(false);
  const [instancias, setInstancias] = useState<Instancia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/admin/evolution");
      if (r.ok) {
        const d = await r.json();
        setBaseUrl(d.baseUrl);
        setTemApiKey(d.temApiKey);
        setInstancias(d.instancias);
        setErro(false);
      } else {
        setErro(true);
      }
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Evolution"
        subtitulo="Saude da conexao com a Evolution API"
        acao={
          <button
            onClick={() => void carregar()}
            className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-black/5 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-medio/50">
            Base URL
          </p>
          <p className="mt-1 font-mono text-sm text-escuro">{baseUrl}</p>
        </div>
        <div className="rounded-xl border border-black/5 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-medio/50">
            API key
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
            {temApiKey ? (
              <>
                <ShieldCheck className="h-4 w-4 text-green-600" />
                <span className="text-green-700">Configurada</span>
              </>
            ) : (
              <>
                <ShieldAlert className="h-4 w-4 text-red-600" />
                <span className="text-red-700">Ausente</span>
              </>
            )}
          </p>
        </div>
      </div>

      {carregando ? (
        <SkeletonTabela />
      ) : erro ? (
        <EstadoErro
          mensagem="Nao foi possivel carregar."
          onRetry={() => void carregar()}
        />
      ) : (
        <div className="space-y-2">
          {instancias.map((i) => (
            <div
              key={i.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-black/5 bg-white p-3"
            >
              <div className="min-w-40 flex-1">
                <p className="text-sm font-semibold text-escuro">{i.nome}</p>
                <p className="text-xs text-medio/60">
                  {i.instanciaEvolution}
                  {i.numero ? ` · ${i.numero}` : ""}
                </p>
              </div>
              <BadgeFinalidade finalidade={i.finalidade} />
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  COR_STATUS[i.statusConexao ?? ""] ?? "bg-black/10 text-medio/60"
                }`}
              >
                {i.statusConexao ?? "desconhecido"}
              </span>
              {!i.ativo && (
                <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs text-medio/60">
                  inativo
                </span>
              )}
            </div>
          ))}
          {instancias.length === 0 && (
            <p className="py-6 text-center text-sm text-medio/50">
              Nenhuma instancia cadastrada.
            </p>
          )}
        </div>
      )}

      <Link
        href="/admin/numeros"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-tiffany hover:underline"
      >
        Gerenciar numeros <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
