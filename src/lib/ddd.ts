// Mapa dos 67 DDDs validos do Brasil -> { uf, estado, regiao }. Usado para
// enriquecer o cliente (UF/estado/regiao) e para validar se um "telefone" tem
// cara de numero BR real (o @lid do WhatsApp cai como invalido aqui).

export type InfoDDD = { uf: string; estado: string; regiao: string };

// Definicao compacta por regiao -> UF -> lista de DDDs. Achatada em MAPA abaixo.
const DEFINICAO: {
  regiao: string;
  ufs: { uf: string; estado: string; ddds: number[] }[];
}[] = [
  {
    regiao: "Norte",
    ufs: [
      { uf: "AC", estado: "Acre", ddds: [68] },
      { uf: "AP", estado: "Amapá", ddds: [96] },
      { uf: "AM", estado: "Amazonas", ddds: [92, 97] },
      { uf: "PA", estado: "Pará", ddds: [91, 93, 94] },
      { uf: "RO", estado: "Rondônia", ddds: [69] },
      { uf: "RR", estado: "Roraima", ddds: [95] },
      { uf: "TO", estado: "Tocantins", ddds: [63] },
    ],
  },
  {
    regiao: "Nordeste",
    ufs: [
      { uf: "AL", estado: "Alagoas", ddds: [82] },
      { uf: "BA", estado: "Bahia", ddds: [71, 73, 74, 75, 77] },
      { uf: "CE", estado: "Ceará", ddds: [85, 88] },
      { uf: "MA", estado: "Maranhão", ddds: [98, 99] },
      { uf: "PB", estado: "Paraíba", ddds: [83] },
      { uf: "PE", estado: "Pernambuco", ddds: [81, 87] },
      { uf: "PI", estado: "Piauí", ddds: [86, 89] },
      { uf: "RN", estado: "Rio Grande do Norte", ddds: [84] },
      { uf: "SE", estado: "Sergipe", ddds: [79] },
    ],
  },
  {
    regiao: "Centro-Oeste",
    ufs: [
      { uf: "DF", estado: "Distrito Federal", ddds: [61] },
      { uf: "GO", estado: "Goiás", ddds: [62, 64] },
      { uf: "MT", estado: "Mato Grosso", ddds: [65, 66] },
      { uf: "MS", estado: "Mato Grosso do Sul", ddds: [67] },
    ],
  },
  {
    regiao: "Sudeste",
    ufs: [
      { uf: "ES", estado: "Espírito Santo", ddds: [27, 28] },
      { uf: "MG", estado: "Minas Gerais", ddds: [31, 32, 33, 34, 35, 37, 38] },
      { uf: "RJ", estado: "Rio de Janeiro", ddds: [21, 22, 24] },
      {
        uf: "SP",
        estado: "São Paulo",
        ddds: [11, 12, 13, 14, 15, 16, 17, 18, 19],
      },
    ],
  },
  {
    regiao: "Sul",
    ufs: [
      { uf: "PR", estado: "Paraná", ddds: [41, 42, 43, 44, 45, 46] },
      { uf: "RS", estado: "Rio Grande do Sul", ddds: [51, 53, 54, 55] },
      { uf: "SC", estado: "Santa Catarina", ddds: [47, 48, 49] },
    ],
  },
];

const MAPA: Record<string, InfoDDD> = {};
for (const { regiao, ufs } of DEFINICAO) {
  for (const { uf, estado, ddds } of ufs) {
    for (const ddd of ddds) {
      MAPA[String(ddd)] = { uf, estado, regiao };
    }
  }
}

// Extrai a parte "nacional" (DDD + numero) de um telefone: remove o DDI 55
// quando presente num numero de 12-13 digitos. Retorna null se nao tiver
// comprimento de telefone BR (10 = DDD+8 fixo, 11 = DDD+9 celular).
function parteNacional(telefone: string): string | null {
  let d = (telefone ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    d = d.slice(2);
  }
  return d.length === 10 || d.length === 11 ? d : null;
}

// DDD (2 digitos) de um telefone BR valido, ou null (o @lid cai aqui).
export function dddDe(telefone: string): string | null {
  const nac = parteNacional(telefone);
  if (!nac) return null;
  const ddd = nac.slice(0, 2);
  return MAPA[ddd] ? ddd : null;
}

// Telefone tem cara de numero BR valido? (DDD conhecido + comprimento 10/11).
export function ehTelefoneValidoBR(telefone: string): boolean {
  return dddDe(telefone) != null;
}

export function ufPorTelefone(telefone: string): string | null {
  const ddd = dddDe(telefone);
  return ddd ? MAPA[ddd].uf : null;
}

export function estadoPorTelefone(telefone: string): string | null {
  const ddd = dddDe(telefone);
  return ddd ? MAPA[ddd].estado : null;
}

export function regiaoPorTelefone(telefone: string): string | null {
  const ddd = dddDe(telefone);
  return ddd ? MAPA[ddd].regiao : null;
}

// Info completa por DDD (ex.: "18" -> { uf:"SP", estado:"São Paulo", ... }).
export function infoPorDDD(ddd: string): InfoDDD | null {
  return MAPA[ddd] ?? null;
}
