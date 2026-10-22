"use client";

// Modal de inatividade da presenca: aparece apos 15 min sem atividade e conta
// 1 min; se nao confirmar, o vendedor vai para offline automaticamente.
// Apenas apresentacional — o timer/estado vive no TogglePresenca.
export function ModalInatividade({
  aberto,
  segundos,
  onContinuar,
  onOffline,
}: {
  aberto: boolean;
  segundos: number;
  onContinuar: () => void;
  onOffline: () => void;
}) {
  if (!aberto) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar presenca"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-black/5 bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-escuro">
          Você ainda está online?
        </h2>
        <p className="mt-1.5 text-sm text-medio">
          Sem atividade há um tempo. Em{" "}
          <strong className="text-escuro">{segundos}s</strong> você fica{" "}
          <strong>offline</strong> automaticamente e para de receber novos leads.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onContinuar}
            className="flex-1 rounded-lg bg-tiffany px-3 py-2 text-sm font-medium text-white hover:bg-tiffany/90"
          >
            Continuo online
          </button>
          <button
            onClick={onOffline}
            className="rounded-lg border border-black/10 px-3 py-2 text-sm font-medium text-medio hover:bg-black/[0.03]"
          >
            Ficar offline
          </button>
        </div>
      </div>
    </div>
  );
}
