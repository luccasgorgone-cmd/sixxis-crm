// Leitura/escrita da config EDITÁVEL do Supervisor (limiares + varredura), que
// vive na linha única de SupervisorConfig. Separado de ia.ts (que lê provider/
// modelo/limiares para a chamada do LLM) porque aqui o foco é o que o gestor e a
// ferramenta `definir_config` editam. NUNCA mexe em provider/modelo — essas são
// trocadas por outro caminho (decisão de infra), não pela aba Configurações.
import { prisma } from "../prisma";
import type { Prisma } from "../../generated/prisma/client";
import {
  resolverLimiares,
  resolverVarredura,
  type ConfigEditavel,
} from "./tipos";

// Lê a config editável resolvida (defaults seguros quando ausente/parcial).
export async function carregarConfigEditavel(): Promise<ConfigEditavel> {
  const row = await prisma.supervisorConfig
    .findFirst({
      select: { limiaresJson: true, varreduraJson: true },
      orderBy: { atualizadoEm: "desc" },
    })
    .catch(() => null);
  return {
    limiares: resolverLimiares(row?.limiaresJson),
    varredura: resolverVarredura(row?.varreduraJson),
  };
}

// Cliente Prisma OU client de transação (para gravar config + auditoria juntos).
type DbCliente = typeof prisma | Prisma.TransactionClient;

// Persiste a config editável na linha única. Preserva provider/modelo (só
// atualiza os dois JSONs). Cria a linha se ainda não existir. `atualizadoEm` é
// @updatedAt — o Prisma cuida. Aceita um client de transação para operar junto
// com a trilha de auditoria. Retorna o valor gravado (resolvido de volta).
export async function salvarConfigEditavel(
  valor: ConfigEditavel,
  db: DbCliente = prisma,
): Promise<ConfigEditavel> {
  const limiaresJson = valor.limiares as unknown as Prisma.InputJsonValue;
  const varreduraJson = valor.varredura as unknown as Prisma.InputJsonValue;
  const existente = await db.supervisorConfig.findFirst({
    select: { id: true },
    orderBy: { atualizadoEm: "desc" },
  });
  if (existente) {
    await db.supervisorConfig.update({
      where: { id: existente.id },
      data: { limiaresJson, varreduraJson },
    });
  } else {
    await db.supervisorConfig.create({
      data: { limiaresJson, varreduraJson },
    });
  }
  return {
    limiares: resolverLimiares(limiaresJson),
    varredura: resolverVarredura(varreduraJson),
  };
}
