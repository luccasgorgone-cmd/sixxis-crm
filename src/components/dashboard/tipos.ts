// Tipos compartilhados pelos dashboards (espelham as APIs de metricas).

export type Metricas = {
  clientesAtendidos: number;
  abertos: number;
  pendentes: number;
  finalizados: number;
  ganhos: number;
  perdidos: number;
  conversao: number;
  valorVendido: number;
  ticketMedio: number;
  msgEnviadas: number;
  msgRecebidas: number;
  tempoPrimeiraRespostaSeg: number;
  tempoResolucaoSeg: number;
};

export type PontoTendencia = {
  dia: string;
  atendimentos: number;
  fechamentos: number;
};

export type FiltroValor =
  | { periodo: string }
  | { inicio: string; fim: string };

export function queryDoFiltro(f: FiltroValor): string {
  const p = new URLSearchParams();
  if ("periodo" in f) p.set("periodo", f.periodo);
  else {
    p.set("inicio", f.inicio);
    p.set("fim", f.fim);
  }
  return p.toString();
}
