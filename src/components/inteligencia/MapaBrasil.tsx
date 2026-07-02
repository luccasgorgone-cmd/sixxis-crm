"use client";

// Mapa coropletico dos 27 estados do Brasil. Le a malha estadual (TopoJSON
// local em /public), projeta com d3-geo e desenha um <path> por UF. A cor de
// cada estado e delegada ao pai (cor por metrica); o conteudo do tooltip por UF
// tambem. Sem dependencia de bibliotecas de mapa (React 19 nativo).
import { useEffect, useMemo, useRef, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";

const W = 460;
const H = 480;

type Geo = { sigla: string; d: string };

export function MapaBrasil({
  cor,
  tooltip,
  ufAtivo,
  onHoverUF,
  onClickUF,
  dimUF,
}: {
  cor: (uf: string) => string;
  tooltip: (uf: string) => React.ReactNode;
  ufAtivo: string | null;
  onHoverUF: (uf: string | null) => void;
  onClickUF?: (uf: string) => void;
  // Filtros de faixa: UF que nao bate fica atenuada (dim), sem perder a cor.
  dimUF?: (uf: string) => boolean;
}) {
  const [geos, setGeos] = useState<Geo[] | null>(null);
  const [erro, setErro] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/br-estados.topojson.json");
        if (!r.ok) throw new Error("malha");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const topo: any = await r.json();
        const fc = feature(topo, topo.objects.estados) as unknown as {
          features: {
            properties: { sigla: string };
            geometry: unknown;
          }[];
        };
        const proj = geoMercator().fitExtent(
          [
            [8, 8],
            [W - 8, H - 8],
          ],
          fc as never,
        );
        const path = geoPath(proj);
        const lista: Geo[] = fc.features
          .map((f) => ({
            sigla: f.properties.sigla,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            d: path(f as any) ?? "",
          }))
          .filter((g) => g.d);
        if (vivo) setGeos(lista);
      } catch {
        if (vivo) setErro(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const conteudo = useMemo(
    () => (ufAtivo ? tooltip(ufAtivo) : null),
    [ufAtivo, tooltip],
  );

  if (erro) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-xl border border-black/5 bg-white text-sm text-medio/60">
        Nao foi possivel carregar o mapa.
      </div>
    );
  }

  if (!geos) {
    return (
      <div className="skeleton h-[360px] w-full rounded-xl" aria-hidden />
    );
  }

  return (
    <div
      ref={boxRef}
      className="relative w-full"
      onMouseMove={(e) => {
        const box = boxRef.current?.getBoundingClientRect();
        if (box) setPos({ x: e.clientX - box.left, y: e.clientY - box.top });
      }}
      onMouseLeave={() => {
        onHoverUF(null);
        setPos(null);
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Mapa do Brasil por estado"
      >
        <g>
          {geos.map((g) => {
            const ativo = g.sigla === ufAtivo;
            const atenuado = !ativo && (dimUF?.(g.sigla) ?? false);
            return (
              <path
                key={g.sigla}
                d={g.d}
                fill={cor(g.sigla)}
                stroke={ativo ? "#0f2e2b" : "#ffffff"}
                strokeWidth={ativo ? 1.4 : 0.6}
                className="cursor-pointer transition-[opacity,stroke-width] duration-150"
                style={{
                  opacity: atenuado ? 0.16 : ufAtivo && !ativo ? 0.72 : 1,
                }}
                onMouseEnter={() => onHoverUF(g.sigla)}
                onClick={() => onClickUF?.(g.sigla)}
              />
            );
          })}
        </g>
      </svg>

      {ufAtivo && conteudo && pos && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-lg border border-black/10 bg-white p-3 text-xs shadow-lg"
          style={{
            left: Math.min(pos.x + 14, W + 40),
            top: pos.y + 14,
            transform: pos.x > 260 ? "translateX(-100%)" : undefined,
          }}
        >
          {conteudo}
        </div>
      )}
    </div>
  );
}
