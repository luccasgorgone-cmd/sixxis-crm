"use client";

// Envolve um bloco e o revela (fade + slide) quando entra na viewport, via
// IntersectionObserver. Uso: <Reveal delay={80}><Card/></Reveal>. O atraso
// escalona a entrada de listas/grades sem custo de bibliotecas de animacao.
import { useEffect, useRef, useState } from "react";

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            setVisivel(true);
            obs.disconnect();
          }
        }
      },
      { threshold: 0.08 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`revelavel ${visivel ? "revelar" : ""} ${className}`}
      style={visivel && delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
