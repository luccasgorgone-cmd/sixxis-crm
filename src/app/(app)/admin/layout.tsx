// Layout do painel administrativo. Restrito a ADMIN (alem do middleware).
import { redirect } from "next/navigation";
import { obterSessaoLayout } from "@/lib/autorizacao";
import { AdminNav } from "@/components/admin/AdminNav";
import { obterMarca } from "@/lib/marca";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await obterSessaoLayout();
  if (!session || session.user.papel !== "ADMIN") redirect("/inbox");
  const marca = await obterMarca();
  return (
    <div className="flex h-full min-h-0">
      <AdminNav marca={marca} />
      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
