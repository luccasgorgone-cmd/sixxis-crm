// Mascara de PII (pure). Aplicada quando a chave NAO tem read:pii.
// Objetivo: manter o dado reconhecivel/util (ultimo pedaco) sem revelar o todo.
// Nunca retorna o valor original; sempre reduz entropia de forma deterministica.

import type { EstiloPii } from "./tipos";

// Telefone: mantem DDD (se houver) e os 4 ultimos digitos: "(11) 9****-1234".
export function mascararTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length < 4) return "****";
  const ultimos = digitos.slice(-4);
  // Tenta reconstruir DDD + primeiro digito do numero quando parece BR.
  if (digitos.length >= 10) {
    const ddd = digitos.slice(digitos.length >= 12 ? 2 : 0, digitos.length >= 12 ? 4 : 2);
    const primeiro = digitos[digitos.length - 9] ?? "9";
    return `(${ddd}) ${primeiro}****-${ultimos}`;
  }
  return `****-${ultimos}`;
}

// Email: 1 char local + *** + dominio completo: "j***@gmail.com".
export function mascararEmail(valor: string): string {
  const at = valor.indexOf("@");
  if (at <= 0) return "***";
  const local = valor.slice(0, at);
  const dominio = valor.slice(at + 1);
  const inicio = local[0] ?? "";
  return `${inicio}***@${dominio}`;
}

// Documento (CPF/CNPJ): mantem so os 2 ultimos digitos: "***.***.**9-01" -> "****-01".
export function mascararDocumento(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length < 2) return "****";
  return `****${digitos.slice(-2)}`;
}

// Endereco: mantem so a 1a palavra (tipo/rua) + reticencias: "Rua ...".
export function mascararEndereco(valor: string): string {
  const limpo = valor.trim();
  if (!limpo) return "";
  const primeira = limpo.split(/\s+/)[0] ?? "";
  return `${primeira} ...`;
}

// Nome: mantem o primeiro nome e inicial do resto: "Luccas G.".
export function mascararNome(valor: string): string {
  const partes = valor.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0];
  const inicial = partes[partes.length - 1][0] ?? "";
  return `${partes[0]} ${inicial}.`;
}

export function mascarar(valor: unknown, estilo: EstiloPii): unknown {
  if (valor === null || valor === undefined) return valor;
  const s = String(valor);
  switch (estilo) {
    case "telefone":
      return mascararTelefone(s);
    case "email":
      return mascararEmail(s);
    case "documento":
      return mascararDocumento(s);
    case "endereco":
      return mascararEndereco(s);
    case "nome":
      return mascararNome(s);
    default:
      return "***";
  }
}
