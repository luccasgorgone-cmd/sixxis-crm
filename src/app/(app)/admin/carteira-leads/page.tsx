// Painel ADMIN / SUPERVISOR da Carteira de Leads: metricas agregadas (por
// vendedor, status global, ativados hoje). So ADMIN. O detalhe contato-a-contato
// (com reatribuicao) fica em /carteira-leads, que o admin ve por inteiro.
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PainelAdminCarteira } from "@/components/carteira-leads/PainelAdminCarteira";

export const dynamic = "force-dynamic";

export default async function AdminCarteiraLeadsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.papel !== "ADMIN") redirect("/carteira-leads");
  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <PainelAdminCarteira />
    </div>
  );
}
