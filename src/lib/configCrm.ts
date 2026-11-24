// Acessor CENTRAL (cacheado) da ConfiguracaoCRM — a linha singleton de config.
// Antes havia varios `prisma.configuracaoCRM.findFirst(...)` espalhados, cada um
// um round-trip ao banco a cada request/mensagem (centenas de milhares de scans
// numa tabela de 1 linha). Aqui vira UMA leitura cacheada por 15s, invalidada
// quando o admin salva. Corta o grosso desse trafego de query.
import { prisma } from "./prisma";
import { cacheTTL, invalidarCache } from "./cache";

const CHAVE = "config-crm";
const TTL_MS = 15_000; // config muda raramente; staleness maxima de 15s e ok

// Linha completa da config (todas as colunas), cacheada. Pode ser null se ainda
// nao houver config criada (mesma semantica do findFirst anterior).
export async function lerConfigCRM() {
  return cacheTTL(CHAVE, TTL_MS, () => prisma.configuracaoCRM.findFirst());
}

// Chamar depois de QUALQUER escrita na ConfiguracaoCRM para refletir na hora.
export function invalidarConfigCRM(): void {
  invalidarCache(CHAVE);
}
