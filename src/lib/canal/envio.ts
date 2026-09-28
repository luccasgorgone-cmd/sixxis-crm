// F2 — fachada de saida do atendimento omnichannel.
//
// enviarPeloCanal e a UNICA porta de saida: recebe a CONTA ja escolhida, o
// destino e a saida canonica, confere se a conta suporta aquela saida e delega
// ao adaptador do provedor. O CloudApiAdapter entra so registrando outro
// provider aqui (F4) — nenhum chamador muda.
//
// A ESCOLHA da conta a partir da conversa (fixada / ultima usada / padrao da
// finalidade) depende da coluna `provider` em InstanciaWhatsApp (F3) e vive num
// resolvedor separado; esta fachada recebe a conta ja resolvida para ficar pura
// e testavel sem banco.
import { adapterEnvioCloud } from "./cloudApiAdapter";
import { adapterEnvioEvolution } from "./evolutionAdapter";
import type {
  CanalAdapterEnvio,
  CapacidadesCanal,
  ContaCanal,
  IdentidadeExterna,
  Provider,
  ResultadoEnvioCanonico,
  SaidaCanonica,
} from "./tipos";

// Registro de adaptadores de envio por provedor. CLOUD_API entra registrado no
// F4, mas so envia com uma ContaCanal CLOUD_API + token no ambiente (retorna
// CONFIG_AUSENTE sem tocar a rede ate o piloto). SANDBOX segue sem adaptador.
const REGISTRO_ENVIO: Partial<Record<Provider, CanalAdapterEnvio>> = {
  EVOLUTION: adapterEnvioEvolution,
  CLOUD_API: adapterEnvioCloud,
};

export function resolverAdapterEnvio(
  provider: Provider,
): CanalAdapterEnvio | null {
  return REGISTRO_ENVIO[provider] ?? null;
}

// Builders para os chamadores atuais (F2b): eles so tem a string da instancia
// Evolution e o telefone do destino. Ate o roteador real por numero (F5, que le
// InstanciaWhatsApp.provider e escolhe Evolution vs Cloud), toda saida continua
// pela Evolution — comportamento IDENTICO ao envio direto de hoje.
//
// `finalidade` NAO e lida no caminho de saida da Evolution (o adaptador ignora);
// so passa a importar quando o Cloud entrar, e ai a ContaCanal vira do resolver
// de F5 com a finalidade correta. Default "VENDA" e placeholder inofensivo aqui.
export function contaEvolution(
  instancia: string | null | undefined,
  finalidade: ContaCanal["finalidade"] = "VENDA",
): ContaCanal {
  // refExterna "" preserva o fallback atual: enviar* faz `instancia || env`, ou
  // seja instancia ausente cai em process.env.EVOLUTION_INSTANCE como hoje.
  const ref = instancia ?? "";
  return { id: ref, provider: "EVOLUTION", finalidade, refExterna: ref };
}

// Destino 1:1 a partir do telefone ja normalizado (so digitos, como os
// chamadores montam hoje antes de chamar a Evolution).
export function destinoTelefone(numero: string): IdentidadeExterna {
  return { tipo: "TELEFONE", valor: numero, telefone: numero };
}

// externalId retornado no sucesso; undefined caso contrario. Existe porque o
// ResultadoEnvioCanonico e uma uniao discriminada (externalId so no ramo ok),
// enquanto os chamadores fazem `externalId ?? fallback` sem checar ok — este
// helper preserva exatamente esse comportamento (falha -> undefined -> fallback).
export function externalIdEnviado(r: ResultadoEnvioCanonico): string | undefined {
  return r.ok ? r.externalId : undefined;
}

// PURO: a conta escolhida suporta esta saida? Retorna a falha tipada quando nao,
// senao null. Evita tentar (e falhar) no canal — ex.: um provedor sem midia.
export function checarCapacidade(
  cap: CapacidadesCanal,
  saida: SaidaCanonica,
): ResultadoEnvioCanonico | null {
  const precisaMidia =
    saida.tipo === "IMAGEM" ||
    saida.tipo === "VIDEO" ||
    saida.tipo === "DOCUMENTO";
  if (precisaMidia && !cap.midia) {
    return {
      ok: false,
      motivo: "CAPACIDADE_AUSENTE",
      detalhe: `${saida.tipo} nao suportado por este canal`,
    };
  }
  if (saida.tipo === "AUDIO" && !cap.audioPTT) {
    return {
      ok: false,
      motivo: "CAPACIDADE_AUSENTE",
      detalhe: "audio nao suportado por este canal",
    };
  }
  if (saida.tipo === "CONTATO" && !cap.contato) {
    return {
      ok: false,
      motivo: "CAPACIDADE_AUSENTE",
      detalhe: "contato nao suportado por este canal",
    };
  }
  return null;
}

export async function enviarPeloCanal(
  conta: ContaCanal,
  destino: IdentidadeExterna,
  saida: SaidaCanonica,
): Promise<ResultadoEnvioCanonico> {
  const adapter = resolverAdapterEnvio(conta.provider);
  if (!adapter) {
    return {
      ok: false,
      motivo: "CONFIG_AUSENTE",
      detalhe: `sem adaptador de envio para o provider ${conta.provider}`,
    };
  }
  const semCapacidade = checarCapacidade(adapter.capacidades, saida);
  if (semCapacidade) return semCapacidade;
  return adapter.enviar(conta, destino, saida);
}
