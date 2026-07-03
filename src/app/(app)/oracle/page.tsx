// Aba "Oracle": chat com o agente de inteligencia de gestao. Visivel a todos os
// papeis logados; o CONTEUDO respeita o escopo do usuario (aplicado no motor).
import { auth } from "@/auth";
import { ChatOracle } from "@/components/oracle/ChatOracle";

export const dynamic = "force-dynamic";

export default async function OraclePage() {
  const session = await auth();
  const papel = session?.user.papel ?? "VENDEDOR";
  return <ChatOracle papel={papel} />;
}
