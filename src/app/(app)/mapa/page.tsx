// Mapa de clientes (protegida pelo layout de (app)). Toda a logica fica no
// client component (fetch dos agregados + drawer + edicao inline).
import { MapaClientes } from "@/components/mapa/MapaClientes";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <MapaClientes />
    </div>
  );
}
