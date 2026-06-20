"use client";

// Gauge circular (donut) de progresso, em SVG, com numero grande no centro.
// O arco preenche ate 100% (clampado); o rotulo mostra o % real.

export function Donut({
  pct,
  cor,
  tamanho = 132,
  espessura = 11,
  centro,
  legenda,
}: {
  pct: number; // percentual real (pode passar de 100)
  cor: string; // hex do arco
  tamanho?: number;
  espessura?: number;
  centro: string; // numero grande no meio
  legenda?: string; // texto pequeno abaixo do numero
}) {
  const raio = (tamanho - espessura) / 2;
  const circ = 2 * Math.PI * raio;
  const fracao = Math.max(0, Math.min(pct / 100, 1));
  const traco = circ * fracao;

  return (
    <div
      className="relative shrink-0"
      style={{ width: tamanho, height: tamanho }}
    >
      <svg
        width={tamanho}
        height={tamanho}
        viewBox={`0 0 ${tamanho} ${tamanho}`}
        className="-rotate-90"
      >
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          stroke="#eef2f1"
          strokeWidth={espessura}
        />
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          stroke={cor}
          strokeWidth={espessura}
          strokeLinecap="round"
          strokeDasharray={`${traco} ${circ}`}
          style={{ transition: "stroke-dasharray 700ms cubic-bezier(.4,0,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold leading-none text-escuro">
          {centro}
        </span>
        {legenda && (
          <span className="mt-1 text-[11px] text-medio/60">{legenda}</span>
        )}
      </div>
    </div>
  );
}
