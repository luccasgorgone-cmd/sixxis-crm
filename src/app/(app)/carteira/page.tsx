// Pagina "Minha carteira". Server component: resolve papel/id do agente logado
// e seus acessos (para o alternador Venda/Pos-venda) e repassa ao componente
// cliente, que faz o fetch, drilldown e abertura do painel do cliente.
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MinhaCarteira } from "@/components/carteira/MinhaCarteira";

export const dynamic = "force-dynamic";

export default async function CarteiraPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const eu = await prisma.agente.findUnique({
    where: { id: session.user.id },
    select: { acessoVenda: true, acessoPosVenda: true },
  });

  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <MinhaCarteira
        papel={session.user.papel}
        agenteIdAtual={session.user.id}
        acessoVenda={eu?.acessoVenda ?? false}
        acessoPosVenda={eu?.acessoPosVenda ?? false}
      />
    </div>
  );
}
