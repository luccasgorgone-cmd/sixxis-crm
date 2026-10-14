"use client";

// Console do Supervisor Comercial IA (SPEC §7) — admin-only. Junta o painel
// determinístico (esquerda) e o chat com o consultor interno (direita). O painel
// recarrega quando o gestor troca período/finalidade; o chat usa a janela padrão
// e pode recortar sozinho via ferramentas de consulta.
import { useState, useEffect, useCallback } from "react";
import { Gauge } from "lucide-react";
import { Cabecalho } from "@/components/admin/VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import type { PainelSupervisor } from "@/lib/supervisor/tipos";
import { PainelIndicadores } from "./PainelIndicadores";
import { ChatSupervisor } from "./ChatSupervisor";

type Periodo = "hoje" | "semana" | "15d" | "mes";
type Finalidade = "" | "VENDA" | "POS_VENDA";

const PERIODOS: { chave: Periodo; rotulo: string }[] = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "semana", rotulo: "7 dias" },
  { chave: "15d", rotulo: "15 dias" },
  { chave: "mes", rotulo: "30 dias" },
];

const FINALIDADES: { chave: Finalidade; rotulo: string }[] = [
  { chave: "", rotulo: "Tudo" },
  { chave: "VENDA", rotulo: "Venda" },
  { chave: "POS_VENDA", rotulo: "Pós-venda" },
];

export function SupervisorConsole() {
  const [painel, setPainel] = useState<PainelSupervisor | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [finalidade, setFinalidade] = useState<Finalidade>("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    try {
      const qs = new URLSearchParams({ periodo });
      if (finalidade) qs.set("finalidade", finalidade);
      const r = await fetch(`/api/admin/supervisor/painel?${qs.toString()}`);
      if (!r.ok) {
        setErro(true);
        return;
      }
      setPainel((await r.json()) as PainelSupervisor);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [periodo, finalidade]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="p-5">
      <Cabecalho
        titulo="Supervisor Comercial"
        subtitulo="Consultor interno de IA — lê os indicadores e sugere o próximo passo. Nada é executado sem a sua confirmação."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(360px,440px)]">
        {/* Painel determinístico */}
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-black/5 bg-white p-0.5">
              {PERIODOS.map((p) => (
                <button
                  key={p.chave}
                  onClick={() => setPeriodo(p.chave)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    periodo === p.chave
                      ? "bg-tiffany/10 text-tiffany"
                      : "text-medio hover:text-escuro"
                  }`}
                >
                  {p.rotulo}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-black/5 bg-white p-0.5">
              {FINALIDADES.map((f) => (
                <button
                  key={f.chave || "tudo"}
                  onClick={() => setFinalidade(f.chave)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    finalidade === f.chave
                      ? "bg-tiffany/10 text-tiffany"
                      : "text-medio hover:text-escuro"
                  }`}
                >
                  {f.rotulo}
                </button>
              ))}
            </div>
          </div>

          {erro ? (
            <EstadoErro
              mensagem="Não foi possível carregar os indicadores."
              onRetry={() => void carregar()}
            />
          ) : carregando && !painel ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : painel ? (
            <div className={carregando ? "opacity-60 transition-opacity" : ""}>
              <PainelIndicadores painel={painel} />
            </div>
          ) : null}
        </div>

        {/* Chat com o consultor */}
        <div className="lg:sticky lg:top-5 lg:h-[calc(100vh-8rem)]">
          <div className="flex h-[32rem] min-h-0 flex-col overflow-hidden rounded-2xl border border-black/5 bg-white lg:h-full">
            <div className="flex items-center gap-2 border-b border-black/5 px-4 py-3">
              <Gauge className="h-4 w-4 text-tiffany" />
              <span className="text-sm font-semibold text-escuro">Consultor</span>
            </div>
            <div className="min-h-0 flex-1">
              <ChatSupervisor />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
