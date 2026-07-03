"use client";

// Drawer do estado no Clima: DUAS partes bem organizadas (abas internas) —
// METEOROLOGIA (relatorio completo por estado) + CLIENTES (lista rica, reusa o
// componente compartilhado do Mapa: top compradores por padrao, fallback por
// presenca, filtros de categoria/segmento/rastreio). Dados dos clientes vem de
// /api/mapa/estado (RICO + escopo por usuario). Estilo Sixxis (overlay + slide).
import { useCallback, useEffect, useState } from "react";
import { X, ThermometerSun, Users, Loader2 } from "lucide-react";
import { EstadoErro } from "@/components/ui/Estado";
import { paramsEscopo } from "@/lib/escopo";
import { ListaClientesEstado } from "@/components/mapa/ListaClientesEstado";
import type { EstadoDetalheResp } from "@/components/mapa/tipos";
import { ClimaEstadoDetalhe } from "./ClimaEstadoDetalhe";
import type { ClimaUF } from "./tipos";

type AbaDrawer = "meteorologia" | "clientes";

export function PainelClientesEstado({
  uf,
  escopo = "",
  onFechar,
  onAbrirNegocio,
  climatizador = false,
  resumoClima,
}: {
  uf: string;
  // Escopo de vendedor herdado do Clima (admin). Vazio = colaborador / Todos.
  escopo?: string;
  onFechar: () => void;
  onAbrirNegocio: (negocioId: string) => void;
  // No modo Climatizador o drawer ganha a aba de meteorologia (curva + previsao).
  climatizador?: boolean;
  resumoClima?: ClimaUF | null;
}) {
  const [dados, setDados] = useState<EstadoDetalheResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [aba, setAba] = useState<AbaDrawer>(
    climatizador ? "meteorologia" : "clientes",
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const p = new URLSearchParams({ uf });
      for (const [k, v] of paramsEscopo(escopo)) p.set(k, v);
      const r = await fetch(`/api/mapa/estado?${p.toString()}`);
      if (!r.ok) throw new Error();
      setDados(await r.json());
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [uf, escopo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Fecha com ESC.
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onFechar]);

  const titulo = dados ? `${dados.resumo.estado} (${uf})` : uf;
  const abas: { chave: AbaDrawer; rotulo: string; Icone: typeof Users }[] = [
    ...(climatizador
      ? [{ chave: "meteorologia" as const, rotulo: "Meteorologia", Icone: ThermometerSun }]
      : []),
    { chave: "clientes" as const, rotulo: "Clientes", Icone: Users },
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fade-in absolute inset-0 bg-black/30" onClick={onFechar} />

      <aside className="drawer-in relative flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
        {/* Cabecalho */}
        <header className="shrink-0 border-b border-black/5 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-escuro">{titulo}</p>
              <p className="text-xs text-medio/60">
                {dados ? `${dados.resumo.clientes} clientes` : "carregando..."}
              </p>
            </div>
            <button
              onClick={onFechar}
              title="Fechar"
              className="rounded-lg p-1.5 text-medio transition-colors hover:bg-black/5 hover:text-escuro"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Abas internas: meteorologia + clientes */}
          {abas.length > 1 && (
            <div className="mt-3 flex gap-1">
              {abas.map((a) => (
                <button
                  key={a.chave}
                  onClick={() => setAba(a.chave)}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    aba === a.chave
                      ? "bg-tiffany text-white"
                      : "text-medio hover:bg-black/5"
                  }`}
                >
                  <a.Icone className="h-3.5 w-3.5" />
                  {a.rotulo}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* Conteudo */}
        <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">
          {aba === "meteorologia" && climatizador && (
            <ClimaEstadoDetalhe uf={uf} resumo={resumoClima} />
          )}

          {aba === "clientes" &&
            (carregando && !dados ? (
              <div className="flex h-40 items-center justify-center text-medio/50">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : erro && !dados ? (
              <EstadoErro
                mensagem="Nao foi possivel carregar os clientes."
                onRetry={() => void carregar()}
                compacto
              />
            ) : dados ? (
              <div className="p-4">
                <ListaClientesEstado
                  clientes={dados.clientes}
                  onAbrirNegocio={onAbrirNegocio}
                  limiteInicial={15}
                />
              </div>
            ) : null)}
        </div>
      </aside>
    </div>
  );
}
