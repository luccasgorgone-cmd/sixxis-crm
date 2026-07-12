"use client";

// Secoes REUTILIZAVEIS do painel do cliente (Fatia B): extraidas de NegocioAcoes
// para serem consumidas IGUAIS pelos dois paineis (inbox e Kanban) — zero
// duplicacao, um componente por secao. Nada de logica nova: so reorganizacao de UI.
// Padrao da casa: dark, tiffany, Lucide monocromatico, sem emoji, titulos uppercase.
import { useEffect, useState } from "react";
import { Thermometer, GitBranch, Store } from "lucide-react";
import { BadgeTemperatura } from "@/components/badges";
import { BadgeSegmento } from "@/components/cliente/BlocoCliente";
import { useToast } from "@/components/ui/Toast";
import {
  TEMPERATURA_INFO,
  type Etapa,
  type Temperatura,
} from "@/components/kanban/tipos";

// Titulo padrao de secao (uppercase text-medio/50), com icone monocromatico.
function TituloSecao({
  icone: Icone,
  children,
}: {
  icone: typeof Thermometer;
  children: React.ReactNode;
}) {
  return (
    <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
      <Icone className="h-3.5 w-3.5" /> {children}
    </h4>
  );
}

// ----------------------------------------------------------------------------
// Temperatura (SO VENDA). Pos-venda usa ganho/pendente/perdido + garantia; o
// campo Negocio.temperatura permanece no banco. Extraida de NegocioAcoes sem
// mudanca de logica.
// ----------------------------------------------------------------------------
export function SecaoTemperatura({
  temperatura,
  finalidade,
  salvar,
}: {
  temperatura: Temperatura | null | undefined;
  finalidade: string;
  salvar: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  if (finalidade === "POS_VENDA") return null;
  return (
    <section className="rounded-xl border border-black/5 bg-white p-4">
      <TituloSecao icone={Thermometer}>Temperatura</TituloSecao>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(TEMPERATURA_INFO) as Temperatura[]).map((t) => {
          const ativo = temperatura === t;
          return (
            <button
              key={t}
              onClick={() => {
                if (!ativo) void salvar({ temperatura: t });
              }}
              className={`rounded-lg border px-1.5 py-1 transition-colors ${
                ativo
                  ? "border-tiffany bg-tiffany/5"
                  : "border-transparent hover:bg-black/5"
              }`}
            >
              <BadgeTemperatura temperatura={t} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// Etapa do funil. Trocar para GANHO/PERDIDO abre o modal de fechamento (via
// abrirModal); demais etapas salvam direto. Extraida de NegocioAcoes.
// ----------------------------------------------------------------------------
export function SecaoEtapa({
  etapaId,
  etapas,
  salvar,
  abrirModal,
}: {
  etapaId: string | null;
  etapas: Etapa[];
  salvar: (body: Record<string, unknown>) => Promise<boolean>;
  abrirModal: (tipo: "ganho" | "perdido", etapaId: string) => void;
}) {
  function aoTrocarEtapa(novaEtapaId: string) {
    const et = etapas.find((e) => e.id === novaEtapaId);
    if (!et || novaEtapaId === etapaId) return;
    if (et.tipo === "GANHO") return abrirModal("ganho", novaEtapaId);
    if (et.tipo === "PERDIDO") return abrirModal("perdido", novaEtapaId);
    void salvar({ etapaId: novaEtapaId });
  }
  return (
    <section className="rounded-xl border border-black/5 bg-white p-4">
      <TituloSecao icone={GitBranch}>Etapa</TituloSecao>
      <select
        value={etapaId ?? ""}
        onChange={(e) => aoTrocarEtapa(e.target.value)}
        className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
      >
        {etapas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome}
          </option>
        ))}
      </select>
    </section>
  );
}

// ----------------------------------------------------------------------------
// Segmento comercial do CLIENTE (Varejo/Atacado). SO VENDA (o pai so monta esta
// secao na finalidade de venda). Promove a seletor visivel o segmento que hoje
// so vive no formulario do BlocoCliente — mantendo BadgeSegmento e a persistencia
// atual (PATCH /api/leads/[id] { segmento }). Auto-busca o valor via GET (nao
// depende do detalhe do negocio, que nao carrega segmento).
// ----------------------------------------------------------------------------
export function SecaoSegmento({
  leadId,
  onAtualizado,
}: {
  leadId: string;
  onAtualizado?: () => void;
}) {
  const toast = useToast();
  const [segmento, setSegmento] = useState<"VAREJO" | "ATACADO" | "">("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    fetch(`/api/leads/${leadId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo) setSegmento((d?.cliente?.segmento as "VAREJO" | "ATACADO") ?? "");
      })
      .catch(() => {
        if (vivo) setSegmento("");
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [leadId]);

  async function mudar(novo: string) {
    const anterior = segmento;
    setSegmento((novo as "VAREJO" | "ATACADO") || "");
    setSalvando(true);
    try {
      const r = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmento: novo || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        if (!(r.status === 400 && d?.erro === "nada a atualizar")) {
          setSegmento(anterior);
          toast.erro(d?.erro ?? "Nao foi possivel salvar o segmento.");
          return;
        }
      }
      onAtualizado?.();
    } catch {
      setSegmento(anterior);
      toast.erro("Falha de conexao ao salvar o segmento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="rounded-xl border border-black/5 bg-white p-4">
      <TituloSecao icone={Store}>Segmento</TituloSecao>
      <div className="mb-2 flex items-center gap-2">
        {segmento ? (
          <BadgeSegmento segmento={segmento} />
        ) : (
          <span className="text-xs text-medio/40">Nao definido</span>
        )}
      </div>
      <select
        value={segmento}
        disabled={carregando || salvando}
        onChange={(e) => void mudar(e.target.value)}
        className="campo w-full"
      >
        <option value="">Nao definido</option>
        <option value="VAREJO">Varejo</option>
        <option value="ATACADO">Atacado</option>
      </select>
    </section>
  );
}
