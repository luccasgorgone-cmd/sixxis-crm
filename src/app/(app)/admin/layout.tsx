// Layout do painel administrativo. Restrito a ADMIN (alem do middleware).
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session || session.user.papel !== "ADMIN") redirect("/inbox");
  return (
    <div className="flex h-full min-h-0">
      <AdminNav />
      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
