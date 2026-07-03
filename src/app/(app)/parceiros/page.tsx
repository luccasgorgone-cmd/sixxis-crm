// Aba "Parceiros" (pos-venda): tecnicos parceiros pelo Brasil, no formato do mapa.
// Entidade isolada — nao entra em metricas/funil de venda.
import { auth } from "@/auth";
import { Parceiros } from "@/components/parceiros/Parceiros";

export const dynamic = "force-dynamic";

export default async function ParceirosPage() {
  const session = await auth();
  const papel = session?.user.papel ?? "VENDEDOR";
  return <Parceiros papel={papel} />;
}
