"use client";

// Sino de alertas de SLA (negocios parados alem do tempo da etapa) no topo:
//  - badge com a CONTAGEM do agente (admin: de todos);
//  - aviso SONORO ao surgir um novo alerta (respeita a politica de autoplay:
//    o som so toca apos a 1a interacao do usuario na pagina);
//  - DROPDOWN com a lista do que esta em atraso (cliente, etapa, ha quanto
//    tempo), cada item clicavel para abrir a conversa e resolver.
// O alerta fecha sozinho quando o card e movido/ganho/perdido, entao a lista e
// a contagem se atualizam via socket (alerta:atualizado).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Clock } from "lucide-react";
import { getSocket } from "@/lib/socketClient";
import { arquivoSom } from "@/lib/sons";
import { tempoDesde } from "@/lib/format";

type ItemAlerta = {
  alertaId: string;
  negocioId: string;
  leadId: string;
  cliente: string;
  finalidade: "VENDA" | "POS_VENDA";
  etapa: string;
  entrouEtapaEm: string;
  dono: string | null;
};

export function SinoAlertasSla({
  agenteId,
  papel,
}: {
  agenteId: string;
  papel: string;
}) {
  const router = useRouter();
  const ehAdmin = papel === "ADMIN";
  const [total, setTotal] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<ItemAlerta[]>([]);
  const [carregando, setCarregando] = useState(false);
  const interagiu = useRef(false);

  async function atualizar() {
    try {
      const r = await fetch("/api/alertas/contador");
      if (r.ok) setTotal((await r.json()).total ?? 0);
    } catch {
      /* silencioso */
    }
  }

  async function carregarLista() {
    setCarregando(true);
    try {
      const r = await fetch("/api/alertas/lista");
      if (r.ok) setItens((await r.json()).itens ?? []);
    } catch {
      /* silencioso */
    } finally {
      setCarregando(false);
    }
  }

  // Libera o audio apos a 1a interacao (autoplay policy).
  useEffect(() => {
    const marcar = () => {
      interagiu.current = true;
    };
    window.addEventListener("pointerdown", marcar, { once: true });
    window.addEventListener("keydown", marcar, { once: true });
    return () => {
      window.removeEventListener("pointerdown", marcar);
      window.removeEventListener("keydown", marcar);
    };
  }, []);

  useEffect(() => {
    void atualizar();
    const socket = getSocket();
    const aoNovo = (p: { agenteId?: string | null; som?: string | null }) => {
      void atualizar();
      // Se o dropdown esta aberto, mantem a lista fresca.
      if (aberto) void carregarLista();
      // Toca o som se o alerta e meu (ou sou admin) e ja houve interacao.
      const meu = ehAdmin || p?.agenteId === agenteId;
      if (meu && interagiu.current) {
        try {
          const audio = new Audio(arquivoSom(p?.som));
          audio.volume = 0.6;
          void audio.play().catch(() => undefined);
        } catch {
          /* ignora */
        }
      }
    };
    const aoAtualizar = () => {
      void atualizar();
      if (aberto) void carregarLista();
    };
    socket.on("alerta:novo", aoNovo);
    socket.on("alerta:atualizado", aoAtualizar);
    return () => {
      socket.off("alerta:novo", aoNovo);
      socket.off("alerta:atualizado", aoAtualizar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenteId, ehAdmin, aberto]);

  function alternar() {
    const novo = !aberto;
    setAberto(novo);
    if (novo) void carregarLista();
  }

  function abrirItem(it: ItemAlerta) {
    setAberto(false);
    router.push(`/inbox?lead=${it.leadId}`);
  }

  if (total === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={alternar}
        title={`${total} alerta(s) de tempo (SLA)`}
        aria-label="Alertas de SLA"
        aria-expanded={aberto}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50"
      >
        <BellRing className="h-5 w-5" />
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
          {total > 99 ? "99+" : total}
        </span>
      </button>

      {aberto && (
        <>
          {/* Camada para fechar ao clicar fora. */}
          <div className="fixed inset-0 z-20" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-11 z-30 w-80 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-escuro">
                <BellRing className="h-4 w-4 text-red-600" /> Em atraso (SLA)
              </span>
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                {total}
              </span>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {carregando && itens.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-medio/60">
                  Carregando…
                </p>
              ) : itens.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-medio/60">
                  Nada em atraso agora.
                </p>
              ) : (
                itens.map((it) => (
                  <button
                    key={it.alertaId}
                    type="button"
                    onClick={() => abrirItem(it)}
                    className="flex w-full items-start gap-2 border-b border-black/5 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-red-50/60"
                  >
                    <span className="mt-0.5 shrink-0 text-red-500">
                      <BellRing className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-escuro">
                        {it.cliente}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-medio/70">
                        <span className="rounded bg-fundo px-1.5 py-0.5">
                          {it.finalidade === "POS_VENDA" ? "Pós-venda" : "Venda"}
                        </span>
                        <span className="truncate">{it.etapa}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-red-600">
                        <Clock className="h-3 w-3" /> parado há{" "}
                        {tempoDesde(it.entrouEtapaEm)}
                        {it.dono ? (
                          <span className="ml-1 font-normal text-medio/60">
                            · {it.dono}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setAberto(false);
                router.push("/kanban");
              }}
              className="block w-full border-t border-black/5 px-3 py-2 text-center text-xs font-medium text-tiffany transition-colors hover:bg-fundo"
            >
              Abrir o Kanban
            </button>
          </div>
        </>
      )}
    </div>
  );
}
