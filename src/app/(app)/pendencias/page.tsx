// Pagina "Pendencias" (Fatia 3.17). Server component: gate de sessao + papel;
// o componente cliente faz o fetch da API agregada e os filtros.
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PainelPendencias } from "@/components/pendencias/PainelPendencias";

export const dynamic = "force-dynamic";

export default async function PendenciasPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <PainelPendencias ehAdmin={session.user.papel === "ADMIN"} />
    </div>
  );
}
