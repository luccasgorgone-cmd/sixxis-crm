// Inteligencia Regional (protegida pelo layout de (app)). Toda a logica de
// dados/mapa fica no client component.
import { InteligenciaRegional } from "@/components/inteligencia/InteligenciaRegional";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <InteligenciaRegional />
    </div>
  );
}
