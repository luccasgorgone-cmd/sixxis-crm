// Helpers de lembrete: limites do dia no fuso e classificacao por janela
// (vencidos / hoje / proximos). Reusado pelas rotas e pelo contador do sino.
const FUSO = "America/Sao_Paulo";

// Fim do dia de hoje (23:59:59.999) no fuso, como instante real (UTC). Idioma
// padrao: reinterpreta o "relogio de parede" do fuso e reaplica o offset.
export function fimDoDia(fuso = FUSO, agora = new Date()): Date {
  const wall = new Date(agora.toLocaleString("en-US", { timeZone: fuso }));
  const diff = agora.getTime() - wall.getTime();
  wall.setHours(23, 59, 59, 999);
  return new Date(wall.getTime() + diff);
}

export type Janela = "vencidos" | "hoje" | "proximos";

// Classifica um lembrete PENDENTE pela sua dataHora.
export function janelaDe(
  dataHora: Date,
  agora = new Date(),
  fimHoje = fimDoDia(FUSO, agora),
): Janela {
  if (dataHora.getTime() < agora.getTime()) return "vencidos";
  if (dataHora.getTime() <= fimHoje.getTime()) return "hoje";
  return "proximos";
}
