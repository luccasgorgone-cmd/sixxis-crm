// Primitivas presentacionais compartilhadas pelos painéis do Supervisor
// (Relatórios e Alertas). Puras: sem estado, sem fetch — só renderizam a forma
// PainelSupervisor (Camada 1). Mantêm o vocabulário de tokens do app
// (bg-white remapeado no .dark, tiffany como assinatura, lucide monocromático).
import type {
  Indicador,
  Semaforo,
  UnidadeIndicador,
} from "@/lib/supervisor/tipos";
import { formatarBRL, formatarDuracao, formatarPct } from "@/lib/format";
import { ArrowDown, ArrowUp } from "lucide-react";

// Cor do ponto de semáforo. neutro = "sem leitura" (cinza), nunca verde.
export const COR_SEMAFORO: Record<Semaforo, string> = {
  verde: "bg-sucesso",
  amarelo: "bg-amber-500",
  vermelho: "bg-erro",
  neutro: "bg-medio/40",
};

export function formatarValor(
  valor: number | null,
  unidade: UnidadeIndicador,
): string {
  if (valor == null) return "—";
  switch (unidade) {
    case "pct":
      return formatarPct(valor);
    case "seg":
      return formatarDuracao(valor);
    case "dias":
      return `${Math.round(valor)} d`;
    case "reais":
      return formatarBRL(valor);
    case "x":
      return `${valor.toFixed(1)}x`;
    default:
      return `${Math.round(valor)}`;
  }
}

function formatarMeta(ind: Indicador): string | null {
  if (ind.meta == null) return null;
  return `meta ${formatarValor(ind.meta, ind.unidade)}`;
}

// Variação período-a-período: diferença ABSOLUTA na mesma unidade (evita a
// confusão de "% de %"). Cor por melhora/piora conforme maiorMelhor; seta pela
// direção bruta do valor.
function VariacaoIndicador({ ind }: { ind: Indicador }) {
  if (ind.valorAnterior == null || ind.valor == null) return null;
  const delta = ind.valor - ind.valorAnterior;
  if (delta === 0) {
    return (
      <span
        className="text-[11px] font-medium text-medio/40"
        title="Igual ao período anterior"
      >
        0
      </span>
    );
  }
  const melhorou = ind.maiorMelhor ? delta > 0 : delta < 0;
  const Seta = delta > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={`flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${
        melhorou ? "text-sucesso" : "text-erro"
      }`}
      title={`${formatarValor(ind.valorAnterior, ind.unidade)} no período anterior`}
    >
      <Seta className="h-3 w-3" />
      {formatarValor(Math.abs(delta), ind.unidade)}
    </span>
  );
}

export function CartaoIndicador({ ind }: { ind: Indicador }) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-3.5 transition-colors hover:border-black/10">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium leading-tight text-medio/70">
          {ind.titulo}
        </p>
        <span
          className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${COR_SEMAFORO[ind.semaforo]}`}
          aria-hidden
        />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-escuro">
          {formatarValor(ind.valor, ind.unidade)}
        </p>
        <VariacaoIndicador ind={ind} />
      </div>
      <p className="mt-0.5 text-[11px] leading-tight text-medio/50">
        {ind.detalhe ?? formatarMeta(ind) ?? " "}
      </p>
    </div>
  );
}

export function GradeIndicadores({ indicadores }: { indicadores: Indicador[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {indicadores.map((ind) => (
        <CartaoIndicador key={ind.chave} ind={ind} />
      ))}
    </div>
  );
}

// Cabeçalho de seção: rótulo funcional de grupo (não é eyebrow decorativo).
// `extra` recebe uma contagem/resumo alinhado à direita quando útil.
export function Secao({
  titulo,
  icone: Icone,
  extra,
  children,
}: {
  titulo: string;
  icone?: React.ComponentType<{ className?: string }>;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-medio/50">
          {Icone && <Icone className="h-3.5 w-3.5" />}
          {titulo}
        </h3>
        {extra != null && (
          <span className="text-xs tabular-nums text-medio/50">{extra}</span>
        )}
      </div>
      {children}
    </section>
  );
}

// Linha padrão de lista (rótulo à esquerda, métricas à direita). Reusada por
// funil, parados, perdas, origens e ranking para um ritmo visual único.
export function LinhaLista({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm ${className}`}
    >
      {children}
    </div>
  );
}
