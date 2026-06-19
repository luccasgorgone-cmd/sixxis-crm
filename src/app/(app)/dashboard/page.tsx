// Painel do colaborador (padrao pos-login para nao-admin).
import { DashboardColaborador } from "@/components/dashboard/DashboardColaborador";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <DashboardColaborador />
    </div>
  );
}
