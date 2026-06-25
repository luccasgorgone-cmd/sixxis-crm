import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Agenda } from "@/components/agenda/Agenda";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return <Agenda />;
}
