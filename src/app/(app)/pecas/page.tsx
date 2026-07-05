// Aba Pecas (pos-venda): estoque de pecas do catalogo, agrupado por categoria e
// nome. Admin edita/movimenta; usuario pos-venda ve em somente leitura.
import { Pecas } from "@/components/pecas/Pecas";

export const dynamic = "force-dynamic";

export default function PecasPage() {
  return <Pecas />;
}
