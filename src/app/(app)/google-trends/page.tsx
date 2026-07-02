// Aba Google Trends (protegida pelo layout de (app)). Toda a logica fica no
// client component (links externos + Mercado Livre + demanda interna).
import { TrendsHub } from "@/components/trends/TrendsHub";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <TrendsHub />
    </div>
  );
}
