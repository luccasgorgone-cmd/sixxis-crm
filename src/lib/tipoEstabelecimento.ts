// Tipo de estabelecimento do cliente — FONTE ÚNICA da lista (ordem + rótulos PT),
// usada pela UI (options do select no BlocoCliente) e pela validação da rota
// PATCH /api/leads/[id]. Seleção única; lista fixa; OUTRO como escape. O enum
// TipoEstabelecimento (prisma) é a verdade dos valores válidos.
import { TipoEstabelecimento } from "../generated/prisma/enums";

export const TIPOS_ESTABELECIMENTO: {
  valor: TipoEstabelecimento;
  rotulo: string;
}[] = [
  { valor: TipoEstabelecimento.RESTAURANTE, rotulo: "Restaurante" },
  { valor: TipoEstabelecimento.BAR, rotulo: "Bar" },
  { valor: TipoEstabelecimento.ACADEMIA, rotulo: "Academia" },
  { valor: TipoEstabelecimento.ACADEMIA_LUTA, rotulo: "Academia de luta" },
  { valor: TipoEstabelecimento.LOJA_CARRO, rotulo: "Loja de carro" },
  { valor: TipoEstabelecimento.OFICINA_MECANICA, rotulo: "Oficina mecânica" },
  { valor: TipoEstabelecimento.LOJA_ROUPA, rotulo: "Loja de roupa" },
  { valor: TipoEstabelecimento.MALHARIA, rotulo: "Malharia" },
  { valor: TipoEstabelecimento.SERRALHERIA, rotulo: "Serralheria" },
  { valor: TipoEstabelecimento.AREA_LAZER, rotulo: "Área de lazer" },
  { valor: TipoEstabelecimento.SALAO_FESTAS, rotulo: "Salão de festas" },
  { valor: TipoEstabelecimento.MATERIAL_ELETRICO, rotulo: "Loja de material elétrico" },
  { valor: TipoEstabelecimento.SUPERMERCADO, rotulo: "Supermercado" },
  { valor: TipoEstabelecimento.MERCEARIA, rotulo: "Mercearia" },
  { valor: TipoEstabelecimento.ACOUGUE, rotulo: "Açougue" },
  { valor: TipoEstabelecimento.VAREJO_BAIRRO, rotulo: "Loja de bairro (varejo geral)" },
  { valor: TipoEstabelecimento.PADARIA, rotulo: "Padaria" },
  { valor: TipoEstabelecimento.LANCHONETE, rotulo: "Lanchonete / Pizzaria / Hamburgueria" },
  { valor: TipoEstabelecimento.HORTIFRUTI, rotulo: "Hortifruti / Sacolão" },
  { valor: TipoEstabelecimento.DISTRIBUIDORA_BEBIDAS, rotulo: "Distribuidora de bebidas / Adega" },
  { valor: TipoEstabelecimento.PET_SHOP, rotulo: "Pet shop" },
  { valor: TipoEstabelecimento.FARMACIA, rotulo: "Farmácia / Drogaria" },
  { valor: TipoEstabelecimento.SALAO_BELEZA, rotulo: "Salão de beleza / Barbearia" },
  { valor: TipoEstabelecimento.MOVEIS_DECORACAO, rotulo: "Loja de móveis / Decoração" },
  { valor: TipoEstabelecimento.HOTEL_POUSADA, rotulo: "Hotel / Pousada" },
  { valor: TipoEstabelecimento.POSTO_CONVENIENCIA, rotulo: "Posto / Conveniência" },
  { valor: TipoEstabelecimento.OUTRO, rotulo: "Outro" },
];

const ROTULO_POR_VALOR = new Map(
  TIPOS_ESTABELECIMENTO.map((t) => [t.valor, t.rotulo]),
);

// Rótulo PT de um valor do enum (ou string vazia se null/desconhecido).
export function rotuloTipoEstabelecimento(
  v: TipoEstabelecimento | null | undefined,
): string {
  return v ? ROTULO_POR_VALOR.get(v) ?? "" : "";
}

// True se o valor bruto (ex.: body de request) e um TipoEstabelecimento valido.
export function ehTipoEstabelecimentoValido(
  v: unknown,
): v is TipoEstabelecimento {
  return typeof v === "string" && ROTULO_POR_VALOR.has(v as TipoEstabelecimento);
}
