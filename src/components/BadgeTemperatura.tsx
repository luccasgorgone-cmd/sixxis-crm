// Badge de temperatura padronizado (Quente/Morno/Frio), com cor de estado.
// Variante "pill" (rotulo + ponto) ou "ponto" (so a bolinha, com title).
import { TEMPERATURA_INFO, type Temperatura } from "./kanban/tipos";

export function BadgeTemperatura({
  temperatura,
  variante = "pill",
  className = "",
}: {
  temperatura: Temperatura;
  variante?: "pill" | "ponto";
  className?: string;
}) {
  const info = TEMPERATURA_INFO[temperatura];
  if (variante === "ponto") {
    return (
      <span
        title={info.rotulo}
        className={`inline-block h-2.5 w-2.5 rounded-full ${info.ponto} ${className}`}
      />
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium ${info.cor} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${info.ponto}`} />
      {info.rotulo}
    </span>
  );
}
