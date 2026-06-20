"use client";

// Admin > Colaboradores: lista com resumo (ao vivo / pendentes / finalizados)
// no periodo. Clique abre o perfil.
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Radio, Clock4, CheckCircle2, ChevronRight } from "lucide-react";
import { BadgeFinalidade } from "@/components/BadgeFinalidade";
import { EstadoErro } from "@/components/ui/Estado";
import { horarioLista } from "@/lib/format";
import type { ResumoColaborador } from "./tipos";

export function ColaboradoresAdmin() {
  const router = useRouter();
  const [lista, setLista] = useState<ResumoColaborador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/admin/colaboradores");
      if (r.ok) {
        setLista((await r.json()).colaboradores);
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
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-escuro">Colaboradores</h2>
          <p className="text-sm text-medio/60">
            Estado atual dos atendimentos de cada um
          </p>
        </div>
      </div>

      {carregando ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : erro ? (
        <EstadoErro
          mensagem="Nao foi possivel carregar."
          onRetry={() => void carregar()}
        />
      ) : lista.length === 0 ? (
        <p className="py-10 text-center text-sm text-medio/50">
          Nenhum colaborador cadastrado.
        </p>
      ) : (
        <div className="space-y-2">
          {lista.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/admin/colaboradores/${c.id}`)}
              className="flex w-full items-center gap-4 rounded-xl border border-black/5 bg-white p-3 text-left transition-colors hover:bg-fundo"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tiffany/10 text-sm font-semibold text-tiffany">
                {c.nome.slice(0, 2).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-escuro">
                    {c.nome}
                  </p>
                  {!c.ativo && (
                    <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] text-medio/60">
                      inativo
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {c.acessoVenda && <BadgeFinalidade finalidade="VENDA" />}
                  {c.acessoPosVenda && <BadgeFinalidade finalidade="POS_VENDA" />}
                  {c.ultimoAtendimento && (
                    <span className="text-[11px] text-medio/40">
                      ultimo {horarioLista(c.ultimoAtendimento)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-4 text-center">
                <Resumo
                  icone={Radio}
                  valor={c.aovivo}
                  rotulo="ao vivo"
                  cor="text-green-600"
                />
                <Resumo
                  icone={Clock4}
                  valor={c.pendentes}
                  rotulo="pendentes"
                  cor="text-amber-600"
                />
                <Resumo
                  icone={CheckCircle2}
                  valor={c.finalizados}
                  rotulo="finalizados"
                  cor="text-medio"
                />
                <ChevronRight className="h-4 w-4 text-medio/40" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Resumo({
  icone: Icone,
  valor,
  rotulo,
  cor,
}: {
  icone: typeof Radio;
  valor: number;
  rotulo: string;
  cor: string;
}) {
  return (
    <div className="w-16">
      <p className={`flex items-center justify-center gap-1 text-base font-semibold ${cor}`}>
        <Icone className="h-3.5 w-3.5" />
        {valor}
      </p>
      <p className="text-[10px] text-medio/50">{rotulo}</p>
    </div>
  );
}
