// Pagina do Kanban. Server component: resolve papel + id do agente logado e
// repassa ao quadro cliente (que faz fetch + DnD + socket).
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Kanban } from "@/components/kanban/Kanban";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return (
    <Kanban papel={session.user.papel} agenteIdAtual={session.user.id} />
  );
}
