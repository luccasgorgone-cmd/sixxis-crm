// Template inicial da base de conhecimento de produtos da Luna. Traz a ESTRUTURA
// com os produtos reais do catalogo Sixxis e os campos a preencher — SEM dados
// tecnicos inventados. O dono edita no admin com os dados reais; o motor injeta
// o texto no prompt. NAO usar como fonte de specs enquanto estiver com "___".

const PRODUTOS_CLIMATIZADORES = [
  "M45",
  "SX040 Trend",
  "SX060 Prime",
  "SX070 Trend",
  "SX100 Trend",
  "SX120 Prime",
  "SX180 Trend",
  "SX200 Trend",
  "SX200 Prime",
];
const PRODUTOS_BIKES = ["Sixxis Life", "Sixxis Cardio"];
const PRODUTOS_ASPIRADORES = ["Bravo v2"];

function blocoProduto(nome: string): string {
  return [
    `### ${nome}`,
    "- Area recomendada: ___",
    "- Diferenciais: ___",
    "- Preco / faixa: ___",
    "- Observacoes: ___",
  ].join("\n");
}

export const TEMPLATE_BASE_CONHECIMENTO = [
  "# Base de conhecimento de produtos Sixxis (PREENCHER com dados reais)",
  "",
  "Atencao (dono): preencha os campos com '___' com as informacoes REAIS de cada",
  "produto. Enquanto estiverem em branco, a Luna nao devera afirmar especificacoes",
  "— ela foi instruida a NAO inventar dados. Descreva as diferencas entre os",
  "modelos e a orientacao de qual indicar por tamanho de area.",
  "",
  "## Climatizadores",
  ...PRODUTOS_CLIMATIZADORES.map(blocoProduto),
  "",
  "### Como indicar por tamanho de area",
  "- Ate ___ m2: ___",
  "- De ___ a ___ m2: ___",
  "- Acima de ___ m2: ___",
  "",
  "## Bikes de Spinning",
  ...PRODUTOS_BIKES.map(blocoProduto),
  "",
  "## Aspiradores",
  ...PRODUTOS_ASPIRADORES.map(blocoProduto),
  "",
].join("\n");
