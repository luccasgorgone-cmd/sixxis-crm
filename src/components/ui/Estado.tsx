"use client";

// Estados de tela reutilizaveis: erro (com "tentar de novo") e vazio (ilustracao
// + mensagem). Padronizam o tratamento em todas as listas/telas.
import { AlertTriangle, RotateCw, type LucideIcon } from "lucide-react";

export function EstadoErro({
  mensagem = "Nao foi possivel carregar.",
  onRetry,
  compacto = false,
}: {
  mensagem?: string;
  onRetry?: () => void;
  compacto?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-center ${
        compacto ? "py-8" : "py-16"
      }`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-erro/10">
        <AlertTriangle className="h-6 w-6 text-erro" />
      </div>
      <div>
        <p className="text-sm font-medium text-escuro">Algo deu errado</p>
        <p className="mt-0.5 max-w-xs text-xs text-medio/60">{mensagem}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany"
        >
          <RotateCw className="h-3.5 w-3.5" /> Tentar de novo
        </button>
      )}
    </div>
  );
}

export function EstadoVazio({
  icone: Icone,
  titulo,
  texto,
  acao,
  compacto = false,
}: {
  icone: LucideIcon;
  titulo: string;
  texto?: string;
  acao?: React.ReactNode;
  compacto?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 text-center ${
        compacto ? "py-8" : "py-16"
      }`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tiffany/10">
        <Icone className="h-6 w-6 text-tiffany" />
      </div>
      <p className="text-sm font-medium text-escuro">{titulo}</p>
      {texto && <p className="max-w-xs text-xs text-medio/60">{texto}</p>}
      {acao && <div className="mt-1">{acao}</div>}
    </div>
  );
}
