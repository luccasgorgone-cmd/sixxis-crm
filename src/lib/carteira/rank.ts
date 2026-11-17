// Ordem de progressao do funil da Carteira de Leads + a regra PURA de avanco.
// Separado de sync.ts de proposito: o contrato dourado (c26) trava esta logica
// sem puxar o prisma. `import type` e apagado em runtime -> este arquivo nao tem
// nenhum efeito colateral (nao abre conexao, nao toca rede).
import type { CarteiraStatusContato } from "@/generated/prisma/enums";

// O status so AVANCA, nunca regride:
// - quem ja RESPONDEU nao volta pra EM_ABORDAGEM so porque chegou outra msg;
// - CONVERTIDO (comprou) e o apex — nunca vira DESCARTADO/RESPONDEU por
//   automacao (um ganho que volta a mandar msg NAO e "sem interesse"); alinha
//   com as frentes 3/4 (o negocio permanece GANHO);
// - DESCARTADO (sem interesse) ainda pode subir pra CONVERTIDO se o cliente
//   acabar comprando — o sinal de compra e o mais forte.
export const RANK: Record<CarteiraStatusContato, number> = {
  NOVO: 0,
  EM_ABORDAGEM: 1,
  RESPONDEU: 2,
  DESCARTADO: 3,
  CONVERTIDO: 4,
};

// Regra pura (testavel sem banco — contrato dourado c26): avanca somente se o
// alvo estiver ESTRITAMENTE acima do atual na ordem acima.
export function deveAvancarStatusCarteira(
  atual: CarteiraStatusContato,
  alvo: CarteiraStatusContato,
): boolean {
  return RANK[alvo] > RANK[atual];
}
