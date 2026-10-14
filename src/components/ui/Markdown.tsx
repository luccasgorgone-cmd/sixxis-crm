"use client";

// Renderizador de markdown MÍNIMO e SEGURO (sem dependência externa, sem
// dangerouslySetInnerHTML). Constrói nós React a partir do texto — o React já
// escapa todo conteúdo de texto, então não há vetor de XSS. Suporta o subconjunto
// que a IA usa: títulos (#, ##, ###), negrito (**), itálico (* ou _), código
// inline (`), blocos de código (```), listas (- / * / 1.), citações (>), links
// [texto](url) (só http/https ou caminho interno) e parágrafos.
import { Fragment, type ReactNode } from "react";

// ── Inline: negrito, itálico, código, link. Entre marcadores, texto puro. ──
const RE_INLINE =
  /(`[^`]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*|_[^_\n]+_)|(\[[^\]\n]+\]\([^)\n]+\))/g;

function linkSeguro(url: string): string | null {
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return u; // caminho interno do próprio app
  return null; // bloqueia javascript:, data:, etc.
}

function parseInline(texto: string, chave: string): ReactNode[] {
  const nos: ReactNode[] = [];
  let ultimo = 0;
  let i = 0;
  for (const m of texto.matchAll(RE_INLINE)) {
    const idx = m.index ?? 0;
    if (idx > ultimo) nos.push(texto.slice(ultimo, idx));
    const tok = m[0];
    const k = `${chave}-${i++}`;
    if (m[1]) {
      nos.push(
        <code
          key={k}
          className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em] text-escuro"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      nos.push(
        <strong key={k} className="font-semibold text-escuro">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (m[3]) {
      nos.push(
        <em key={k}>{tok.slice(1, -1)}</em>,
      );
    } else if (m[4]) {
      const corte = tok.indexOf("](");
      const rotulo = tok.slice(1, corte);
      const url = linkSeguro(tok.slice(corte + 2, -1));
      nos.push(
        url ? (
          <a
            key={k}
            href={url}
            className="text-tiffany underline underline-offset-2 hover:text-tiffany-escuro"
          >
            {rotulo}
          </a>
        ) : (
          rotulo
        ),
      );
    }
    ultimo = idx + tok.length;
  }
  if (ultimo < texto.length) nos.push(texto.slice(ultimo));
  return nos;
}

type Bloco =
  | { tipo: "h"; nivel: number; texto: string }
  | { tipo: "p"; texto: string }
  | { tipo: "ul"; itens: string[] }
  | { tipo: "ol"; itens: string[] }
  | { tipo: "quote"; texto: string }
  | { tipo: "code"; texto: string };

function parseBlocos(fonte: string): Bloco[] {
  const linhas = fonte.replace(/\r\n/g, "\n").split("\n");
  const blocos: Bloco[] = [];
  let paragrafo: string[] = [];

  const fechaParagrafo = () => {
    if (paragrafo.length) {
      blocos.push({ tipo: "p", texto: paragrafo.join(" ") });
      paragrafo = [];
    }
  };

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];

    // Bloco de código cercado por ```
    if (/^\s*```/.test(linha)) {
      fechaParagrafo();
      const buf: string[] = [];
      i++;
      while (i < linhas.length && !/^\s*```/.test(linhas[i])) buf.push(linhas[i++]);
      blocos.push({ tipo: "code", texto: buf.join("\n") });
      continue;
    }

    const h = linha.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      fechaParagrafo();
      blocos.push({ tipo: "h", nivel: h[1].length, texto: h[2] });
      continue;
    }

    if (/^\s*[-*]\s+/.test(linha)) {
      fechaParagrafo();
      const itens: string[] = [];
      while (i < linhas.length && /^\s*[-*]\s+/.test(linhas[i])) {
        itens.push(linhas[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      i--;
      blocos.push({ tipo: "ul", itens });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(linha)) {
      fechaParagrafo();
      const itens: string[] = [];
      while (i < linhas.length && /^\s*\d+\.\s+/.test(linhas[i])) {
        itens.push(linhas[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      i--;
      blocos.push({ tipo: "ol", itens });
      continue;
    }

    if (/^\s*>\s?/.test(linha)) {
      fechaParagrafo();
      blocos.push({ tipo: "quote", texto: linha.replace(/^\s*>\s?/, "") });
      continue;
    }

    if (linha.trim() === "") {
      fechaParagrafo();
      continue;
    }

    paragrafo.push(linha.trim());
  }
  fechaParagrafo();
  return blocos;
}

export function Markdown({ texto, className }: { texto: string; className?: string }) {
  const blocos = parseBlocos(texto ?? "");
  return (
    <div className={`space-y-2 leading-relaxed ${className ?? ""}`}>
      {blocos.map((b, i) => {
        const k = `b${i}`;
        switch (b.tipo) {
          case "h": {
            const cls =
              b.nivel === 1
                ? "text-base font-semibold text-escuro"
                : b.nivel === 2
                  ? "text-sm font-semibold text-escuro"
                  : "text-sm font-medium text-escuro";
            return (
              <p key={k} className={`${cls} first:mt-0`}>
                {parseInline(b.texto, k)}
              </p>
            );
          }
          case "ul":
            return (
              <ul key={k} className="list-disc space-y-1 pl-5">
                {b.itens.map((it, j) => (
                  <li key={j}>{parseInline(it, `${k}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={k} className="list-decimal space-y-1 pl-5">
                {b.itens.map((it, j) => (
                  <li key={j}>{parseInline(it, `${k}-${j}`)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={k}
                className="border-l-2 border-tiffany/40 pl-3 text-medio"
              >
                {parseInline(b.texto, k)}
              </blockquote>
            );
          case "code":
            return (
              <pre
                key={k}
                className="scroll-fino overflow-x-auto rounded-lg bg-black/5 p-2.5 font-mono text-[0.8em] text-escuro"
              >
                <code>{b.texto}</code>
              </pre>
            );
          default:
            return (
              <p key={k}>
                {b.texto.split("\n").map((ln, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {parseInline(ln, `${k}-${j}`)}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
