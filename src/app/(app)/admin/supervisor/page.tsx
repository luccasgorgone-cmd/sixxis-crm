// Supervisor Comercial IA (SPEC §7): console SÓ do admin. Camada 3 (UI). O painel
// determinístico (Camada 1) e o chat com o consultor interno (Camada 2) vivem no
// mesmo lugar; as ações que a IA sugere só saem do papel com clique do gestor.
import { redirect } from "next/navigation";
import { obterAdmin } from "@/lib/autorizacao";
import { SupervisorConsole } from "@/components/supervisor/SupervisorConsole";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Guarda de servidor: a página inteira é admin-only (as rotas também validam).
  const admin = await obterAdmin();
  if (!admin) redirect("/inbox");
  return <SupervisorConsole />;
}
