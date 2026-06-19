// Pagina da inbox. Server component: pega o id do agente logado (para o filtro
// "Minhas") e renderiza o componente cliente que faz fetch + socket ao vivo.
import { auth } from "@/auth";
import { Inbox } from "@/components/inbox/Inbox";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const session = await auth();
  const agenteId = session?.user.id ?? "";
  return <Inbox agenteIdAtual={agenteId} />;
}
