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

// Persiste a config editável na linha única. Preserva provider/modelo (só
// atualiza os dois JSONs). Cria a linha se ainda não existir. `atualizadoEm` é
// @updatedAt — o Prisma cuida. Retorna o valor gravado (resolvido de volta).
export async function salvarConfigEditavel(
  valor: ConfigEditavel,
): Promise<ConfigEditavel> {
  const limiaresJson = valor.limiares as unknown as Prisma.InputJsonValue;
  const varreduraJson = valor.varredura as unknown as Prisma.InputJsonValue;
  const existente = await prisma.supervisorConfig.findFirst({
    select: { id: true },
    orderBy: { atualizadoEm: "desc" },
  });
  if (existente) {
    await prisma.supervisorConfig.update({
      where: { id: existente.id },
      data: { limiaresJson, varreduraJson },
    });
  } else {
    await prisma.supervisorConfig.create({
      data: { limiaresJson, varreduraJson },
    });
  }
  return {
    limiares: resolverLimiares(limiaresJson),
    varredura: resolverVarredura(varreduraJson),
  };
}
