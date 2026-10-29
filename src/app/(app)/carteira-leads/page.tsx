// Pagina "Carteira de Leads" (prospeccao B2B por lista). Server component:
// so exige login e repassa papel/id ao painel cliente, que faz o fetch, filtra
// e ativa contatos. Admin ve tudo pelo painel /admin/carteira-leads.
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PainelCarteiraLeads } from "@/components/carteira-leads/PainelCarteiraLeads";

export const dynamic = "force-dynamic";

export default async function CarteiraLeadsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <PainelCarteiraLeads ehAdmin={session.user.papel === "ADMIN"} />
    </div>
  );
}
