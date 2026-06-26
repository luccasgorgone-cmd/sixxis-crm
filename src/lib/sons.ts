// Catalogo de sons de alerta pre-definidos (arquivos em /public/sons). Usado no
// admin (selecao + previa) e no cliente (tocar ao surgir alerta de SLA).
export type SomAlerta = { valor: string; rotulo: string; arquivo: string };

export const SONS_ALERTA: SomAlerta[] = [
  { valor: "alerta1", rotulo: "Bip duplo", arquivo: "/sons/alerta1.wav" },
  { valor: "alerta2", rotulo: "Bip grave", arquivo: "/sons/alerta2.wav" },
  { valor: "alerta3", rotulo: "Arpejo", arquivo: "/sons/alerta3.wav" },
  { valor: "alerta4", rotulo: "Triplo agudo", arquivo: "/sons/alerta4.wav" },
  { valor: "alerta5", rotulo: "Sino suave", arquivo: "/sons/alerta5.wav" },
];

export const SOM_PADRAO = "alerta1";

// Caminho do arquivo de um som (com fallback para o padrao).
export function arquivoSom(valor: string | null | undefined): string {
  const s =
    SONS_ALERTA.find((x) => x.valor === valor) ??
    SONS_ALERTA.find((x) => x.valor === SOM_PADRAO)!;
  return s.arquivo;
}
