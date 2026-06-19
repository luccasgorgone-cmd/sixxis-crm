// Cliente server-side da API interna da loja. A chave (STORE_INTERNAL_KEY)
// NUNCA vai para o browser: so e usada aqui, no servidor.
// Tipos espelham o contrato de /api/interno/* da loja.

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

export type ItemPedidoLoja = { nome: string; qtd: number; preco: number };
export type PedidoLoja = {
  id: string;
  numero: string;
  status: string;
  total: number;
  criadoEm: string;
  itens: ItemPedidoLoja[];
  rastreio: { transportadora?: string; link?: string } | null;
};
export type ClienteLoja = {
  cliente: { nome: string; email: string; telefone: string | null } | null;
  pedidos: PedidoLoja[];
  carrinho: ItemPedidoLoja[] | null;
};

function baseConfig(): { base: string; key: string } | null {
  const base = process.env.STORE_API_URL;
  const key = process.env.STORE_INTERNAL_KEY;
  if (!base || !key) return null;
  return { base: base.replace(/\/$/, ""), key };
}

// Chamada generica a loja. Lanca em falha de rede/config/HTTP.
async function chamar<T>(caminho: string): Promise<T> {
  const cfg = baseConfig();
  if (!cfg) throw new Error("loja nao configurada");
  const resp = await fetch(`${cfg.base}${caminho}`, {
    headers: { "x-internal-key": cfg.key },
    // Sempre fresco; o cache de produtos e feito em memoria aqui no CRM.
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`loja respondeu ${resp.status}`);
  return (await resp.json()) as T;
}

// ---- Produtos com cache curto em memoria (por termo de busca) ----
type Entrada = { dados: ProdutoLoja[]; expira: number };
const cacheProdutos = new Map<string, Entrada>();
const TTL_MS = 5 * 60 * 1000;

export async function buscarProdutos(busca: string): Promise<ProdutoLoja[]> {
  const chave = busca.trim().toLowerCase();
  const agora = Date.now();
  const cacheado = cacheProdutos.get(chave);
  if (cacheado && cacheado.expira > agora) return cacheado.dados;

  const qs = chave ? `?busca=${encodeURIComponent(chave)}` : "";
  const d = await chamar<{ produtos: ProdutoLoja[] }>(
    `/api/interno/produtos${qs}`,
  );
  const dados = d.produtos ?? [];
  cacheProdutos.set(chave, { dados, expira: agora + TTL_MS });
  return dados;
}

export async function buscarCliente(telefone: string): Promise<ClienteLoja> {
  return chamar<ClienteLoja>(
    `/api/interno/cliente?telefone=${encodeURIComponent(telefone)}`,
  );
}
