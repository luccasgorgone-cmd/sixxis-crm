// Base de conhecimento de produtos da Luna, com DADOS REAIS extraidos do site
// oficial (sixxis.com.br). Documento estruturado em PT-BR para a Luna consultar e
// recomendar por tamanho de area. EDITAVEL NO ADMIN (Agente IA > Base de
// conhecimento): reflete o site na data da extracao — o dono deve manter
// atualizado. O motor (lib/luna) injeta este texto no prompt.
//
// Nota de dado: "Sixxis Cardio" ainda nao tem pagina publica no site; os campos
// ficam marcados como a confirmar e a Luna e instruida a NAO inventar specs dele.
export const TEMPLATE_BASE_CONHECIMENTO = `# Base de conhecimento de produtos Sixxis

Fonte: site oficial sixxis.com.br (dados na data da extracao). Este documento e
editavel no admin e deve ser mantido atualizado. Precos sao "a partir de" —
sempre confirmar valor e frete final com o vendedor. NUNCA prometer preco fechado
ou prazo que nao conste aqui.

## Climatizadores evaporativos
Regra geral: o numero do modelo corresponde, na pratica, a area maxima em m2. A
linha PRIME e superior (motor inversor, mais economia e potencia/tanque); a linha
TREND e a de entrada. Todos os climatizadores sao 110V/220V (confirmar a voltagem
do local do cliente).

### M45 Trend
- Cobre ate 45 m2. Tanque 45 L. Potencia 180 W. Vazao 5.500 m3/h.
- A partir de R$ 1.000. 110V/220V. Entrada, compacto.

### SX040 Trend
- Cobre ate 45 m2. Tanque 45 L. Potencia 180 W. Vazao 5.500 m3/h.
- A partir de R$ 1.500. 110V/220V.

### SX060 Prime
- Cobertura estimada ~60 m2. Tanque 60 L. Vazao ~6.000 m3/h.
- Potencia 125 W com motor Inversor + Corrente Alternada (economico).
- A partir de R$ 2.750. 110V/220V.

### SX070 Trend
- Cobre ate 70 m2. Tanque 70 L. Potencia 280 W. Vazao 8.000 m3/h.
- A partir de R$ 1.900. 110V/220V.

### SX100 Trend
- Cobre ate 100 m2. Tanque 100 L. Potencia 400 W. Vazao 12.000 m3/h.
- A partir de R$ 2.900. 110V/220V.

### SX120 Prime
- Cobre ate 140 m2. Tanque 120 L. Potencia 450 W. Vazao 14.000 m3/h.
- A partir de R$ 4.750. 220V.

### SX180 Trend
- Cobre ate 180 m2. Tanque 130 L. Potencia 680 W. Vazao 18.000 m3/h.
- A partir de R$ 4.750. 220V.

### SX200 Trend
- Cobre ate 175 m2. Tanque 175 L. Potencia 750 W. Vazao 20.000 m3/h.
- A partir de R$ 5.750. 220V.

### SX200 Prime
- Cobre ate 250 m2. Tanque 200 L. Vazao 25.000 m3/h.
- A partir de R$ 8.500. 220V. Topo de linha — grandes areas e galpoes.

### Como recomendar um climatizador
- Pergunte a area do ambiente em m2 e recomende o MENOR modelo que cobre a area
  com folga.
- Se o cliente quer economia de energia, destaque a linha PRIME (motor inversor).
- Sempre mencione que o modelo atende 110V/220V e confirme a voltagem do local.
- Exemplos: sala de ~60 m2 -> SX070 Trend (cobre ate 70); galpao de ~200 m2 ->
  SX200 Prime (cobre ate 250); ambiente pequeno de ~40 m2 -> M45 Trend ou SX040.

## Aspirador

### Bravo S2 (Aspirador Vertical Sixxis)
- Vertical de mao, sem fio. Motor de alta rotacao com succao constante ate a
  bateria zerar (nao perde forca com o tanque cheio).
- Filtro HEPA que retem 99,9% de acaros e polen.
- A partir de R$ 500. Bivolt.

## Bikes de Spinning

### Sixxis Life
- Bicicleta de spinning semi-profissional. Resistencia magnetica ajustavel em 10
  niveis. Queima ate 600 cal/h. Baixo impacto nas articulacoes.
- A partir de R$ 2.849. Bivolt.

### Sixxis Cardio
- DADOS A CONFIRMAR: ainda nao ha pagina publica no site com as especificacoes
  deste modelo. NAO afirme specs, preco ou capacidade do Cardio. Se o cliente
  perguntar, diga que vai confirmar os detalhes com um atendente.

## Observacoes gerais de atendimento
- Voltagem: climatizadores sao 110V/220V; aspirador (Bravo S2) e spinning (Sixxis
  Life) sao bivolt.
- Precos sao "a partir de" — o valor final e o frete sao confirmados com o
  vendedor. Nunca feche preco nem prometa prazo que nao esteja aqui.
`;
