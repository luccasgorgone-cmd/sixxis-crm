// Aba Orcamentos (Fatia 3.07): lista gerencial dos orcamentos-decisao. O escopo
// (admin ve tudo; demais so os seus) e aplicado na API.
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AbaOrcamentos } from "@/components/orcamentos/AbaOrcamentos";

export const dynamic = "force-dynamic";

export default async function OrcamentosPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return <AbaOrcamentos ehAdmin={session.user.papel === "ADMIN"} />;
}
