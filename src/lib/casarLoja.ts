// Casamento do catalogo do CRM com a grafia da Loja: os 12 produtos vendidos no
// site precisam ter `modelo` preenchido (chave do casamento item-do-pedido ->
// produto do catalogo) e `categoria` padronizada.
//
// FONTE UNICA do mapa e da simulacao. Consumido por:
//   - GET/POST /api/admin/catalogo/casar-loja  (tela do admin, no navegador)
//   - scripts/preencherModeloCatalogo.ts       (mesma coisa pelo terminal)
//
// A regra de seguranca vive aqui (funcao PURA, sem banco): se algum dos 12 nomes
// nao casar por nome EXATO, ou se houver nome duplicado, `ok` e false — e quem
// grava NAO grava NADA (nem os que casaram). Meia-gravacao deixaria o catalogo
// num estado que ninguem sabe explicar.

export type AlvoCasar = { modelo: string; categoria: string };

// Chave = NOME EXATO do produto no catalogo do CRM. Valor = grafia da Loja.
// O "Climatizador SX120 Prime" so casa depois do seed que o cadastra
// (seedProdutoSX120Prime); o "Climatizador SX120" antigo NAO entra aqui.
export const MAPA_CASAR_LOJA: Record<string, AlvoCasar> = {
  "Aspirador Vertical Sixxis Bravo S2": { modelo: "Bravo S2", categoria: "Aspirador" },
  "Bicicleta Ergométrica Spinning Sixxis Cardio": {
    modelo: "Spinning Cardio",
    categoria: "Bike Spinning",
  },
  "Bicicleta Spinning Sixxis Life": { modelo: "Spinning Life", categoria: "Bike Spinning" },
  "Climatizador M45 Trend": { modelo: "M45 Trend", categoria: "Climatizador" },
  "Climatizador SX040 Trend": { modelo: "SX040 Trend", categoria: "Climatizador" },
  "Climatizador SX060 Prime": { modelo: "SX060 Prime", categoria: "Climatizador" },
  "Climatizador SX070 Trend": { modelo: "SX070 Trend", categoria: "Climatizador" },
  "Climatizador SX100 Trend": { modelo: "SX100 Trend", categoria: "Climatizador" },
  "Climatizador SX120 Prime": { modelo: "SX120 Prime", categoria: "Climatizador" },
  "Climatizador SX180 Trend": { modelo: "SX180 Trend", categoria: "Climatizador" },
  "Climatizador SX200 Prime": { modelo: "SX200 Prime", categoria: "Climatizador" },
  "Climatizador SX200 Trend": { modelo: "SX200 Trend", categoria: "Climatizador" },
};

export const NOMES_CASAR_LOJA = Object.keys(MAPA_CASAR_LOJA);

export type ProdutoParaCasar = {
  id: string;
  nome: string;
  modelo: string | null;
  categoria: string | null;
};

export type LinhaCasamento = {
  id: string;
  nome: string;
  modeloAtual: string | null;
  modeloNovo: string;
  categoriaAtual: string | null;
  categoriaNova: string;
  // true = a gravacao mudaria alguma coluna (false = ja esta como deve ficar).
  muda: boolean;
};

export type Simulacao = {
  linhas: LinhaCasamento[];
  // Nomes do mapa sem produto correspondente (grafia divergente no catalogo).
  faltando: string[];
  // Nomes do mapa com mais de um produto (ambiguo demais para gravar as cegas).
  duplicados: string[];
  esperados: number;
  casados: number;
  mudariam: number;
  // Unico criterio de "pode gravar": os 12 casaram e nenhum esta duplicado.
  ok: boolean;
};

// PURA: recebe os PRODUTOs do catalogo cujo nome esta no mapa e devolve o
// "de -> para" + o veredito. Nao consulta nem grava nada.
export function simularCasamento(produtos: ProdutoParaCasar[]): Simulacao {
  const doMapa = produtos.filter((p) => MAPA_CASAR_LOJA[p.nome] !== undefined);

  const contagem = new Map<string, number>();
  for (const p of doMapa) contagem.set(p.nome, (contagem.get(p.nome) ?? 0) + 1);

  const faltando = NOMES_CASAR_LOJA.filter((n) => !contagem.has(n));
  const duplicados = NOMES_CASAR_LOJA.filter((n) => (contagem.get(n) ?? 0) > 1);

  const linhas: LinhaCasamento[] = doMapa
    .map((p) => {
      const alvo = MAPA_CASAR_LOJA[p.nome];
      return {
        id: p.id,
        nome: p.nome,
        modeloAtual: p.modelo,
        modeloNovo: alvo.modelo,
        categoriaAtual: p.categoria,
        categoriaNova: alvo.categoria,
        muda: (p.modelo ?? "") !== alvo.modelo || (p.categoria ?? "") !== alvo.categoria,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    linhas,
    faltando,
    duplicados,
    esperados: NOMES_CASAR_LOJA.length,
    casados: contagem.size,
    mudariam: linhas.filter((l) => l.muda).length,
    ok: faltando.length === 0 && duplicados.length === 0,
  };
}
