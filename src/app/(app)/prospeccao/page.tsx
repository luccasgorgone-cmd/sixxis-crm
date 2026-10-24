// Pagina "Prospecção ativa" (Manual Fase 2). Server component: resolve o agente
// logado e repassa ao painel cliente, que faz o fetch, mostra a meta diaria
// (10+10), os contatos por fase e as acoes (tentativa/qualificar/encerrar).
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PainelProspeccao } from "@/components/prospeccao/PainelProspeccao";

export const dynamic = "force-dynamic";

export default async function ProspeccaoPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <PainelProspeccao />
    </div>
  );
}
