"use client";

// Secao "Historico do cliente": timeline rica e cronologica combinando contatos,
// compras (o que comprou), pedidos da loja e atividades. Icones e cores por tipo,
// datas e valores. Estados vazios elegantes; loja offline nao quebra.
import { useEffect, useState } from "react";
import {
  Phone,
  PhoneCall,
  ShoppingBag,
  Package,
  UserCheck,
  Repeat,
  StickyNote,
  Tag,
  ArrowRight,
  DollarSign,
  XCircle,
  Sparkles,
  UserPlus,
  Pencil,
  History,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { formatarBRL } from "@/lib/format";
import { BadgeFinalidade } from "@/components/BadgeFinalidade";

type Evento = {
  id: string;
  categoria: "contato" | "atividade" | "compra" | "pedido";
  tipo: string;
  titulo: string;
  descricao: string | null;
  data: string;
  agente?: string | null;
  finalidade?: string | null;
  valor?: number | null;
  itens?: string[];
  status?: string | null;
};

const ICONE_ATIV: Record<string, LucideIcon> = {
  CRIACAO: Sparkles,
  CONTATO: Phone,
  ATRIBUICAO: UserCheck,
  TRANSFERENCIA: Repeat,
  ASSUMIDO: UserPlus,
  NOTA: StickyNote,
  ETIQUETA: Tag,
  ETAPA: ArrowRight,
  VALOR: DollarSign,
  PERDA: XCircle,
  EDICAO: Pencil,
};

// Visual (icone + cor) por evento.
function visual(e: Evento): { Icone: LucideIcon; classe: string } {
  if (e.categoria === "contato") {
    return {
      Icone: e.titulo === "Primeiro contato" ? PhoneCall : Phone,
      classe: "bg-tiffany/10 text-tiffany",
    };
  }
  if (e.categoria === "compra") {
    return { Icone: ShoppingBag, classe: "bg-green-100 text-green-700" };
  }
  if (e.categoria === "pedido") {
    return { Icone: Package, classe: "bg-violet-100 text-violet-700" };
  }
  return {
    Icone: ICONE_ATIV[e.tipo] ?? StickyNote,
    classe: "bg-black/5 text-medio/70",
  };
}

function dataHora(valor: string): string {
  return new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoricoCliente({ leadId }: { leadId: string }) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [lojaOffline, setLojaOffline] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    fetch(`/api/leads/${leadId}/historico`)
      .then((r) => (r.ok ? r.json() : { eventos: [], lojaOffline: true }))
      .then((d) => {
        if (!vivo) return;
        setEventos(d.eventos ?? []);
        setLojaOffline(Boolean(d.lojaOffline));
      })
      .catch(() => undefined)
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [leadId]);

  if (carregando) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="skeleton h-7 w-7 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3 w-2/3" />
              <div className="skeleton h-2.5 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (eventos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-tiffany/10">
          <History className="h-5 w-5 text-tiffany" />
        </div>
        <p className="text-sm font-medium text-escuro">Sem historico ainda</p>
        <p className="max-w-xs text-xs text-medio/60">
          Contatos, compras e atividades deste cliente aparecem aqui.
        </p>
      </div>
    );
  }

  return (
    <div>
      <ol className="relative space-y-4 border-l border-black/5 pl-4">
        {eventos.map((e) => {
          const { Icone, classe } = visual(e);
          return (
            <li key={e.id} className="relative">
              <span
                className={`absolute -left-[26px] flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-white ${classe}`}
              >
                <Icone className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-escuro">{e.titulo}</p>
                  {e.valor != null && (
                    <span className="shrink-0 text-sm font-semibold text-tiffany-escuro">
                      {formatarBRL(e.valor)}
                    </span>
                  )}
                </div>

                {e.descricao && (
                  <p className="mt-0.5 text-xs text-medio/70">{e.descricao}</p>
                )}

                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-medio/50">
                  <span>{dataHora(e.data)}</span>
                  {e.agente && <span>· {e.agente}</span>}
                  {e.status && (
                    <span className="rounded-full bg-black/5 px-1.5 py-0.5 font-medium text-medio/70">
                      {e.status}
                    </span>
                  )}
                  {e.finalidade && (
                    <BadgeFinalidade finalidade={e.finalidade} />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {lojaOffline && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-medio/40">
          <WifiOff className="h-3 w-3" /> Pedidos da loja indisponiveis agora
        </p>
      )}
    </div>
  );
}
