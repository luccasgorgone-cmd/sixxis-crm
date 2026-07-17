"use client";

// Tabela ordenavel generica. Cada coluna define como exibir (render) e como
// ordenar (sortValue). Clicar no cabecalho alterna asc/desc. Cores da marca.
import { useState, useMemo, type ReactNode } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export type Coluna<T> = {
  chave: string;
  rotulo: string;
  align?: "left" | "right" | "center";
  // valor para ordenar (numero ou string). Ausente = coluna nao ordenavel.
  sortValue?: (linha: T) => number | string;
  // cabecalho custom (ex.: checkbox mestre). Substitui o rotulo/botao de ordem.
  cabecalho?: () => ReactNode;
  render: (linha: T) => ReactNode;
};

export function TabelaOrdenavel<T>({
  colunas,
  dados,
  chaveLinha,
  ordemInicial,
  onLinha,
}: {
  colunas: Coluna<T>[];
  dados: T[];
  chaveLinha: (linha: T) => string;
  ordemInicial?: { chave: string; dir: 1 | -1 };
  onLinha?: (linha: T) => void;
}) {
  const [ordem, setOrdem] = useState<{ chave: string; dir: 1 | -1 } | null>(
    ordemInicial ?? null,
  );

  const ordenados = useMemo(() => {
    if (!ordem) return dados;
    const col = colunas.find((c) => c.chave === ordem.chave);
    if (!col?.sortValue) return dados;
    const sv = col.sortValue;
    return [...dados].sort((a, b) => {
      const va = sv(a);
      const vb = sv(b);
      if (typeof va === "number" && typeof vb === "number") {
        return (va - vb) * ordem.dir;
      }
      return String(va).localeCompare(String(vb)) * ordem.dir;
    });
  }, [dados, ordem, colunas]);

  function alternar(chave: string) {
    setOrdem((o) =>
      o && o.chave === chave
        ? { chave, dir: (o.dir * -1) as 1 | -1 }
        : { chave, dir: -1 },
    );
  }

  const alinhar = (a?: string) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className="overflow-x-auto rounded-xl border border-black/5 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-black/5 text-left text-xs uppercase tracking-wide text-medio/50">
          <tr>
            {colunas.map((c) => {
              const ativa = ordem?.chave === c.chave;
              return (
                <th key={c.chave} className={`px-3 py-2.5 font-medium ${alinhar(c.align)}`}>
                  {c.cabecalho ? (
                    c.cabecalho()
                  ) : c.sortValue ? (
                    <button
                      onClick={() => alternar(c.chave)}
                      aria-label={`Ordenar por ${c.rotulo}`}
                      className={`inline-flex items-center gap-1 transition-colors hover:text-escuro ${
                        ativa ? "text-tiffany" : ""
                      } ${c.align === "right" ? "flex-row-reverse" : ""}`}
                    >
                      {c.rotulo}
                      {ativa ? (
                        ordem!.dir === -1 ? (
                          <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUp className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.rotulo
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenados.map((linha) => (
            <tr
              key={chaveLinha(linha)}
              onClick={onLinha ? () => onLinha(linha) : undefined}
              className={`border-b border-black/5 last:border-0 ${
                onLinha ? "cursor-pointer hover:bg-fundo" : ""
              }`}
            >
              {colunas.map((c) => (
                <td key={c.chave} className={`px-3 py-2.5 ${alinhar(c.align)}`}>
                  {c.render(linha)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
