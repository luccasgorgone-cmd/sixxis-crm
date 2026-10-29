// Manual de Atendimento: referencia operacional (padrao, regras, tempo, metricas)
// com duas abas (Venda / Pos-venda). Pagina estatica — sem dado, sem schema.
import { ManualAtendimento } from "@/components/manual/ManualAtendimento";

export default function Page() {
  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <ManualAtendimento />
    </div>
  );
}
