"use client";

// Upload do favicon do CRM: seletor de arquivo + drag-and-drop, preview ao vivo,
// otimizacao NO CLIENTE (PNG redimensionado p/ <=256px, transparencia mantida) e
// botao Remover. Salva via PUT /api/admin/config. Aceita SOMENTE PNG; o servidor
// revalida tipo e tamanho (ate ~1MB).
import { useCallback, useRef, useState } from "react";
import { ImageUp, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

const MAX_LADO = 256; // px no maior lado (favicon)
const LIMITE_BYTES = 1024 * 1024; // ~1MB (espelha o servidor)

// Tamanho aproximado (bytes) de um data URL base64.
function bytesDataUrl(url: string): number {
  const b64 = url.split(",")[1] ?? "";
  return Math.floor((b64.length * 3) / 4);
}

// Redimensiona para PNG <=256px mantendo transparencia.
async function prepararPng(file: File): Promise<string> {
  const tipo = file.type || "";
  const ehPng = tipo === "image/png" || /\.png$/i.test(file.name);
  if (!ehPng) throw new Error("Use um arquivo PNG.");
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Nao foi possivel processar a imagem.");
  ctx.clearRect(0, 0, w, h); // preserva transparencia
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const png = canvas.toDataURL("image/png");
  if (bytesDataUrl(png) > LIMITE_BYTES) {
    throw new Error("Imagem muito grande; use uma menor.");
  }
  return png;
}

export function FaviconUploader({
  temFavicon,
  faviconEm,
  onChange,
}: {
  temFavicon: boolean;
  faviconEm: number;
  onChange: () => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [pendente, setPendente] = useState<string | null>(null);

  const aoSelecionar = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        setPendente(await prepararPng(file));
      } catch (e) {
        toast.erro(e instanceof Error ? e.message : "Arquivo invalido.");
      }
    },
    [toast],
  );

  async function salvar() {
    if (!pendente) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faviconData: pendente, faviconMime: "image/png" }),
      });
      if (r.ok) {
        setPendente(null);
        toast.sucesso("Favicon atualizado");
        onChange();
      } else {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel salvar o favicon.");
      }
    } catch {
      toast.erro("Falha de rede ao salvar o favicon.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    setSalvando(true);
    try {
      const r = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removerFavicon: true }),
      });
      if (r.ok) {
        setPendente(null);
        toast.sucesso("Favicon removido");
        onChange();
      } else {
        toast.erro("Nao foi possivel remover o favicon.");
      }
    } catch {
      toast.erro("Falha de rede ao remover o favicon.");
    } finally {
      setSalvando(false);
    }
  }

  // Fonte do preview: pendente (local) > favicon salvo (servidor) > nada.
  const srcAtual = pendente
    ? pendente
    : temFavicon
      ? `/api/favicon?v=${faviconEm}`
      : null;

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-escuro">Favicon</p>
      <p className="mb-2 text-xs text-medio/60">
        Icone da aba do navegador. PNG (idealmente quadrado, fundo transparente).
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* Area de drop / clique */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            void aoSelecionar(e.dataTransfer.files?.[0]);
          }}
          className={`flex min-h-28 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
            arrastando
              ? "border-tiffany bg-tiffany/5"
              : "border-black/10 hover:border-tiffany/60 hover:bg-black/[0.02]"
          }`}
        >
          <UploadCloud className="h-6 w-6 text-medio/50" />
          <p className="text-sm font-medium text-escuro">
            Arraste um PNG ou clique para enviar
          </p>
          <p className="text-xs text-medio/50">PNG ate ~1MB</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,.png"
            className="hidden"
            onChange={(e) => {
              void aoSelecionar(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        {/* Preview ao vivo */}
        <div className="flex w-full flex-col items-center gap-2 sm:w-48">
          <div className="flex h-28 w-full items-center justify-center rounded-xl border border-black/5 bg-white p-3">
            {srcAtual ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={srcAtual}
                alt="Pre-visualizacao do favicon"
                className="h-12 w-12 object-contain"
              />
            ) : (
              <span className="flex flex-col items-center gap-1 text-medio/40">
                <ImageUp className="h-6 w-6" />
                <span className="text-xs">Sem favicon</span>
              </span>
            )}
          </div>
          <p className="text-[11px] text-medio/50">Como aparece na aba</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={!pendente || salvando}
          className="flex items-center gap-2 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-50"
        >
          {salvando && pendente && <Loader2 className="h-4 w-4 animate-spin" />}
          {temFavicon ? "Salvar novo favicon" : "Salvar favicon"}
        </button>
        {(temFavicon || pendente) && (
          <button
            type="button"
            onClick={() => (pendente ? setPendente(null) : void remover())}
            disabled={salvando}
            className="flex items-center gap-2 rounded-lg border border-black/10 px-4 py-2 text-sm font-medium text-medio hover:bg-black/5 hover:text-erro disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {pendente ? "Descartar" : "Remover"}
          </button>
        )}
      </div>
    </div>
  );
}
