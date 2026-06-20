"use client";

// Sistema de toasts global (sucesso/erro/info). Provider no layout do app;
// use o hook useToast() em qualquer componente cliente. Sucesso so em sucesso
// real; erro mostra mensagem clara. Auto-dismiss; empilha no canto inferior dir.
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type Tipo = "sucesso" | "erro" | "info";
type Toast = { id: number; tipo: Tipo; texto: string };

type API = {
  sucesso: (texto: string) => void;
  erro: (texto: string) => void;
  info: (texto: string) => void;
};

const ToastContext = createContext<API | null>(null);

const ESTILO: Record<
  Tipo,
  { Icone: typeof CheckCircle2; cor: string; barra: string }
> = {
  sucesso: { Icone: CheckCircle2, cor: "text-sucesso", barra: "bg-sucesso" },
  erro: { Icone: AlertCircle, cor: "text-erro", barra: "bg-erro" },
  info: { Icone: Info, cor: "text-tiffany", barra: "bg-tiffany" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const remover = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const adicionar = useCallback(
    (tipo: Tipo, texto: string) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, tipo, texto }]);
      setTimeout(() => remover(id), 3800);
    },
    [remover],
  );

  const api: API = {
    sucesso: (t) => adicionar("sucesso", t),
    erro: (t) => adicionar("erro", t),
    info: (t) => adicionar("info", t),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2"
      >
        {toasts.map((t) => {
          const { Icone, cor, barra } = ESTILO[t.tipo];
          return (
            <div
              key={t.id}
              role="status"
              className="toast-in pointer-events-auto flex items-start gap-3 overflow-hidden rounded-xl border border-black/5 bg-white p-3 pl-0 shadow-lg"
            >
              <span className={`h-full w-1 self-stretch rounded-full ${barra}`} />
              <Icone className={`mt-0.5 h-5 w-5 shrink-0 ${cor}`} />
              <p className="min-w-0 flex-1 text-sm text-escuro">{t.texto}</p>
              <button
                onClick={() => remover(t.id)}
                aria-label="Fechar"
                className="rounded-md p-0.5 text-medio/50 hover:bg-black/5 hover:text-escuro"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// Hook de acesso. Fora do provider, vira no-op (nao quebra).
export function useToast(): API {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { sucesso: () => {}, erro: () => {}, info: () => {} };
  }
  return ctx;
}
