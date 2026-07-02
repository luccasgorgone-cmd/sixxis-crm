// Aba Trends (protegida pelo layout de (app)). Toda a logica fica no client
// component: hub de atalhos para pesquisa externa (Trends/Shopping/ML/Amazon).
// A integracao ML por API foi desativada da UI (dormante no backend) — 2.45-C.
import { TrendsHub } from "@/components/trends/TrendsHub";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <TrendsHub />
    </div>
  );
}
