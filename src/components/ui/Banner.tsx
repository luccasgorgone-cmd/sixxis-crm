// Banner de aviso discreto (ambar). Usado para sinalizar estados que pedem
// atencao do admin sem bloquear a tela (ex.: nenhum colaborador ativo).
import { AlertTriangle } from "lucide-react";

export function BannerAviso({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 ${className}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
