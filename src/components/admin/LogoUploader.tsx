"use client";

// Upload da logo da empresa: seletor de arquivo + drag-and-drop, preview ao vivo,
// otimizacao NO CLIENTE (raster redimensionado p/ <=512px e comprimido em WEBP;
// SVG sanitizado) e botao Remover. Salva via PUT /api/admin/config. So o servidor
// confia: ele revalida tipo e tamanho.
import { useCallback, useRef, useState } from "react";
import { ImageUp, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

const MAX_LADO = 512; // px no maior lado (raster)
const LIMITE_BYTES = 150 * 1024; // ~150KB final
const ACEITOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

type LogoPronta = { data: string; mime: string };

// Tamanho aproximado (bytes) de um data URL base64.
function bytesDataUrl(url: string): number {
  const b64 = url.split(",")[1] ?? "";
  return Math.floor((b64.length * 3) / 4);
}

// Sanitiza SVG no cliente (espelha o servidor): tira <script>, on* e javascript:.
function sanitizarSvg(svg: string): string | null {
  if (!/<svg[\s>]/i.test(svg)) return null;
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\s*foreignObject[\s\S]*?<\/\s*foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|xlink:href|style)\s*=\s*("|')\s*javascript:[^"']*\2/gi, "")
    .trim();
}

async function otimizarRaster(file: File): Promise<LogoPronta> {
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

  // WEBP em qualidades decrescentes ate caber no limite (mantem transparencia).
  for (const q of [0.92, 0.85, 0.75, 0.65, 0.5]) {
    const url = canvas.toDataURL("image/webp", q);
    if (url.startsWith("data:image/webp") && bytesDataUrl(url) <= LIMITE_BYTES) {
      return { data: url, mime: "image/webp" };
    }
  }
  // Fallback PNG (alguns browsers nao exportam webp).
  const png = canvas.toDataURL("image/png");
  if (bytesDataUrl(png) <= LIMITE_BYTES) return { data: png, mime: "image/png" };
  throw new Error("Imagem muito complexa; tente uma versao mais simples ou menor.");
}

async function prepararArquivo(file: File): Promise<LogoPronta> {
  const tipo = file.type || "";
  const ehSvg = tipo === "image/svg+xml" || /\.svg$/i.test(file.name);
  if (!ehSvg && !ACEITOS.includes(tipo)) {
    throw new Error("Use PNG, JPG, WEBP ou SVG.");
  }
  if (ehSvg) {
    const txt = await file.text();
    const limpo = sanitizarSvg(txt);
    if (!limpo) throw new Error("SVG invalido.");
    if (new Blob([limpo]).size > LIMITE_BYTES) {
      throw new Error("SVG muito grande (limite ~150KB).");
    }
    return { data: limpo, mime: "image/svg+xml" };
  }
  return otimizarRaster(file);
}

// Monta um src exibivel a partir do payload (data URL direto ou SVG cru).
function previewSrc(p: LogoPronta): string {
  if (p.data.startsWith("data:")) return p.data;
  return `data:image/svg+xml;utf8,${encodeURIComponent(p.data)}`;
}

export function LogoUploader({
  temLogo,
  logoEm,
  onChange,
  // Parametrizavel (Fatia 3.17): reusado para a logo do sistema E a do orcamento,
  // sem duplicar. Defaults = logo do sistema (compatibilidade).
  titulo = "Logo da empresa",
  descricao = "PNG ou SVG com fundo transparente, usada em todo o sistema.",
  previewUrl = (v: number) => `/api/logo?v=${v}`,
  fundoPreview = "escuro",
  corpoSalvar = (data: string, mime: string) => ({ logoData: data, logoMime: mime }),
  corpoRemover = () => ({ removerLogo: true }),
}: {
  temLogo: boolean;
  logoEm: number;
  onChange: () => void;
  titulo?: string;
  descricao?: string;
  previewUrl?: (v: number) => string;
  fundoPreview?: "escuro" | "claro";
  corpoSalvar?: (data: string, mime: string) => Record<string, unknown>;
  corpoRemover?: () => Record<string, unknown>;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // Payload preparado e aguardando salvar (preview local).
  const [pendente, setPendente] = useState<LogoPronta | null>(null);

  const aoSelecionar = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const pronta = await prepararArquivo(file);
        setPendente(pronta);
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
        body: JSON.stringify(corpoSalvar(pendente.data, pendente.mime)),
      });
      if (r.ok) {
        setPendente(null);
        toast.sucesso("Logo atualizada");
        onChange();
      } else {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel salvar a logo.");
      }
    } catch {
      toast.erro("Falha de rede ao salvar a logo.");
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
        body: JSON.stringify(corpoRemover()),
      });
      if (r.ok) {
        setPendente(null);
        toast.sucesso("Logo removida");
        onChange();
      } else {
        toast.erro("Nao foi possivel remover a logo.");
      }
    } catch {
      toast.erro("Falha de rede ao remover a logo.");
    } finally {
      setSalvando(false);
    }
  }

  // Fonte do preview: pendente (local) > logo salva (servidor) > nada.
  const srcAtual = pendente
    ? previewSrc(pendente)
    : temLogo
      ? previewUrl(logoEm)
      : null;
  const claro = fundoPreview === "claro";

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-escuro">{titulo}</p>
      <p className="mb-2 text-xs text-medio/60">{descricao}</p>

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
            Arraste uma imagem ou clique para enviar
          </p>
          <p className="text-xs text-medio/50">PNG, JPG, WEBP ou SVG ate ~150KB</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
            className="hidden"
            onChange={(e) => {
              void aoSelecionar(e.target.files?.[0]);
              e.target.value = ""; // permite reenviar o mesmo arquivo
            }}
          />
        </div>

        {/* Preview ao vivo */}
        <div className="flex w-full flex-col items-center gap-2 sm:w-48">
          <div
            className={`flex h-28 w-full items-center justify-center rounded-xl border border-black/5 p-3 ${
              claro ? "bg-white" : "bg-escuro"
            }`}
          >
            {srcAtual ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={srcAtual}
                alt="Pre-visualizacao da logo"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className={`flex flex-col items-center gap-1 ${claro ? "text-black/30" : "text-white/40"}`}>
                <ImageUp className="h-6 w-6" />
                <span className="text-xs">Sem logo</span>
              </span>
            )}
          </div>
          <p className="text-[11px] text-medio/50">
            {claro ? "Pré-visualização sobre fundo claro (como no PDF)" : "Pré-visualização sobre fundo escuro"}
          </p>
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
          {temLogo ? "Salvar nova logo" : "Salvar logo"}
        </button>
        {(temLogo || pendente) && (
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
