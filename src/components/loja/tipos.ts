// Tipos da loja consumidos pela UI do CRM (espelham o proxy /api/loja/*).
export type ProdutoLoja = {
  id: string;
  nome: string;
  slug: string;
  url: string;
  preco: number;
  precoPromo: number | null;
  imagem: string | null;
  categoria: string;
  ativo: boolean;
};

export type ItemLoja = { nome: string; qtd: number; preco: number };

export type PedidoLoja = {
  id: string;
  numero: string;
  status: string;
  total: number;
  criadoEm: string;
  itens: ItemLoja[];
  rastreio: { transportadora?: string; link?: string } | null;
};

export type ClienteLoja = {
  cliente: { nome: string; email: string; telefone: string | null } | null;
  pedidos: PedidoLoja[];
  carrinho: ItemLoja[] | null;
  offline?: boolean;
};
