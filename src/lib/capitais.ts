// Coordenadas geograficas (lat/lon) das capitais das 27 UFs do Brasil. Usado
// pela Inteligencia Regional para consultar o clima por estado (Open-Meteo).
// A "capital" e o ponto de referencia climatico de cada UF.

export type Capital = { capital: string; lat: number; lon: number };

export const CAPITAIS: Record<string, Capital> = {
  AC: { capital: "Rio Branco", lat: -9.97, lon: -67.81 },
  AL: { capital: "Maceió", lat: -9.67, lon: -35.74 },
  AP: { capital: "Macapá", lat: 0.03, lon: -51.07 },
  AM: { capital: "Manaus", lat: -3.12, lon: -60.02 },
  BA: { capital: "Salvador", lat: -12.97, lon: -38.51 },
  CE: { capital: "Fortaleza", lat: -3.73, lon: -38.52 },
  DF: { capital: "Brasília", lat: -15.79, lon: -47.88 },
  ES: { capital: "Vitória", lat: -20.32, lon: -40.34 },
  GO: { capital: "Goiânia", lat: -16.68, lon: -49.25 },
  MA: { capital: "São Luís", lat: -2.53, lon: -44.3 },
  MT: { capital: "Cuiabá", lat: -15.6, lon: -56.1 },
  MS: { capital: "Campo Grande", lat: -20.44, lon: -54.65 },
  MG: { capital: "Belo Horizonte", lat: -19.92, lon: -43.94 },
  PA: { capital: "Belém", lat: -1.46, lon: -48.5 },
  PB: { capital: "João Pessoa", lat: -7.12, lon: -34.86 },
  PR: { capital: "Curitiba", lat: -25.43, lon: -49.27 },
  PE: { capital: "Recife", lat: -8.05, lon: -34.88 },
  PI: { capital: "Teresina", lat: -5.09, lon: -42.8 },
  RJ: { capital: "Rio de Janeiro", lat: -22.91, lon: -43.17 },
  RN: { capital: "Natal", lat: -5.79, lon: -35.21 },
  RS: { capital: "Porto Alegre", lat: -30.03, lon: -51.23 },
  RO: { capital: "Porto Velho", lat: -8.76, lon: -63.9 },
  RR: { capital: "Boa Vista", lat: 2.82, lon: -60.67 },
  SC: { capital: "Florianópolis", lat: -27.6, lon: -48.55 },
  SP: { capital: "São Paulo", lat: -23.55, lon: -46.63 },
  SE: { capital: "Aracaju", lat: -10.95, lon: -37.07 },
  TO: { capital: "Palmas", lat: -10.18, lon: -48.33 },
};
