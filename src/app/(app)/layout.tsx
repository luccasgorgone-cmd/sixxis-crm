// Layout da area autenticada: sidebar + topbar + conteudo. Busca a sessao no
// servidor (o middleware ja protege, isto e a segunda barreira).
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { ToastProvider } from "@/components/ui/Toast";
import { obterMarca } from "@/lib/marca";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const marca = await obterMarca();

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-fundo">
        <Sidebar papel={session.user.papel} marca={marca} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            nome={session.user.name}
            papel={session.user.papel}
            agenteId={session.user.id}
          />
          <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
