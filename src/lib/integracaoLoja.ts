// Camada de integracao com a LOJA, isolada para nao acoplar o CRM ao e-commerce
// nem a um ERP futuro. Hoje envolve a ponte loja existente (lib/loja); amanha um
// ERP pode implementar a mesma interface. Degrada gracioso: offline -> vazio.
import { buscarCliente } from "./loja";

export function lojaConfigurada(): boolean {
  return !!process.env.STORE_API_URL && !!process.env.STORE_INTERNAL_KEY;
}

// O cliente (por telefone) tem ao menos um pedido na loja? Best-effort: qualquer
// erro/offline retorna false (nao quebra a campanha).
export async function clienteTemPedido(telefone: string): Promise<boolean> {
  if (!lojaConfigurada()) return false;
  try {
    const r = await buscarCliente(telefone);
    return (r.pedidos?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// Limite de verificacoes na loja por campanha (evita varredura cara). Acima
// disso o filtro "tem pedido" e ignorado e sinalizado.
export const LIMITE_CHECK_LOJA = Number(process.env.LOJA_CHECK_LIMITE ?? 300);
