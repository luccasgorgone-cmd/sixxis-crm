import { redirect } from "next/navigation";
import { auth } from "@/auth";

// A raiz leva o ADMIN para a inbox e o colaborador para o seu painel.
export default async function Home() {
  const session = await auth();
  if (session?.user.papel === "ADMIN") redirect("/inbox");
  redirect("/dashboard");
}
