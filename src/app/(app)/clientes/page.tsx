import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ListaClientes } from "@/components/clientes/ListaClientes";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <ListaClientes
        papel={session.user.papel}
        agenteIdAtual={session.user.id}
      />
    </div>
  );
}
